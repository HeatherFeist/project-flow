-- Project Flow — let an owner open a support ticket directly (v36)
--
-- v28 gave owners read-only access to their own support_tickets /
-- support_ticket_replies rows — tickets could only ever be created by the
-- Help Assistant's escalate_to_support tool, and a reply from the owner's
-- side (SupportTicketsPanel) had no insert policy to actually allow it.
-- This adds the missing owner insert policies so "Support" has a real
-- "new ticket" option, not just a read-only history of bot escalations.

create policy "support_tickets: owner create own" on support_tickets
  for insert with check (auth.uid() = owner_id);

create policy "support_ticket_replies: owner reply on own ticket" on support_ticket_replies
  for insert with check (
    author = 'owner'
    and exists (select 1 from support_tickets t where t.id = ticket_id and t.owner_id = auth.uid())
  );
