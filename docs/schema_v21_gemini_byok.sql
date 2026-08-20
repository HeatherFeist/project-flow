-- Project Flow — bring-your-own Gemini key (v21)
-- AI project visualizations (schema_v20) are billed per image generated
-- by Google, not a flat cost — so each owner supplies their own Google AI
-- Studio API key instead of the platform absorbing every subscriber's
-- generation costs on one shared key with no usage cap.

alter table profiles add column if not exists gemini_api_key text;
