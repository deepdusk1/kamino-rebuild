-- Native OAuth exchange needs a proof issued only to the completing browser.
alter table identity_oauth_flows add column if not exists callback_proof_hash text;
