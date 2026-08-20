-- Project Flow — AI project visualizations on quotes (v20)
-- Lets the owner upload a "before" photo of the space plus reference
-- photos of materials/fixtures (tile, flooring, lighting, etc.), describe
-- the changes in a prompt, and generate an "after" visualization via
-- Google's Gemini image model — attached to the quote for the client to
-- see alongside the numbers.

create table if not exists quote_visualizations (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  prompt text not null,
  result_path text not null,
  result_url text not null,
  created_at timestamptz not null default now()
);

alter table quote_visualizations enable row level security;

create policy "quote_visualizations: owner read/write" on quote_visualizations
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists quote_visualizations_quote_id_idx on quote_visualizations (quote_id, created_at);

-- Public bucket (the result needs to show on the client-facing /q/:token
-- page, same reasoning as job-photos) — only the owning user can write,
-- reading the resulting image doesn't need a session.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-visuals', 'quote-visuals', true, 20971520, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "quote-visuals: owner insert" on storage.objects
  for insert with check (bucket_id = 'quote-visuals' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "quote-visuals: public read" on storage.objects
  for select using (bucket_id = 'quote-visuals');

create policy "quote-visuals: owner delete" on storage.objects
  for delete using (bucket_id = 'quote-visuals' and (storage.foldername(name))[1] = auth.uid()::text);
