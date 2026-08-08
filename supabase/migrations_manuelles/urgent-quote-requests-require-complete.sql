-- La vue urgent_quote_requests (widget admin "Demandes Urgentes Sans Devis")
-- n'avait aucun filtre de complétude : elle remontait aussi bien de vraies
-- demandes prêtes à être devisées que des leads /devis-rapide jamais
-- finalisés (pas d'étage/taille/type/cubage). Ces derniers créaient une
-- fausse urgence côté admin -- ils n'ont jamais pu être vus par un
-- déménageur de toute façon (send-mover-quote-reminders et le trigger de
-- notification appliquent déjà ce même filtre depuis le 07/08).
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
  qr.status = 'new'
  AND (qr.moving_date - CURRENT_DATE) <= 10
  AND (qr.moving_date - CURRENT_DATE) >= 0
  AND (SELECT COUNT(*) FROM quotes WHERE quote_request_id = qr.id) = 0
  AND qr.from_home_size IS NOT NULL AND qr.from_home_size <> ''
  AND qr.from_home_type IS NOT NULL AND qr.from_home_type <> ''
  AND qr.to_home_size IS NOT NULL AND qr.to_home_size <> ''
  AND qr.to_home_type IS NOT NULL AND qr.to_home_type <> ''
  AND qr.volume_m3 IS NOT NULL AND qr.volume_m3 > 0
ORDER BY qr.moving_date ASC;
