-- ============================================================
-- Fahmi — Supabase schema (production)
-- Run this whole file in the Supabase SQL editor of your project.
-- The app works without it in Demo mode; this is required for
-- live Supabase usage.
--
-- It is safe to re-run: every statement is idempotent.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Profiles (one row per auth user; created automatically)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text default '',
  role text not null default 'viewer' check (role in ('admin', 'manager', 'payment_officer', 'viewer')),
  pin text default '',                    -- optional per-user sign-in PIN (defaults: admin 82000, manager 83000)
  created_at timestamptz not null default now()
);
-- Add the pin column to existing installs (idempotent).
alter table public.profiles add column if not exists pin text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.raw_user_meta_data ->> 'role', 'viewer'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- Shops (building-wide registry)
-- ------------------------------------------------------------
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text default '',
  tenant_name text default '',
  tenant_phone text default '',
  rent_amount numeric(12, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'released', 'vacant')),
  registered_month text not null,          -- 'YYYY-MM' rent accrues from this month
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Payments (rent collections; reversals keep the audit trail)
-- ------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  amount numeric(12, 2) not null,
  month text not null,                      -- 'YYYY-MM' the month being paid for
  period_from date,                         -- the period this payment covers (start)
  period_upto date,                         -- the period this payment covers (end)
  date date not null default current_date,
  method text default 'Cash',
  reference text default '',
  note text default '',
  reversed boolean not null default false,
  reversed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payments_shop_month_idx on public.payments (shop_id, month);
create index if not exists payments_month_idx on public.payments (month);
-- Add the period columns to existing installs (idempotent).
alter table public.payments add column if not exists period_from date;
alter table public.payments add column if not exists period_upto date;

-- Shop photos (stored in the public 'shop-images' storage bucket)
create table if not exists public.shop_images (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  path text not null,                        -- storage object path (supabase) or data URL (demo)
  created_at timestamptz not null default now()
);
create index if not exists shop_images_shop_idx on public.shop_images (shop_id);

-- ------------------------------------------------------------
-- Expenses & budgets (building-wide, shared by all staff)
-- user_id is kept for attribution / audit purposes only.
-- ------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null default 'Other',
  amount numeric(12, 2) not null,
  date date not null default current_date,
  shop_id uuid references public.shops (id) on delete set null,
  description text default '',
  created_at timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses (date);

create table if not exists public.expense_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  month text not null,                      -- 'YYYY-MM'
  amount numeric(12, 2) not null default 0,
  unique (category, month)
);

-- ------------------------------------------------------------
-- Savings goals & deposits (shared building-wide)
-- ------------------------------------------------------------
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null,
  saved_amount numeric(12, 2) not null default 0,
  target_date date,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.savings_deposits (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null,
  date date not null default current_date,
  note text default '',
  created_at timestamptz not null default now()
);
create index if not exists savings_deposits_goal_idx on public.savings_deposits (goal_id);

-- ------------------------------------------------------------
-- Notifications (per-user; fed by the alarm scan and actions)
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null default 'info',        -- rent_due | budget | savings | payment | expense | shop | info
  title text not null,
  message text default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_read_idx on public.notifications (user_id, read);
create index if not exists notifications_created_idx on public.notifications (created_at desc);

-- ------------------------------------------------------------
-- Activity (audit trail — every significant action is logged)
-- ------------------------------------------------------------
create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text default '',
  entity_id text default '',
  details text default '',
  created_at timestamptz not null default now()
);
create index if not exists activity_created_idx on public.activity (created_at desc);

-- ------------------------------------------------------------
-- Staff helpers (security definer — callable via client RPC)
-- ------------------------------------------------------------

-- Fan a notification out to every staff member (or one target user).
create or replace function public.notify_staff(
  p_title text,
  p_message text default '',
  p_type text default 'info',
  p_user_id uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, message, read)
  select id, p_type, p_title, coalesce(p_message, ''), false
  from public.profiles
  where p_user_id is null or id = p_user_id;
end;
$$;

grant execute on function public.notify_staff(text, text, text, uuid) to authenticated;

-- Change a user's role. Only an existing admin may call this.
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_role not in ('admin', 'manager', 'payment_officer', 'viewer') then
    raise exception 'Invalid role: %', p_role;
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only an admin can change roles';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

grant execute on function public.set_user_role(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_images enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.savings_deposits enable row level security;
alter table public.notifications enable row level security;
alter table public.activity enable row level security;

-- Building-wide data: every authenticated staff member can read and write.
drop policy if exists "profiles select" on public.profiles;
create policy "profiles select" on public.profiles for select using (auth.role() = 'authenticated');

-- Users may edit their own profile, but never their role: role changes only go
-- through the admin-only set_user_role() RPC (security definer), so no one can
-- self-escalate to admin/manager.
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists "shops all" on public.shops;
create policy "shops all" on public.shops for all using (auth.role() = 'authenticated');

drop policy if exists "shop_images all" on public.shop_images;
create policy "shop_images all" on public.shop_images for all using (auth.role() = 'authenticated');

drop policy if exists "payments all" on public.payments;
create policy "payments all" on public.payments for all using (auth.role() = 'authenticated');

drop policy if exists "expenses all" on public.expenses;
create policy "expenses all" on public.expenses for all using (auth.role() = 'authenticated');

drop policy if exists "budgets all" on public.expense_budgets;
create policy "budgets all" on public.expense_budgets for all using (auth.role() = 'authenticated');

drop policy if exists "goals all" on public.savings_goals;
create policy "goals all" on public.savings_goals for all using (auth.role() = 'authenticated');

drop policy if exists "deposits all" on public.savings_deposits;
create policy "deposits all" on public.savings_deposits for all using (auth.role() = 'authenticated');

-- Audit trail visibility (enforced at the database, not just the UI):
--  - Admins: full audit trail — every update by anyone.
--  - Managers: their own updates, other managers' updates and users' (payment
--    officers / viewers) activity. The admin's updates stay private to the admin.
--  - Payment officers / viewers: their own updates only.
drop policy if exists "activity select all" on public.activity;
drop policy if exists "activity select by role" on public.activity;
create policy "activity select by role" on public.activity for select using (
  exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and (
      me.role = 'admin'
      or (
        me.role = 'manager'
        and (activity.user_id is null or exists (
          select 1 from public.profiles actor
          where actor.id = activity.user_id and actor.role <> 'admin'
        ))
      )
      or (me.role in ('payment_officer', 'viewer') and activity.user_id = auth.uid())
    )
  )
);

drop policy if exists "activity insert own" on public.activity;
create policy "activity insert own" on public.activity for insert with check (auth.uid() = user_id);

-- Notifications: users manage only their own rows (fan-out goes through notify_staff).
drop policy if exists "notifications own" on public.notifications;
create policy "notifications own" on public.notifications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Realtime (live updates across all open staff sessions)
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'public.shops', 'public.shop_images', 'public.payments', 'public.expenses', 'public.expense_budgets',
    'public.savings_goals', 'public.savings_deposits', 'public.notifications',
    'public.activity', 'public.profiles'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = split_part(t, '.', 2)
    ) then
      execute format('alter publication supabase_realtime add table %s', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Storage: public 'shop-images' bucket for shop photos
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-images', 'shop-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "shop-images public read" on storage.objects;
create policy "shop-images public read" on storage.objects
  for select using (bucket_id = 'shop-images');

drop policy if exists "shop-images staff upload" on storage.objects;
create policy "shop-images staff upload" on storage.objects
  for insert with check (bucket_id = 'shop-images' and auth.role() = 'authenticated');

drop policy if exists "shop-images staff delete" on storage.objects;
create policy "shop-images staff delete" on storage.objects
  for delete using (bucket_id = 'shop-images' and auth.role() = 'authenticated');
