
-- 1) Wipe all test data (cascades from auth.users into profiles, restaurants, menus, orders, etc.)
DELETE FROM auth.users;

-- Safety: also clear any orphans in case foreign keys weren't cascading
TRUNCATE TABLE
  public.order_items,
  public.orders,
  public.waiter_calls,
  public.modifier_options,
  public.modifier_groups,
  public.menu_items,
  public.categories,
  public.venue_tables,
  public.staff_members,
  public.subscriptions,
  public.restaurants,
  public.profiles
RESTART IDENTITY CASCADE;

-- 2) Replace handle_new_user to auto-create a default restaurant
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text;
  v_name text;
BEGIN
  v_name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));

  INSERT INTO public.profiles (id, display_name, plan_type, trial_ends_at)
  VALUES (new.id, v_name, 'trial', now() + interval '7 days');

  -- Generate a unique slug
  v_slug := 'r-' || substr(replace(new.id::text, '-', ''), 1, 10);

  INSERT INTO public.restaurants (owner_id, name, slug, currency)
  VALUES (new.id, 'Meu Restaurante', v_slug, 'BRL')
  ON CONFLICT (slug) DO NOTHING;

  RETURN new;
END;
$function$;

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
