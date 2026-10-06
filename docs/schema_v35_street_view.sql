-- Project Flow — Street View photos for exterior visualizations (v35)
--
-- Lets a quote's "before" photo for an exterior renovation come from
-- Google's Street View imagery for the client's address, instead of
-- requiring an in-person photo first — useful for a rough first pass
-- before ever visiting the property.

alter table profiles add column if not exists google_maps_api_key text;
