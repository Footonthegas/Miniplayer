-- Run this in Supabase SQL Editor.
-- The server uses the Supabase service-role key; do not expose that key to the extension.
create table if not exists public.premium_entitlements (
  install_id text primary key,
  token_hash text not null,
  subscription_id text unique,
  subscription_status text not null default 'created',
  current_end bigint,
  checkout_url text,
  checkout_created_at timestamptz,
  cancel_at_cycle_end boolean not null default false,
  cancel_requested_at timestamptz,
  updated_at timestamptz not null default now()
);

-- These ALTER statements also upgrade a table created from an earlier version of this kit.
alter table public.premium_entitlements
  add column if not exists cancel_at_cycle_end boolean not null default false;
alter table public.premium_entitlements
  add column if not exists cancel_requested_at timestamptz;

-- Keep this table inaccessible to unauthenticated browser clients.
alter table public.premium_entitlements enable row level security;

-- No anon/authenticated policies are intentionally created. Server-side service_role access bypasses RLS.
