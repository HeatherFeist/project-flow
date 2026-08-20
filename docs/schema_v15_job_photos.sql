-- Project Flow — job-site photo capture, CompanyCam-style (v15)
-- Lets the owner snap unlimited photos on a job (before/during/after,
-- progress shots, etc.) directly from the Job detail page, not just the
-- ones a customer happens to attach through the estimate chatbot before
-- the job exists. Reuses jobs.photo_urls (added in schema_v8) — same
-- column, now writable by the owner too, not just the chatbot.
--
-- Public bucket (like estimate-uploads) since job photos are the kind of
-- thing you want easy to share with a client later — but unlike
-- estimate-uploads, only the owning user can add or remove files; a public
-- bucket only means reads don't require a Supabase session.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', true, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "job-photos: owner insert" on storage.objects
  for insert with check (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "job-photos: public read" on storage.objects
  for select using (bucket_id = 'job-photos');

create policy "job-photos: owner delete" on storage.objects
  for delete using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);
