-- Système de brouillon pour /client/quote (capture email au step 1,
-- autosave, reprise, relances anti-abandon). Additif uniquement : aucune
-- colonne existante modifiée, aucune contrainte NOT NULL touchée.

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS resume_token text UNIQUE DEFAULT (gen_random_uuid()::text),
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false;

-- Backfill : tout ce qui existe déjà en base a été soumis via l'ancien
-- parcours (INSERT unique, pas de notion de brouillon) -> considéré soumis.
UPDATE quote_requests
SET is_draft = false, submitted_at = created_at
WHERE is_draft = true;

COMMENT ON COLUMN quote_requests.is_draft IS
'true tant que le client n''a pas fini /client/quote (autosave en cours). Passe à false uniquement à la soumission finale. Tous les triggers de notification et vues de matching doivent filtrer is_draft = false pour ne jamais exposer un brouillon à un tiers (déménageur, admin en tant que "nouvelle demande").';
COMMENT ON COLUMN quote_requests.resume_token IS
'Token opaque utilisé dans les liens de relance (email/SMS) et l''URL /client/quote/reprendre?token=... pour retrouver un brouillon sans authentification préalable.';
COMMENT ON COLUMN quote_requests.marketing_consent IS
'Consentement (case cochée par le client au step 1) pour être recontacté par email/SMS afin de finaliser une demande abandonnée. Condition pour toute relance anti-abandon. Bascule à false via le lien de désabonnement de chaque email de relance.';

-- ============================================================
-- Conversion des 4 triggers AFTER INSERT en AFTER INSERT OR UPDATE OF
-- is_draft, avec une WHEN clause qui ne les déclenche QUE sur la
-- transition brouillon -> soumis (jamais sur l'INSERT du brouillon
-- lui-même). Les fonctions déclenchées ne changent pas : seule la
-- définition du trigger (quand il se déclenche) change.
--
-- Sans ça : ces triggers, ne réagissant qu'à l'INSERT, se
-- déclencheraient au step 1 (email seul, is_draft=true) et
-- notifieraient prématurément déménageurs/admins d'un brouillon --
-- puis ne se redéclencheraient JAMAIS à la vraie soumission (qui
-- devient un UPDATE), cassant silencieusement tout le matching.
-- ============================================================

DROP TRIGGER IF EXISTS on_quote_request_insert ON quote_requests;
CREATE TRIGGER on_quote_request_insert
  AFTER INSERT OR UPDATE OF is_draft ON quote_requests
  FOR EACH ROW
  WHEN (
    (TG_OP = 'INSERT' AND NEW.is_draft = false)
    OR (TG_OP = 'UPDATE' AND OLD.is_draft IS TRUE AND NEW.is_draft = false)
  )
  EXECUTE FUNCTION notify_admins_on_quote_request_insert();

DROP TRIGGER IF EXISTS trigger_detect_activity_zone ON quote_requests;
CREATE TRIGGER trigger_detect_activity_zone
  AFTER INSERT OR UPDATE OF is_draft ON quote_requests
  FOR EACH ROW
  WHEN (
    (TG_OP = 'INSERT' AND NEW.is_draft = false)
    OR (TG_OP = 'UPDATE' AND OLD.is_draft IS TRUE AND NEW.is_draft = false)
  )
  EXECUTE FUNCTION detect_activity_zone_matches();

DROP TRIGGER IF EXISTS trigger_detect_return_trip ON quote_requests;
CREATE TRIGGER trigger_detect_return_trip
  AFTER INSERT OR UPDATE OF is_draft ON quote_requests
  FOR EACH ROW
  WHEN (
    (TG_OP = 'INSERT' AND NEW.is_draft = false)
    OR (TG_OP = 'UPDATE' AND OLD.is_draft IS TRUE AND NEW.is_draft = false)
  )
  EXECUTE FUNCTION detect_return_trip_opportunities();

DROP TRIGGER IF EXISTS trigger_notify_nearby_missions ON quote_requests;
CREATE TRIGGER trigger_notify_nearby_missions
  AFTER INSERT OR UPDATE OF is_draft ON quote_requests
  FOR EACH ROW
  WHEN (
    (TG_OP = 'INSERT' AND NEW.is_draft = false)
    OR (TG_OP = 'UPDATE' AND OLD.is_draft IS TRUE AND NEW.is_draft = false)
  )
  EXECUTE FUNCTION notify_movers_with_nearby_missions();

-- urgent_quote_requests (widget admin) : un brouillon ne doit jamais
-- apparaitre comme demande urgente sans devis.
CREATE OR REPLACE VIEW urgent_quote_requests AS
SELECT
  qr.id,
  qr.client_user_id,
  qr.client_name,
  qr.client_email,
  qr.client_phone,
  qr.from_address,
  qr.from_city,
  qr.to_address,
  qr.to_city,
  qr.moving_date,
  qr.date_flexibility_days,
  qr.created_at,
  qr.status,
  (qr.moving_date - CURRENT_DATE) as days_until_move,
  (SELECT COUNT(*) FROM quotes WHERE quote_request_id = qr.id) as quote_count
FROM quote_requests qr
WHERE
  qr.is_draft = false
  AND qr.status = 'new'
  AND (qr.moving_date - CURRENT_DATE) <= 10
  AND (qr.moving_date - CURRENT_DATE) >= 0
  AND (SELECT COUNT(*) FROM quotes WHERE quote_request_id = qr.id) = 0
  AND qr.from_home_size IS NOT NULL AND qr.from_home_size <> ''
  AND qr.from_home_type IS NOT NULL AND qr.from_home_type <> ''
  AND qr.to_home_size IS NOT NULL AND qr.to_home_size <> ''
  AND qr.to_home_type IS NOT NULL AND qr.to_home_type <> ''
  AND qr.volume_m3 IS NOT NULL AND qr.volume_m3 > 0
ORDER BY qr.moving_date ASC;
