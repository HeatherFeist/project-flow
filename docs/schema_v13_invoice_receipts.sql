-- Project Flow — receipt photo uploads on invoices (v13)
-- Lets the owner snap a photo of a materials receipt and attach it to an
-- invoice, so job costs are on record right alongside what was billed.
--
-- Private bucket (unlike estimate-uploads, which is public/anonymous) —
-- these are internal financial records, so only the signed-in owner who
-- uploaded them can read/write their own files. Each owner's files live
-- under a `<owner_id>/...` path prefix, which the RLS policies enforce.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "receipts: owner insert" on storage.objects
  for insert with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "receipts: owner read" on storage.objects
  for select using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "receipts: owner delete" on storage.objects
  for delete using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Storage paths (not public URLs — the bucket's private, so the app
-- resolves these to short-lived signed URLs when displaying them).
alter table invoices add column if not exists receipt_paths text[] not null default '{}';
