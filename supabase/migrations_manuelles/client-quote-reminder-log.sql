CREATE TABLE IF NOT EXISTS client_quote_reminder_log (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references quote_requests(id) on delete cascade,
  sent_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_client_quote_reminder_log_qr
  ON client_quote_reminder_log(quote_request_id, sent_at desc);

ALTER TABLE client_quote_reminder_log ENABLE ROW LEVEL SECURITY;
-- Accessible uniquement via service_role (edge function).
