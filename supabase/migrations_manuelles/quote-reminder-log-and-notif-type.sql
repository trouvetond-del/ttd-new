-- Table manquante référencée par send-mover-quote-reminders : sans elle,
-- la fonction plantait dès la première requête et n'a donc jamais pu
-- envoyer le moindre rappel.
CREATE TABLE IF NOT EXISTS quote_reminder_log (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references quote_requests(id) on delete cascade,
  mover_id uuid not null references movers(id) on delete cascade,
  urgency text not null,
  sent_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_quote_reminder_log_pair
  ON quote_reminder_log(quote_request_id, mover_id, sent_at desc);

ALTER TABLE quote_reminder_log ENABLE ROW LEVEL SECURITY;
-- Accessible uniquement via service_role (edge function), aucune policy nécessaire.

-- 'quote_reminder' manquait de la contrainte type de la table notifications :
-- chaque insertion de notification in-app pour une relance échouait
-- silencieusement (capturée par un try/catch côté fonction).
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'new_quote', 'quote_accepted', 'message', 'status_change', 'review',
      'payment', 'damage_report', 'quote_update', 'info', 'system',
      'new_quote_request', 'damage_alert', 'quote_reminder'
    ));
EXCEPTION
  WHEN others THEN NULL;
END $$;
