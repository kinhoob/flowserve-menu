
-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_restaurant_idx on public.categories(restaurant_id, position);
alter table public.categories enable row level security;

create policy "categories_select_own" on public.categories for select to authenticated
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "categories_insert_own" on public.categories for insert to authenticated
  with check (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "categories_update_own" on public.categories for update to authenticated
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "categories_delete_own" on public.categories for delete to authenticated
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create trigger categories_updated_at before update on public.categories
  for each row execute function public.tg_set_updated_at();

-- Menu Items
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null default 0 check (price >= 0),
  image_url text,
  position integer not null default 0,
  is_available boolean not null default true,
  dietary_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_restaurant_idx on public.menu_items(restaurant_id);
create index menu_items_category_idx on public.menu_items(category_id, position);
alter table public.menu_items enable row level security;

create policy "menu_items_select_own" on public.menu_items for select to authenticated
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "menu_items_insert_own" on public.menu_items for insert to authenticated
  with check (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "menu_items_update_own" on public.menu_items for update to authenticated
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "menu_items_delete_own" on public.menu_items for delete to authenticated
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create trigger menu_items_updated_at before update on public.menu_items
  for each row execute function public.tg_set_updated_at();

-- Storage bucket for menu images (public read)
insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

create policy "menu_images_public_read" on storage.objects for select
  using (bucket_id = 'menu-images');
create policy "menu_images_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "menu_images_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "menu_images_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and auth.uid()::text = (storage.foldername(name))[1]);
