-- Marketing Center: Media Library + B2B Outreach — STAGING ONLY (usfeoerkpcafxxlyuldl).
-- Service-role only (RLS on, no policies); the browser reaches these through the marketing-hub edge function.
-- Every row is scoped by business_id (public.social_businesses) so Dalia and Yoni's garage never mix.

/* ---------------- Media library ---------------- */
create table if not exists public.media_assets (
  id            uuid primary key default gen_random_uuid(),
  business_id   text not null references public.social_businesses(id) on delete cascade,
  parent_id     uuid references public.media_assets(id) on delete set null, -- edited version -> its original
  title         text not null default '',
  category      text not null default 'כללי',
  tags          text[] not null default '{}',
  path          text not null,
  url           text not null,
  thumb_path    text,
  thumb_url     text,
  mime          text,
  bytes         bigint,
  width         int,
  height        int,
  preset        text,          -- e.g. ig_portrait, story (for edited versions)
  sort_order    double precision not null default extract(epoch from now()),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists media_assets_biz_idx on public.media_assets (business_id, deleted_at, sort_order desc);
create index if not exists media_assets_parent_idx on public.media_assets (parent_id);

-- Posts can carry several images (Facebook multi-photo / Instagram carousel).
alter table public.social_posts add column if not exists image_urls text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media-library', 'media-library', true, 26214400, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

/* ---------------- B2B outreach ---------------- */
create table if not exists public.outreach_contacts (
  id               uuid primary key default gen_random_uuid(),
  business_id      text not null references public.social_businesses(id) on delete cascade,
  company_name     text not null,
  name_norm        text not null,
  contact_name     text,
  role             text,
  phone            text,
  phone_norm       text,
  email            text,
  website          text,
  facebook_url     text,
  facebook_handle  text,
  instagram_url    text,
  instagram_handle text,
  whatsapp         text,
  city             text,
  industry         text,
  notes            text,
  tags             text[] not null default '{}',
  status           text not null default 'new'
                   check (status in ('new','ready','sent','awaiting_reply','interested','not_interested','customer')),
  do_not_contact   boolean not null default false,
  dnc_reason       text,
  source           text not null default 'manual' check (source in ('manual','openprospector','import')),
  source_ref       text,
  next_action_at   timestamptz,
  last_contact_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Duplicate guards per business.
create unique index if not exists outreach_contacts_fb_uq on public.outreach_contacts (business_id, facebook_handle) where facebook_handle is not null;
create unique index if not exists outreach_contacts_ig_uq on public.outreach_contacts (business_id, instagram_handle) where instagram_handle is not null;
create unique index if not exists outreach_contacts_phone_uq on public.outreach_contacts (business_id, phone_norm) where phone_norm is not null;
create unique index if not exists outreach_contacts_src_uq on public.outreach_contacts (business_id, source, source_ref) where source_ref is not null;
create index if not exists outreach_contacts_name_idx on public.outreach_contacts (business_id, name_norm);
create index if not exists outreach_contacts_status_idx on public.outreach_contacts (business_id, status, next_action_at);

create table if not exists public.outreach_templates (
  id           uuid primary key default gen_random_uuid(),
  business_id  text not null references public.social_businesses(id) on delete cascade,
  name         text not null,
  body         text not null,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Work queue: one prepared message per contact+channel. Sending is done by a person (manual channel links).
create table if not exists public.outreach_queue (
  id             uuid primary key default gen_random_uuid(),
  business_id    text not null references public.social_businesses(id) on delete cascade,
  contact_id     uuid not null references public.outreach_contacts(id) on delete cascade,
  template_id    uuid references public.outreach_templates(id) on delete set null,
  channel        text not null check (channel in ('facebook','instagram','whatsapp','email','phone')),
  body           text not null,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  status         text not null default 'queued' check (status in ('queued','sent','skipped','cancelled')),
  due_at         timestamptz not null default now(),
  done_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists outreach_queue_due_idx on public.outreach_queue (business_id, status, due_at);
create unique index if not exists outreach_queue_open_uq on public.outreach_queue (contact_id, channel) where status = 'queued';

create table if not exists public.outreach_events (
  id           uuid primary key default gen_random_uuid(),
  business_id  text not null references public.social_businesses(id) on delete cascade,
  contact_id   uuid not null references public.outreach_contacts(id) on delete cascade,
  type         text not null,  -- created, status, queued, sent, skipped, note, dnc, reminder
  channel      text,
  detail       text,
  created_at   timestamptz not null default now()
);
create index if not exists outreach_events_contact_idx on public.outreach_events (contact_id, created_at desc);

alter table public.media_assets       enable row level security;
alter table public.outreach_contacts  enable row level security;
alter table public.outreach_templates enable row level security;
alter table public.outreach_queue     enable row level security;
alter table public.outreach_events    enable row level security;
