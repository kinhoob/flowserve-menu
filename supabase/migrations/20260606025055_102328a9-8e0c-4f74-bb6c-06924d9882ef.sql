create or replace function public.get_restaurant_plan(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.plan_type
  from public.restaurants r
  join public.profiles p on p.id = r.owner_id
  where r.slug = p_slug
  limit 1
$$;
grant execute on function public.get_restaurant_plan(text) to anon, authenticated;