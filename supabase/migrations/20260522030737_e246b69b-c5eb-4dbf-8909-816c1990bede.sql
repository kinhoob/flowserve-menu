
drop policy if exists "Anyone can create orders" on public.orders;
create policy "Anyone can create orders for an existing restaurant"
on public.orders for insert to anon, authenticated
with check (exists (select 1 from public.restaurants r where r.id = restaurant_id));
