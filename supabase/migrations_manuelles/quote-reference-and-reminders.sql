-- All deployments use the same atomic random-reference allocator.
\ir quote-random-reference.sql

-- Suivi des relances envoyées aux déménageurs, pour ne pas les spammer :
-- une ligne par (déménageur, demande, moment d'envoi).
CREATE TABLE IF NOT EXISTS quote_reminder_log (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  mover_id uuid NOT NULL REFERENCES movers(id) ON DELETE CASCADE,
  urgency text NOT NULL DEFAULT 'normal',
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.quote_reminder_log TO service_role;

CREATE INDEX IF NOT EXISTS idx_quote_reminder_log_lookup ON quote_reminder_log(quote_request_id, mover_id, sent_at);

ALTER TABLE quote_reminder_log ENABLE ROW LEVEL SECURITY;
-- Aucune policy : accessible uniquement via service_role (edge function).
