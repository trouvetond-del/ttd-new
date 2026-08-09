-- Référence lisible pour chaque demande de déménagement (ex: DEM-000123),
-- générée automatiquement à l'insertion, backfill des lignes existantes
-- dans l'ordre de création.

ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS reference text;

CREATE SEQUENCE IF NOT EXISTS quote_requests_reference_seq START 1;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn
  FROM quote_requests
  WHERE reference IS NULL
)
UPDATE quote_requests qr
SET reference = 'DEM-' || LPAD(numbered.rn::text, 6, '0')
FROM numbered
WHERE qr.id = numbered.id;

-- setval basé sur COUNT(*) : cassé si des lignes ont été supprimées, ou
-- si la séquence a avancé au-delà du nombre de lignes actuelles (ex :
-- transactions annulées -- nextval() n'est JAMAIS rollback par Postgres,
-- c'est volontaire pour ne pas bloquer les transactions concurrentes).
-- Ce fichier étant rejoué à chaque déploiement du pipeline, un setval
-- non-idempotent qui peut reculer la séquence est une bombe à retardement :
-- il finit par faire réémettre une référence déjà attribuée, provoquant
-- "duplicate key value violates unique constraint quote_requests_reference_unique".
-- Fix : on avance la séquence jusqu'au MAX(numéro déjà utilisé), et
-- JAMAIS en dessous de sa valeur actuelle.
DO $$
DECLARE
  v_max_used bigint;
  v_current bigint;
BEGIN
  SELECT COALESCE(MAX(substring(reference from 5)::bigint), 0) INTO v_max_used
  FROM quote_requests
  WHERE reference ~ '^DEM-[0-9]+$';

  SELECT last_value INTO v_current FROM quote_requests_reference_seq;

  IF v_max_used > v_current THEN
    PERFORM setval('quote_requests_reference_seq', v_max_used);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_quote_request_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference IS NULL THEN
    NEW.reference := 'DEM-' || LPAD(nextval('quote_requests_reference_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_quote_request_reference ON quote_requests;
CREATE TRIGGER trg_set_quote_request_reference
BEFORE INSERT ON quote_requests
FOR EACH ROW EXECUTE FUNCTION set_quote_request_reference();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quote_requests_reference_unique'
  ) THEN
    ALTER TABLE quote_requests ADD CONSTRAINT quote_requests_reference_unique UNIQUE (reference);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quote_requests_reference ON quote_requests(reference);

-- Suivi des relances envoyées aux déménageurs, pour ne pas les spammer :
-- une ligne par (déménageur, demande, moment d'envoi).
CREATE TABLE IF NOT EXISTS quote_reminder_log (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  mover_id uuid NOT NULL REFERENCES movers(id) ON DELETE CASCADE,
  urgency text NOT NULL DEFAULT 'normal',
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_reminder_log_lookup ON quote_reminder_log(quote_request_id, mover_id, sent_at);

ALTER TABLE quote_reminder_log ENABLE ROW LEVEL SECURITY;
-- Aucune policy : accessible uniquement via service_role (edge function).
