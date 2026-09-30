-- Project Flow — material product images (v34)
--
-- Home Depot search results already carry a product photo (shown in the
-- search dialog itself), but it was never saved when a result got added
-- to Materials — the catalog only kept name/price/link, not the image.

alter table materials add column if not exists image_url text;
