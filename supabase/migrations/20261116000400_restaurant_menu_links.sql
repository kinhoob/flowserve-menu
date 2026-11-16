-- Human-readable menu addresses with permanent aliases for existing QR codes.
CREATE TABLE public.restaurant_slug_aliases (
 slug text PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE
);
ALTER TABLE public.restaurant_slug_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_slug_aliases FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.restaurant_name_slug(p_name text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 WITH normalized AS (
  SELECT rtrim(left(trim(both '-' from regexp_replace(lower(regexp_replace(normalize(coalesce(p_name,''),NFKD),U&'[\0300-\036f]','','g')),'[^a-z0-9]+','-','g')),64),'-') AS slug
 ) SELECT CASE WHEN slug='' THEN 'restaurante' WHEN char_length(slug)<3 THEN slug||'-restaurante' ELSE slug END FROM normalized;
$$;
CREATE OR REPLACE FUNCTION public.preserve_restaurant_slug() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE base text; candidate text; suffix integer:=1; automatic boolean; old_slug text;
BEGIN
 old_slug:=CASE WHEN TG_OP='UPDATE' THEN OLD.slug ELSE '' END;
 automatic:=TG_OP='INSERT' OR (NEW.slug=old_slug AND NEW.slug ~ '^r-[0-9a-f]{10}(-[0-9]+)?$') OR (TG_OP='UPDATE' AND NEW.name IS DISTINCT FROM OLD.name AND NEW.slug=public.restaurant_name_slug(NEW.name));
 IF TG_OP='INSERT' AND (NEW.slug IS NULL OR NEW.slug ~ '^r-[0-9a-f]{10}(-[0-9]+)?$') OR (TG_OP='UPDATE' AND automatic) THEN base:=public.restaurant_name_slug(NEW.name); ELSE base:=NEW.slug; END IF;
 IF base IS NULL OR char_length(base) NOT BETWEEN 3 AND 80 OR base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Use um endereço de 3 a 80 caracteres, com letras minúsculas, números e hífens.' USING ERRCODE='22023'; END IF;
 -- A global namespace lock avoids cross-table alias races and rename deadlocks.
 PERFORM pg_advisory_xact_lock(774416160004::bigint);
 candidate:=base;
 WHILE EXISTS(SELECT 1 FROM restaurants WHERE slug=candidate AND id<>NEW.id) OR EXISTS(SELECT 1 FROM restaurant_slug_aliases WHERE slug=candidate AND restaurant_id<>NEW.id) LOOP
  IF NOT automatic THEN RAISE EXCEPTION 'Este endereço já está em uso. Escolha outro.' USING ERRCODE='23505'; END IF;
  suffix:=suffix+1;candidate:=left(base,79-char_length(suffix::text))||'-'||suffix::text;
 END LOOP;
 IF TG_OP='UPDATE' AND old_slug<>candidate THEN
  INSERT INTO restaurant_slug_aliases(slug,restaurant_id) VALUES(old_slug,NEW.id) ON CONFLICT(slug) DO NOTHING;
 END IF;
 NEW.slug:=candidate;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.preserve_restaurant_slug() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER preserve_restaurant_slug BEFORE INSERT OR UPDATE OF name,slug ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.preserve_restaurant_slug();
CREATE OR REPLACE FUNCTION public.resolve_restaurant_slug(p_slug text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT r.slug FROM restaurants r WHERE r.slug=p_slug
 UNION ALL SELECT r.slug FROM restaurant_slug_aliases a JOIN restaurants r ON r.id=a.restaurant_id WHERE a.slug=p_slug LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.resolve_restaurant_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_restaurant_slug(text) TO anon,authenticated;
UPDATE public.restaurants SET slug=slug WHERE slug ~ '^r-[0-9a-f]{10}(-[0-9]+)?$';

CREATE OR REPLACE FUNCTION public.staff_login(p_slug text,p_pin text)
RETURNS TABLE(token text,staff_id uuid,name text,role text,restaurant_slug text,restaurant_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r record; s record; n integer; v_token text;
BEGIN
  SELECT id,restaurants.name INTO r FROM restaurants WHERE slug=public.resolve_restaurant_slug(p_slug);
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO staff_login_attempts VALUES(r.id,now(),1)
    ON CONFLICT(restaurant_id) DO UPDATE SET
      attempts=CASE WHEN staff_login_attempts.window_started<now()-interval '5 minutes' THEN 1 ELSE staff_login_attempts.attempts+1 END,
      window_started=CASE WHEN staff_login_attempts.window_started<now()-interval '5 minutes' THEN now() ELSE staff_login_attempts.window_started END
    RETURNING attempts INTO n;
  -- Return an empty result on failure: raising would roll back the attempt counter.
  IF n>30 OR p_pin IS NULL OR p_pin !~ '^\d{4}$' THEN RETURN; END IF;
  SELECT sm.* INTO s FROM staff_members sm WHERE sm.restaurant_id=r.id AND sm.active AND sm.pin_hash IS NOT NULL
    AND extensions.crypt(p_pin,sm.pin_hash)=sm.pin_hash LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO staff_sessions(token,staff_id,restaurant_id,expires_at) VALUES(v_token,s.id,r.id,now()+interval '12 hours');
  RETURN QUERY SELECT v_token,s.id,s.name,s.role,p_slug,r.name;
END $$;


NOTIFY pgrst, 'reload schema';
