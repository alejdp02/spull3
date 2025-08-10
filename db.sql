-- Supabase schema & RLS for Phoenix Pull

-- Tables
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  active boolean not null default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.quantities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  category text not null,
  item_name text not null,
  qty integer not null default 0,
  restock boolean not null default false,
  updated_at timestamp with time zone default now(),
  unique (user_id, category, item_name)
);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  action text not null,
  payload jsonb
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.quantities enable row level security;
alter table public.interactions enable row level security;

-- Profiles policies
create policy "select own profile or admin sees all" on public.profiles
for select using (
  auth.uid() = id
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "insert own profile" on public.profiles
for insert with check (auth.uid() = id);

create policy "update own profile or admin" on public.profiles
for update using (
  auth.uid() = id
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Quantities policies
create policy "user manages own quantities" on public.quantities
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Interactions policies
create policy "insert logs" on public.interactions
for insert with check (auth.uid() = user_id);

create policy "select own or admin all" on public.interactions
for select using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Helpers
create or replace function public.ensure_profile()
returns trigger as $$
begin
  insert into public.profiles(id, email, display_name, role, active)
  values (new.id, new.email, split_part(new.email, '@', 1), 'user', true)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.ensure_profile();
