-- Project Flow — Google review request link (v12)
-- Stores the owner's direct "write a review" link for their Google
-- Business Profile (Google itself generates this — Business Profile app
-- or business.google.com -> "Ask for reviews" -> "Get more reviews" ->
-- copy link). Used to text/email clients a direct path to leave a real
-- Google review after a job, the same pattern Jobber/Housecall Pro use —
-- no Google API access or OAuth needed, since the customer posts the
-- review themselves, signed into their own Google account.

alter table profiles add column if not exists google_review_link text;
