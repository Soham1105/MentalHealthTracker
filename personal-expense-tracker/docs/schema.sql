create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  created_at timestamptz not null default now(),
  unique (user_id, name, kind)
);

create table if not exists public.account_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  account_type text not null default 'bank',
  opening_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  txn_date date not null,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  direction text not null check (direction in ('expense', 'income')),
  category_id uuid references public.categories(id) on delete set null,
  account_name text not null default 'Primary',
  source text not null default 'Manual',
  counterparty text,
  balance numeric(14,2),
  notes text,
  raw jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, txn_date desc);

create index if not exists transactions_user_category_idx
  on public.transactions (user_id, category_id);

create table if not exists public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  category_id uuid references public.categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, month, category_id)
);

create table if not exists public.planned_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(14,2) not null check (amount >= 0),
  due_date date,
  category_id uuid references public.categories(id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'paid', 'skipped')),
  created_at timestamptz not null default now()
);

create table if not exists public.tag_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_text text not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  priority int not null default 100,
  created_at timestamptz not null default now(),
  unique (user_id, match_text)
);

alter table public.categories enable row level security;
alter table public.account_profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.planned_expenses enable row level security;
alter table public.tag_rules enable row level security;

drop policy if exists "categories owner access" on public.categories;
create policy "categories owner access" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "accounts owner access" on public.account_profiles;
create policy "accounts owner access" on public.account_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "transactions owner access" on public.transactions;
create policy "transactions owner access" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "budgets owner access" on public.monthly_budgets;
create policy "budgets owner access" on public.monthly_budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "planned owner access" on public.planned_expenses;
create policy "planned owner access" on public.planned_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "rules owner access" on public.tag_rules;
create policy "rules owner access" on public.tag_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();
