-- Project Flow — adjustable business logo size (v33)
--
-- The logo shown on quote/invoice pages, the client portal, and emails
-- was always displayed at one fixed size (56px tall / 200px wide max).
-- This lets an owner pick their own display width in Settings, so a very
-- wide or very tall logo can be sized to actually look right instead of
-- whatever the fixed box happened to do to it.

alter table profiles add column if not exists logo_width_px integer not null default 160;
