-- Project Flow — create one job when a quote is accepted (v38)
--
-- Run this in the Supabase SQL editor after the earlier schema files
-- (team accounts, v29, must already be applied). Safe to run again.
--
-- Accepting a quote — the owner changing the status in the app, or the
-- client accepting from the public link — only used to flip `quotes.status`.
-- The job was created later, and only if the client also picked a time in
-- `book-slot`. This adds the missing step: the moment a quote becomes
-- accepted, exactly one job is created for it.
--
-- The job copies the quote's client, a title and description (from the
-- quote notes, otherwise the first line item), and the client's address.
-- Jobs have no total column; the quote total stays available because
-- `jobs.quote_id` points back at the quote (job costing already reads it
-- that way). `scheduled_at` is left empty — the schedule already treats a
-- null time as unscheduled, and `book-slot` fills the time in later.
-- Quotes accepted before this file was applied are left alone; the app
-- shows a "Create job" button on those.
--
-- No invoice is created here. The existing accept path still creates the
-- invoice; this only makes sure that invoice is pointed at the job when
-- the invoice already exists.

-- If a quote somehow already has more than one job, keep the booked one
-- (or the oldest) linked and unlink the extras. The extra jobs stay on
-- the schedule; they just stop counting as "the" job for that quote.
with ranked as (
  select id,
         row_number() over (
           partition by quote_id
           order by (scheduled_at is not null) desc, created_at asc, id asc
         ) as rn
  from jobs
  where quote_id is not null
)
update jobs
set quote_id = null
where id in (select id from ranked where rn > 1);

create unique index if not exists jobs_one_per_quote_idx
  on jobs (quote_id)
  where quote_id is not null;

-- Internal: insert the job, or return the one that already exists.
-- Not callable from the browser. The trigger (and the checked wrapper
-- below) are the only callers. security definer so the insert succeeds
-- for the quote's owner_id even when the status change came from the
-- service-role accept function, which has no user JWT.
create or replace function create_job_for_accepted_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  q quotes%rowtype;
  v_job_id uuid;
  v_client_name text;
  v_client_address text;
  v_title text;
  v_description text;
begin
  select * into q from quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Quote not found';
  end if;
  if q.status is distinct from 'accepted' then
    raise exception 'Quote must be accepted before a job can be created';
  end if;

  select j.id into v_job_id
  from jobs j
  where j.quote_id = q.id
  order by (j.scheduled_at is not null) desc, j.created_at asc
  limit 1;

  if v_job_id is null then
    select c.name, c.address
    into v_client_name, v_client_address
    from clients c
    where c.id = q.client_id;

    v_title := left(
      coalesce(
        nullif(btrim(q.notes), ''),
        nullif(btrim(q.items #>> '{0,description}'), ''),
        'Job for ' || coalesce(nullif(btrim(v_client_name), ''), 'client')
      ),
      80
    );
    v_description := coalesce(
      nullif(btrim(q.notes), ''),
      nullif(btrim(q.items #>> '{0,description}'), '')
    );

    insert into jobs (
      owner_id,
      client_id,
      quote_id,
      title,
      description,
      status,
      scheduled_at,
      address
    ) values (
      q.owner_id,
      q.client_id,
      q.id,
      v_title,
      v_description,
      'scheduled',
      null,
      nullif(btrim(v_client_address), '')
    )
    on conflict (quote_id) where quote_id is not null do nothing
    returning id into v_job_id;

    if v_job_id is null then
      select j.id into v_job_id
      from jobs j
      where j.quote_id = q.id
      limit 1;
    end if;
  end if;

  if v_job_id is null then
    raise exception 'Could not create a job for this quote';
  end if;

  -- quotes.job_id is the other direction of the same link. Only fill it
  -- when it's empty so a quote already pointed at a job is left as-is.
  update quotes
  set job_id = v_job_id
  where id = q.id
    and job_id is null;

  -- Attach an invoice that was already created for this quote. This does
  -- not insert an invoice.
  update invoices
  set job_id = v_job_id
  where quote_id = q.id
    and job_id is null;

  return v_job_id;
end;
$$;

revoke all on function public.create_job_for_accepted_quote(uuid) from public, anon, authenticated, service_role;
-- The trigger and the wrapper run as the function owner (security definer).
-- That role still needs to be able to call this after the revoke above.
grant execute on function public.create_job_for_accepted_quote(uuid) to current_user;

-- Browser entry for the "Create job" button on quotes accepted before
-- this trigger existed. Same work as the trigger, but only for an owner
-- or an admin team member of that business.
create or replace function ensure_job_for_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from quotes where id = p_quote_id;
  if v_owner is null or auth.uid() is null or not public.is_team_admin(v_owner) then
    raise exception 'Not allowed';
  end if;
  return create_job_for_accepted_quote(p_quote_id);
end;
$$;

revoke all on function public.ensure_job_for_quote(uuid) from public, anon, authenticated, service_role;
grant execute on function public.ensure_job_for_quote(uuid) to authenticated, service_role;

create or replace function quotes_create_job_on_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform create_job_for_accepted_quote(new.id);
  return new;
end;
$$;

revoke all on function public.quotes_create_job_on_accept() from public, anon, authenticated, service_role;

drop trigger if exists quotes_create_job_on_accept on quotes;
create trigger quotes_create_job_on_accept
  after update of status on quotes
  for each row
  when (new.status = 'accepted'::public.quote_status and old.status is distinct from 'accepted'::public.quote_status)
  execute function quotes_create_job_on_accept();
