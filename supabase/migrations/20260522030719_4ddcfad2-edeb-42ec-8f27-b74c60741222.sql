
-- Função utilitária de updated_at (criar se não existir)
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Enum de status do pedido
do $$ begin
  create type public.order_status as enum ('pending','accepted','preparing','ready','served','cancelled');
exception when duplicate_object then null; end $$;

-- venue_tables
create table if not exists public.venue_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label text not null,
  short_code text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, short_code)
);
create index if not exists venue_tables_restaurant_idx on public.venue_tables(restaurant_id);
alter table public.venue_tables enable row level security;

create policy "Owners can view their tables" on public.venue_tables for select to authenticated
using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "Owners can insert tables" on public.venue_tables for insert to authenticated
with check (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "Owners can update tables" on public.venue_tables for update to authenticated
using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "Owners can delete tables" on public.venue_tables for delete to authenticated
using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create trigger venue_tables_set_updated_at before update on public.venue_tables
for each row execute function public.update_updated_at_column();

-- orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.venue_tables(id) on delete set null,
  table_label text,
  customer_name text,
  status public.order_status not null default 'pending',
  subtotal numeric(10,2) not null default 0,
  currency text not null default 'BRL',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_restaurant_status_idx on public.orders(restaurant_id, status, created_at desc);
alter table public.orders enable row level security;

create policy "Anyone can create orders" on public.orders for insert to anon, authenticated with check (true);
create policy "Owners can read orders" on public.orders for select to authenticated
using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "Owners can update orders" on public.orders for update to authenticated
using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "Owners can delete orders" on public.orders for delete to authenticated
using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create trigger orders_set_updated_at before update on public.orders
for each row execute function public.update_updated_at_column();

-- order_items
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name_snapshot text not null,
  price_snapshot numeric(10,2) not null,
  quantity integer not null default 1,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items(order_id);
alter table public.order_items enable row level security;

create policy "Anyone can insert order items" on public.order_items for insert to anon, authenticated
with check (exists (select 1 from public.orders o where o.id = order_id));
create policy "Owners can read order items" on public.order_items for select to authenticated
using (exists (
  select 1 from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = order_id and r.owner_id = auth.uid()
));
create policy "Owners can delete order items" on public.order_items for delete to authenticated
using (exists (
  select 1 from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = order_id and r.owner_id = auth.uid()
));

-- Leitura pública do cardápio
create policy "Public can read restaurants" on public.restaurants for select to anon, authenticated using (true);
create policy "Public can read categories" on public.categories for select to anon, authenticated using (is_active = true);
create policy "Public can read available menu items" on public.menu_items for select to anon, authenticated using (true);

-- Realtime
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter table public.orders replica identity full;
alter table public.order_items replica identity full;
