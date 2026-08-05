CREATE TABLE IF NOT EXISTS mover_lead_verifications (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  code text not null,
  email text not null,
  manager_firstname text not null,
  manager_lastname text not null,
  company_name text not null,
  siret text not null,
  phone text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_mover_lead_verifications_token ON mover_lead_verifications(token);
CREATE INDEX IF NOT EXISTS idx_mover_lead_verifications_email ON mover_lead_verifications(email);
CREATE INDEX IF NOT EXISTS idx_mover_lead_verifications_siret ON mover_lead_verifications(siret);

ALTER TABLE mover_lead_verifications ENABLE ROW LEVEL SECURITY;
-- Aucune policy: accessible uniquement via service_role (edge functions / API routes).
