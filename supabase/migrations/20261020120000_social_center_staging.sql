-- Social Center (Facebook / Instagram) — STAGING ONLY (usfeoerkpcafxxlyuldl).
-- All tables are service-role only (RLS on, no policies). The browser talks to them
-- exclusively through the social-meta edge function, which holds the Meta tokens.

create table if not exists public.social_businesses (
  id          text primary key,
  name        text not null,
  website     text,
  created_at  timestamptz not null default now()
);

insert into public.social_businesses (id, name, website) values
  ('dalia', 'דליה פתרונות תפעול ותחזוקה לרכב', 'https://dalia-c.com'),
  ('yoni_garage', 'מוסך יוני – פחחות וצבע לרכב', null)
on conflict (id) do nothing;

create table if not exists public.social_accounts (
  id            uuid primary key default gen_random_uuid(),
  business_id   text not null references public.social_businesses(id) on delete cascade,
  platform      text not null check (platform in ('facebook','instagram')),
  external_id   text not null,
  name          text,
  username      text,
  picture_url   text,
  access_token  text not null,
  connected_at  timestamptz not null default now(),
  unique (business_id, platform)
);

-- Short-lived OAuth handshakes (state nonce + the page list returned by Meta).
create table if not exists public.social_oauth_sessions (
  id           uuid primary key default gen_random_uuid(),
  business_id  text not null references public.social_businesses(id) on delete cascade,
  return_url   text,
  pages        jsonb,
  error        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.social_posts (
  id            uuid primary key default gen_random_uuid(),
  business_id   text not null references public.social_businesses(id) on delete cascade,
  body          text not null default '',
  image_url     text,
  image_path    text,
  targets       text[] not null default '{}',
  status        text not null default 'draft'
                check (status in ('draft','scheduled','publishing','published','partial','failed')),
  scheduled_at  timestamptz,
  results       jsonb not null default '{}'::jsonb,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists social_posts_business_idx on public.social_posts (business_id, created_at desc);
create index if not exists social_posts_due_idx on public.social_posts (status, scheduled_at);

alter table public.social_businesses     enable row level security;
alter table public.social_accounts       enable row level security;
alter table public.social_oauth_sessions enable row level security;
alter table public.social_posts          enable row level security;

-- Images must be publicly reachable: Instagram fetches them by URL.
insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do nothing;
