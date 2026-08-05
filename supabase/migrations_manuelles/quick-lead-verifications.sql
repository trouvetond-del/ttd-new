CREATE TABLE IF NOT EXISTS quick_lead_verifications (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid references quote_requests(id) on delete cascade,
  email text not null,
  token text not null unique,
  code text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_quick_lead_verifications_token ON quick_lead_verifications(token);
CREATE INDEX IF NOT EXISTS idx_quick_lead_verifications_email ON quick_lead_verifications(email);

ALTER TABLE quick_lead_verifications ENABLE ROW LEVEL SECURITY;
-- Aucune policy: accessible uniquement via service_role (edge functions / API routes),
-- jamais directement depuis le navigateur du client.
