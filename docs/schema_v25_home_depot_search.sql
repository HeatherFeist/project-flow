-- Project Flow — Home Depot product search via SerpApi, bring-your-own-key (v25)
--
-- SerpApi (serpapi.com) offers a Home Depot search engine that scrapes
-- Home Depot's public search results — there's no official Home Depot
-- product API for third parties, so this is the same category of
-- workaround already noted in the Materials catalog section of the
-- README (no live Home Depot/Lowe's API exists).
--
-- Same reasoning as Gemini/Twilio/Stripe/PayPal (schema_v21/v22): this is
-- billed per search against someone's own account, so it's bring-your-
-- own-key rather than a shared platform secret — each owner gets their
-- own SerpApi key in Settings, and the feature is simply off until they
-- add one.

alter table profiles add column if not exists serpapi_key text;
