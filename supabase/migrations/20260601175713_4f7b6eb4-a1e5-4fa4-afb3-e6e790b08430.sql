ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name, plan_type, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'trial',
    now() + interval '7 days'
  );
  return new;
end;
$function$;

-- Backfill any existing profiles that have NULL/zero trial dates (covered by default, but ensure values present)
UPDATE public.profiles
SET trial_ends_at = COALESCE(trial_ends_at, created_at + interval '7 days'),
    plan_type = COALESCE(NULLIF(plan_type, ''), 'trial')
WHERE trial_ends_at IS NULL OR plan_type IS NULL;