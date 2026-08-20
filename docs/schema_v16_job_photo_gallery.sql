-- Project Flow — job photo gallery: team tagging, captions, client sharing (v16)
-- Upgrades job-site photo capture (schema_v15) from a plain URL array to a
-- proper table, so each photo can carry who took it, a caption, and a real
-- timestamp for a timeline — plus a token so the gallery can be shared
-- with the client without a login, same pattern as quotes/invoices.
--
-- jobs.photo_urls (schema_v8) is untouched and keeps showing photos a
-- customer attached via the estimate chatbot before the job existed —
-- this table is for photos added afterward, on the job itself.

create table if not exists job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  storage_path text not null,
  taken_by text,
  caption text,
  created_at timestamptz not null default now()
);

alter table job_photos enable row level security;

create policy "job_photos: owner read/write" on job_photos
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists job_photos_job_id_idx on job_photos (job_id, created_at);

-- One-time-guessable-resistant token for the public, no-login gallery page
-- (/job-gallery/:token) — same approach as quotes.accept_token and
-- invoices.pay_token, rather than exposing the raw job id.
alter table jobs add column if not exists photo_share_token uuid not null default gen_random_uuid();
create unique index if not exists jobs_photo_share_token_idx on jobs (photo_share_token);
