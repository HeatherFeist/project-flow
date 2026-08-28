-- Project Flow — business logo upload (v27)
-- Lets an owner upload their own logo in Settings, then shows it on the
-- documents a client actually sees: the public quote page, the invoice
-- pay page, the client portal, and the quote/invoice emails — so
-- estimates look like they came from a real branded business, not a
-- generic tool.
--
-- Public bucket (like job-photos/quote-visuals) since the logo needs to
-- render on public, no-login pages — only the owning user can upload or
-- remove their own logo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-logos', 'business-logos', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "business-logos: owner insert" on storage.objects
  for insert with check (bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "business-logos: public read" on storage.objects
  for select using (bucket_id = 'business-logos');

create policy "business-logos: owner delete" on storage.objects
  for delete using (bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text);

alter table profiles add column if not exists logo_url text;
alter table profiles add column if not exists logo_path text;
