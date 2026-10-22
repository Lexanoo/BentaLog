-- =====================================================================
-- BentaLog database schema for Supabase
-- Run this whole file once in Supabase: SQL Editor -> New query -> Run.
-- It is safe to re-run: it drops and recreates the functions and policies,
-- but CREATE TABLE IF NOT EXISTS leaves existing tables and data alone.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- One row per signed-up user (filled automatically by a trigger below).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- A shop account. Everything else belongs to one workspace.
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  settings    jsonb not null default '{}'::jsonb,   -- currency, locale, lowStock, float, business
  join_code   text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Who can use a workspace, and how.
create table if not exists public.members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'staff'   check (role in ('owner', 'staff')),
  status       text not null default 'pending' check (status in ('active', 'pending', 'disabled')),
  last_seen    timestamptz,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- The business tabs (e.g. Apparel, Grocery). Each has its own receipts and products.
create table if not exists public.stores (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  prefix       text not null check (prefix ~ '^[A-Z0-9]{2,4}$'),
  seq          integer not null default 0,           -- last receipt number used
  created_at   timestamptz not null default now(),
  unique (workspace_id, prefix)
);

create table if not exists public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  kind         text not null check (kind in ('cash', 'digital', 'credit')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  store_id     uuid not null references public.stores(id) on delete cascade,
  name         text not null,
  category     text not null default '',
  sku          text not null default '',
  price        numeric(12,2) not null check (price > 0),
  unit         text not null default 'pc',
  step         numeric(6,2) not null default 1 check (step > 0),
  stock        numeric(12,2) check (stock >= 0),     -- null = stock not tracked
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists products_store_idx on public.products (store_id);

create table if not exists public.sales (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  store_id     uuid not null references public.stores(id) on delete restrict,
  receipt_no   text not null,
  ts           timestamptz not null default now(),   -- when the sale happened
  items        jsonb not null,                       -- [{pid, name, price, qty, unit}]
  total        numeric(12,2) not null,
  method_id    uuid references public.payment_methods(id) on delete restrict,
  tendered     numeric(12,2),
  customer     text,
  ref          text,
  late         boolean not null default false,
  recorded_at  timestamptz not null default now(),   -- when it was entered
  paid_at      timestamptz,                          -- pay-later sales: when collected
  voided       jsonb,                                -- {reason, ts, by}
  by_name      text not null default '',
  by_user      uuid references auth.users(id) on delete set null default auth.uid(),
  unique (workspace_id, receipt_no)
);
create index if not exists sales_ws_ts_idx on public.sales (workspace_id, ts);

create table if not exists public.closings (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  store_id     uuid not null references public.stores(id) on delete cascade,
  day          date not null,
  expected     numeric(12,2) not null,
  counted      numeric(12,2) not null,
  diff         numeric(12,2) not null,
  by_name      text not null default '',
  created_at   timestamptz not null default now(),
  unique (store_id, day)
);

-- ---------------------------------------------------------------------
-- Helper functions used by the security policies
-- (security definer so they can read members without recursion)
-- ---------------------------------------------------------------------

create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where workspace_id = ws and user_id = auth.uid() and status = 'active');
$$;

create or replace function public.is_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where workspace_id = ws and user_id = auth.uid() and status = 'active' and role = 'owner');
$$;

create or replace function public.shares_workspace(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members a join members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = other);
$$;

-- ---------------------------------------------------------------------
-- New users get a profile automatically (works for email and Google)
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users who signed up before this script ran
insert into public.profiles (id, full_name, email)
select id, coalesce(nullif(raw_user_meta_data->>'full_name', ''), split_part(email, '@', 1)), email from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Actions (RPC). Called from the app with supabase.rpc('name', {...})
-- ---------------------------------------------------------------------

-- Create a shop; the caller becomes its owner. Comes with one business and 4 payment methods.
create or replace function public.create_workspace(p_name text, p_store text default 'Main store', p_prefix text default 'MS')
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'You need to sign in first.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter a shop name.'; end if;
  insert into workspaces (name, settings, created_by)
  values (trim(p_name), jsonb_build_object('business', trim(p_name), 'currency', '₱', 'locale', 'en-PH', 'lowStock', 5, 'float', 500), auth.uid())
  returning id into ws;
  insert into members (workspace_id, user_id, role, status, last_seen) values (ws, auth.uid(), 'owner', 'active', now());
  insert into stores (workspace_id, name, prefix)
  values (ws, coalesce(nullif(trim(p_store), ''), 'Main store'), coalesce(nullif(upper(trim(p_prefix)), ''), 'MS'));
  insert into payment_methods (workspace_id, name, kind) values
    (ws, 'Cash', 'cash'), (ws, 'E-wallet', 'digital'), (ws, 'Card', 'digital'), (ws, 'Pay later', 'credit');
  return ws;
end $$;

-- Ask to join a shop with its invite code. The owner must approve.
create or replace function public.join_workspace(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare w workspaces;
begin
  if auth.uid() is null then raise exception 'You need to sign in first.'; end if;
  select * into w from workspaces where join_code = upper(trim(p_code));
  if not found then raise exception 'No shop uses that invite code. Check it with the owner.'; end if;
  insert into members (workspace_id, user_id, role, status) values (w.id, auth.uid(), 'staff', 'pending')
  on conflict (workspace_id, user_id) do nothing;
  return json_build_object('workspace_id', w.id, 'name', w.name);
end $$;

create or replace function public.touch_member(p_ws uuid) returns void
language sql security definer set search_path = public as $$
  update members set last_seen = now() where workspace_id = p_ws and user_id = auth.uid();
$$;

-- Owner: change another member's role or status
create or replace function public.set_member(p_ws uuid, p_user uuid, p_role text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_ws) then raise exception 'Only an owner can change users.'; end if;
  if p_user = auth.uid() then raise exception 'You can’t change your own role or status. Ask another owner.'; end if;
  update members set role = p_role, status = p_status where workspace_id = p_ws and user_id = p_user;
  if not found then raise exception 'That user is not part of this shop.'; end if;
end $$;

-- Owner: remove someone (also used to decline a join request)
create or replace function public.remove_member(p_ws uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_ws) then raise exception 'Only an owner can remove users.'; end if;
  if p_user = auth.uid() then raise exception 'You can’t remove yourself.'; end if;
  delete from members where workspace_id = p_ws and user_id = p_user;
end $$;

create or replace function public.new_join_code(p_ws uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_owner(p_ws) then raise exception 'Only an owner can change the invite code.'; end if;
  c := upper(substr(md5(gen_random_uuid()::text), 1, 6));
  update workspaces set join_code = c where id = p_ws;
  return c;
end $$;

-- Record a sale: gives the next receipt number and takes items out of stock in one step,
-- so two phones selling at once can't get the same receipt number or oversell.
create or replace function public.record_sale(
  p_store uuid, p_items jsonb, p_method uuid,
  p_tendered numeric default null, p_customer text default null, p_ref text default null,
  p_ts timestamptz default null, p_late boolean default false, p_by_name text default '')
returns public.sales language plpgsql security definer set search_path = public as $$
declare
  st stores; pm payment_methods; s sales; it jsonb; pr products; q numeric; tot numeric := 0;
begin
  select * into st from stores where id = p_store for update;
  if not found or not is_member(st.workspace_id) then raise exception 'You are not allowed to record sales here.'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'The sale has no items.'; end if;
  select * into pm from payment_methods where id = p_method and workspace_id = st.workspace_id;
  if not found then raise exception 'Pick a payment method.'; end if;
  if pm.kind = 'credit' and coalesce(trim(p_customer), '') = '' then raise exception 'Enter the customer’s name.'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'qty')::numeric;
    if q is null or q <= 0 then raise exception 'Each item needs a quantity above 0.'; end if;
    tot := tot + (it->>'price')::numeric * q;
    if coalesce(it->>'pid', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into pr from products where id = (it->>'pid')::uuid and store_id = p_store for update;
      if found and pr.stock is not null then
        if pr.stock < q then raise exception 'Only % % of % left in stock.', pr.stock, pr.unit, pr.name; end if;
        update products set stock = stock - q where id = pr.id;
      end if;
    end if;
  end loop;

  update stores set seq = seq + 1 where id = p_store returning * into st;
  insert into sales (workspace_id, store_id, receipt_no, ts, items, total, method_id, tendered, customer, ref, late, by_name)
  values (st.workspace_id, p_store, st.prefix || '-' || lpad(st.seq::text, 4, '0'), coalesce(p_ts, now()), p_items,
          round(tot, 2), p_method, p_tendered, nullif(trim(p_customer), ''), nullif(trim(p_ref), ''), coalesce(p_late, false), coalesce(p_by_name, ''))
  returning * into s;
  return s;
end $$;

-- Owner: void a sale with a reason and put its items back in stock
create or replace function public.void_sale(p_sale uuid, p_reason text, p_by_name text default '')
returns public.sales language plpgsql security definer set search_path = public as $$
declare s sales; it jsonb;
begin
  select * into s from sales where id = p_sale for update;
  if not found or not is_owner(s.workspace_id) then raise exception 'Only an owner can void a sale.'; end if;
  if s.voided is not null then raise exception 'This sale is already voided.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason for voiding.'; end if;
  for it in select * from jsonb_array_elements(s.items) loop
    if coalesce(it->>'pid', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      update products set stock = stock + (it->>'qty')::numeric where id = (it->>'pid')::uuid and stock is not null;
    end if;
  end loop;
  update sales set voided = jsonb_build_object('reason', trim(p_reason), 'ts', now(), 'by', p_by_name)
  where id = p_sale returning * into s;
  return s;
end $$;

-- ---------------------------------------------------------------------
-- Row-level security: members see their shop's data; only owners change setup.
-- Staff record sales through record_sale() above.
-- ---------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.workspaces      enable row level security;
alter table public.members         enable row level security;
alter table public.stores          enable row level security;
alter table public.payment_methods enable row level security;
alter table public.products        enable row level security;
alter table public.sales           enable row level security;
alter table public.closings        enable row level security;

drop policy if exists "profiles: read self and teammates" on public.profiles;
create policy "profiles: read self and teammates" on public.profiles for select
  using (id = auth.uid() or public.shares_workspace(id));
drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "workspaces: read if joined" on public.workspaces;
create policy "workspaces: read if joined" on public.workspaces for select
  using (exists (select 1 from public.members m where m.workspace_id = id and m.user_id = auth.uid()));
drop policy if exists "workspaces: owner updates" on public.workspaces;
create policy "workspaces: owner updates" on public.workspaces for update
  using (public.is_owner(id)) with check (public.is_owner(id));

drop policy if exists "members: read own and team" on public.members;
create policy "members: read own and team" on public.members for select
  using (user_id = auth.uid() or public.is_member(workspace_id));

do $$
declare t text;
begin
  foreach t in array array['stores', 'payment_methods', 'products', 'sales', 'closings'] loop
    execute format('drop policy if exists "%1$s: members read" on public.%1$I', t);
    execute format('create policy "%1$s: members read" on public.%1$I for select using (public.is_member(workspace_id))', t);
    execute format('drop policy if exists "%1$s: owner inserts" on public.%1$I', t);
    execute format('create policy "%1$s: owner inserts" on public.%1$I for insert with check (public.is_owner(workspace_id))', t);
    execute format('drop policy if exists "%1$s: owner updates" on public.%1$I', t);
    execute format('create policy "%1$s: owner updates" on public.%1$I for update using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id))', t);
    execute format('drop policy if exists "%1$s: owner deletes" on public.%1$I', t);
    execute format('create policy "%1$s: owner deletes" on public.%1$I for delete using (public.is_owner(workspace_id))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Live updates: other phones and tabs refresh when data changes
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['workspaces', 'members', 'stores', 'payment_methods', 'products', 'sales', 'closings'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
