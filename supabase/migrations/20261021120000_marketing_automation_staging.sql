-- Marketing automation — STAGING ONLY. Extends the existing outreach queue and post scheduler:
--  * outreach_channels: one row per business+channel (facebook, instagram, whatsapp, email, linkedin, phone) —
--    the modular registry that says if a channel is connected and whether automatic sending is allowed.
--  * outreach_campaigns: one message → many companies, in an order the owner sets, at a cadence and in
--    active days/hours; start / pause / resume / cancel. A server tick releases the next company when due.
--  * outreach_queue: position, per-company override, richer statuses, idempotency, send mode.
--  * post_series: posts published on schedule only after the owner approves the series once.
-- Service-role only (RLS on, no policies).

/* ---------- channel registry ---------- */
create table if not exists public.outreach_channels (
  business_id  text not null references public.social_businesses(id) on delete cascade,
  channel      text not null check (channel in ('facebook','instagram','whatsapp','email','linkedin','phone')),
  enabled      boolean not null default true,
  connected    boolean not null default false,
  auto_allowed boolean not null default false,   -- set only when connector + permissions + consent rules are in place
  settings     jsonb not null default '{}'::jsonb, -- e.g. sender name, signature, email subject, unsubscribe text
  updated_at   timestamptz not null default now(),
  primary key (business_id, channel)
);
insert into public.outreach_channels (business_id, channel)
select b.id, c.ch from public.social_businesses b
cross join (values ('facebook'),('instagram'),('whatsapp'),('email'),('linkedin'),('phone')) c(ch)
on conflict do nothing;

/* ---------- contacts: LinkedIn + per-channel consent / opt-out ---------- */
alter table public.outreach_contacts add column if not exists linkedin_url text;
alter table public.outreach_contacts add column if not exists consent jsonb not null default '{}'::jsonb;      -- {email:{at,source}, whatsapp:{...}}
alter table public.outreach_contacts add column if not exists opt_out_channels text[] not null default '{}';

/* ---------- campaigns ---------- */
create table if not exists public.outreach_campaigns (
  id              uuid primary key default gen_random_uuid(),
  business_id     text not null references public.social_businesses(id) on delete cascade,
  name            text not null,
  channel         text not null check (channel in ('facebook','instagram','whatsapp','email','linkedin','phone')),
  subject         text,                               -- email only
  body            text not null default '',
  media_asset_id  uuid references public.media_assets(id) on delete set null,
  status          text not null default 'draft' check (status in ('draft','running','paused','cancelled','completed')),
  cadence_minutes int  not null default 30 check (cadence_minutes between 5 and 1440),
  active_days     int[] not null default '{0,1,2,3,4}',   -- 0 = Sunday … 6 = Saturday (Israel week)
  active_from     time not null default '09:00',
  active_to       time not null default '17:00',
  max_ready       int  not null default 3,                -- manual channels: do not pile up more than this
  next_at         timestamptz,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists outreach_campaigns_tick_idx on public.outreach_campaigns (status, next_at);

/* ---------- queue ---------- */
alter table public.outreach_queue drop constraint if exists outreach_queue_status_check;
alter table public.outreach_queue drop constraint if exists outreach_queue_channel_check;
alter table public.outreach_queue add constraint outreach_queue_channel_check
  check (channel in ('facebook','instagram','whatsapp','email','linkedin','phone'));
alter table public.outreach_queue add constraint outreach_queue_status_check
  check (status in ('queued','ready','sent','failed','replied','attention','skipped','cancelled'));
alter table public.outreach_queue add column if not exists campaign_id uuid references public.outreach_campaigns(id) on delete cascade;
alter table public.outreach_queue add column if not exists position double precision;
alter table public.outreach_queue add column if not exists custom_body boolean not null default false;
alter table public.outreach_queue add column if not exists subject text;
alter table public.outreach_queue add column if not exists send_mode text not null default 'manual' check (send_mode in ('manual','auto'));
alter table public.outreach_queue add column if not exists ready_at timestamptz;
alter table public.outreach_queue add column if not exists attempts int not null default 0;
alter table public.outreach_queue add column if not exists error text;
alter table public.outreach_queue add column if not exists external_ref text;
create index if not exists outreach_queue_campaign_idx on public.outreach_queue (campaign_id, status, position);
-- One company appears once per campaign (no double outreach inside a campaign).
create unique index if not exists outreach_queue_campaign_contact_uq on public.outreach_queue (campaign_id, contact_id) where campaign_id is not null;
-- The old "one open item per contact+channel" guard now also covers 'ready'.
drop index if exists public.outreach_queue_open_uq;
create unique index if not exists outreach_queue_open_uq on public.outreach_queue (contact_id, channel) where status in ('queued','ready');

/* ---------- post series ---------- */
create table if not exists public.post_series (
  id           uuid primary key default gen_random_uuid(),
  business_id  text not null references public.social_businesses(id) on delete cascade,
  name         text not null,
  status       text not null default 'draft' check (status in ('draft','approved','paused','cancelled','completed')),
  test_mode    boolean not null default false,   -- runs the full Meta check but never makes anything public
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check
  check (status in ('draft','scheduled','publishing','published','partial','failed','paused','cancelled','attention'));
alter table public.social_posts add column if not exists series_id uuid references public.post_series(id) on delete set null;
alter table public.social_posts add column if not exists test_mode boolean not null default false;
alter table public.social_posts add column if not exists publishing_started_at timestamptz;

alter table public.outreach_channels  enable row level security;
alter table public.outreach_campaigns enable row level security;
alter table public.post_series        enable row level security;
