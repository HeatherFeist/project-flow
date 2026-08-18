-- Project Flow — service area for unit-cost fallback pricing (v10)
-- Lets the estimate chatbot build a reasoned "unit cost method" estimate
-- (labor hours x local rate + materials, the same buildup Homewyse-style
-- pricing tools use) when a job isn't in the owner's Price Book, localized
-- to that owner's actual market instead of a hardcoded city — important
-- now that Project Flow bills multiple separate businesses.

alter table profiles add column if not exists service_area text;

-- One-time backfill for the existing account.
update profiles set service_area = 'Dayton, OH' where service_area is null;
