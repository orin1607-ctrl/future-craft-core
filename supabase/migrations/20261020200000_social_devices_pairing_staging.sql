-- Phone pairing for the Marketing Center — STAGING ONLY.
-- A signed-in computer creates a one-time 6-digit code (10 min, 5 attempts); the phone exchanges it
-- for its own revocable device token. Only SHA-256 hashes are stored. Service-role only.
create table if not exists public.social_devices (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'טלפון',
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);
create table if not exists public.social_pairings (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists social_pairings_open_idx on public.social_pairings (code_hash) where used_at is null;
alter table public.social_devices  enable row level security;
alter table public.social_pairings enable row level security;
