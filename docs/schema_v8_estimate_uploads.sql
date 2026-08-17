-- Project Flow — estimate chatbot photo/video uploads (v8)
-- Lets a customer attach photos (or video, frame-extracted client-side) of
-- their project in the /estimate/:ownerId chat; Claude analyzes the images
-- directly, and if a visit gets booked, the photos are saved onto the Job.

-- Public bucket: the estimate chat is unauthenticated, so uploads need to
-- work without a Supabase session. Size/type limits guard against abuse.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'estimate-uploads',
  'estimate-uploads',
  true,
  20971520, -- 20MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "estimate-uploads: public insert" on storage.objects
  for insert with check (bucket_id = 'estimate-uploads');

create policy "estimate-uploads: public read" on storage.objects
  for select using (bucket_id = 'estimate-uploads');

-- Photos/frames attached to a job created via the estimate chatbot.
alter table jobs add column if not exists photo_urls text[] not null default '{}';
