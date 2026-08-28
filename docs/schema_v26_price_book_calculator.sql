-- Project Flow — Price Book cost calculator breakdown (v26)
--
-- Adds an optional Material / Labor / Supplies breakdown to a Price Book
-- item, in the spirit of the classic "cost calculator" layout (item,
-- quantity, lower estimate, higher estimate, per category, summing to a
-- total) — but built as Project Flow's own feature with its own
-- independently-written numbers, not copied from any third party's
-- proprietary data. See the README's "Price Book cost calculator" section
-- for the reasoning.
--
-- Every column here is nullable and additive — an item with none of
-- these filled in behaves exactly as before (a single low/high range).
-- An owner opts a specific item into the breakdown view by filling in
-- its Material/Labor/Supplies numbers in the item's edit form.

alter table price_book_items add column if not exists description text;

alter table price_book_items add column if not exists material_low_cents integer;
alter table price_book_items add column if not exists material_high_cents integer;
alter table price_book_items add column if not exists material_quantity_label text;

alter table price_book_items add column if not exists labor_low_cents integer;
alter table price_book_items add column if not exists labor_high_cents integer;
alter table price_book_items add column if not exists labor_quantity_label text;

alter table price_book_items add column if not exists supplies_low_cents integer;
alter table price_book_items add column if not exists supplies_high_cents integer;
