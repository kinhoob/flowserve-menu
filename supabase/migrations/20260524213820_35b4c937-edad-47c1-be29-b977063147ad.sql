
-- Modifier groups
create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  restaurant_id uuid not null,
  name text not null,
  is_required boolean not null default false,
  min_select integer not null default 0,
  max_select integer not null default 1,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_groups(id) on delete cascade,
  name text not null,
  price_delta numeric not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.modifier_groups enable row level security;
alter table public.modifier_options enable row level security;

create policy "Public read modifier groups" on public.modifier_groups
  for select to anon, authenticated using (true);
create policy "Owners manage modifier groups" on public.modifier_groups
  for all to authenticated
  using (exists (select 1 from public.restaurants r where r.id = modifier_groups.restaurant_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.restaurants r where r.id = modifier_groups.restaurant_id and r.owner_id = auth.uid()));

create policy "Public read modifier options" on public.modifier_options
  for select to anon, authenticated using (true);
create policy "Owners manage modifier options" on public.modifier_options
  for all to authenticated
  using (exists (
    select 1 from public.modifier_groups g
    join public.restaurants r on r.id = g.restaurant_id
    where g.id = modifier_options.group_id and r.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.modifier_groups g
    join public.restaurants r on r.id = g.restaurant_id
    where g.id = modifier_options.group_id and r.owner_id = auth.uid()
  ));

create trigger trg_modifier_groups_updated before update on public.modifier_groups
  for each row execute function public.update_updated_at_column();
create trigger trg_modifier_options_updated before update on public.modifier_options
  for each row execute function public.update_updated_at_column();

-- Waiter calls
create table public.waiter_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_label text,
  customer_name text,
  message text,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.waiter_calls enable row level security;

create policy "Anyone can create waiter calls" on public.waiter_calls
  for insert to anon, authenticated
  with check (exists (select 1 from public.restaurants r where r.id = waiter_calls.restaurant_id));

create policy "Owners read waiter calls" on public.waiter_calls
  for select to authenticated
  using (exists (select 1 from public.restaurants r where r.id = waiter_calls.restaurant_id and r.owner_id = auth.uid()));

create policy "Owners update waiter calls" on public.waiter_calls
  for update to authenticated
  using (exists (select 1 from public.restaurants r where r.id = waiter_calls.restaurant_id and r.owner_id = auth.uid()));

create policy "Owners delete waiter calls" on public.waiter_calls
  for delete to authenticated
  using (exists (select 1 from public.restaurants r where r.id = waiter_calls.restaurant_id and r.owner_id = auth.uid()));

alter publication supabase_realtime add table public.waiter_calls;
alter table public.waiter_calls replica identity full;

-- Order item modifiers snapshot
alter table public.order_items add column if not exists modifiers_snapshot jsonb not null default '[]'::jsonb;
