-- BUG CRITIQUE CORRIGÉ : quote_requests_with_privacy n'exposait jamais
-- is_draft, alors que MoverDashboard.tsx et MoverQuoteRequestsPage.tsx
-- (et probablement d'autres écrans) filtrent dessus (.eq('is_draft', false)).
-- Conséquence en production : la moindre requête sur cette vue avec ce
-- filtre échouait à 100%, tout le temps, pour TOUS les déménageurs, avec
-- une erreur Postgres 42703 ("column ... is_draft does not exist")
-- silencieusement avalée par le code -- affichant "Aucune demande
-- disponible" au lieu de la vraie erreur. Trouvé via la console
-- navigateur après plusieurs heures de diagnostic (le compte déménageur
-- était bien vérifié/actif, les demandes bien complètes en base, aucun
-- devis déjà déposé -- la vue elle-même était cassée).
--
-- Même pattern DROP+CREATE que quote-requests-view-add-reference-v2.sql
-- (CREATE OR REPLACE échoue sur cette vue à cause d'un problème d'ordre
-- de colonnes avec accepts_groupage).

DROP VIEW IF EXISTS quote_requests_with_privacy;

CREATE VIEW quote_requests_with_privacy AS
SELECT
  qr.id,
  CASE
    WHEN EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid()) THEN qr.client_name
    WHEN qr.client_user_id = auth.uid() THEN qr.client_name
    WHEN EXISTS (SELECT 1 FROM movers WHERE movers.user_id = auth.uid()) THEN
      CASE WHEN mover_has_paid_access(qr.id, auth.uid()) THEN qr.client_name ELSE mask_name(qr.client_name) END
    ELSE mask_name(qr.client_name)
  END AS client_name,

  CASE
    WHEN EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid()) THEN qr.client_email
    WHEN qr.client_user_id = auth.uid() THEN qr.client_email
    WHEN EXISTS (SELECT 1 FROM movers WHERE movers.user_id = auth.uid()) THEN
      CASE WHEN mover_has_paid_access(qr.id, auth.uid()) THEN qr.client_email ELSE mask_email(qr.client_email) END
    ELSE mask_email(qr.client_email)
  END AS client_email,

  CASE
    WHEN EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid()) THEN qr.client_phone
    WHEN qr.client_user_id = auth.uid() THEN qr.client_phone
    WHEN EXISTS (SELECT 1 FROM movers WHERE movers.user_id = auth.uid()) THEN
      CASE WHEN mover_has_paid_access(qr.id, auth.uid()) THEN qr.client_phone ELSE mask_phone(qr.client_phone) END
    ELSE mask_phone(qr.client_phone)
  END AS client_phone,

  CASE
    WHEN EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid()) THEN qr.from_address
    WHEN qr.client_user_id = auth.uid() THEN qr.from_address
    WHEN EXISTS (SELECT 1 FROM movers WHERE movers.user_id = auth.uid()) THEN
      CASE WHEN mover_has_paid_access(qr.id, auth.uid()) THEN qr.from_address ELSE mask_address(qr.from_address, qr.from_city, qr.from_postal_code) END
    ELSE mask_address(qr.from_address, qr.from_city, qr.from_postal_code)
  END AS from_address,

  qr.from_city,
  qr.from_postal_code,

  CASE
    WHEN EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid()) THEN qr.to_address
    WHEN qr.client_user_id = auth.uid() THEN qr.to_address
    WHEN EXISTS (SELECT 1 FROM movers WHERE movers.user_id = auth.uid()) THEN
      CASE WHEN mover_has_paid_access(qr.id, auth.uid()) THEN qr.to_address ELSE mask_address(qr.to_address, qr.to_city, qr.to_postal_code) END
    ELSE mask_address(qr.to_address, qr.to_city, qr.to_postal_code)
  END AS to_address,

  qr.to_city,
  qr.to_postal_code,
  qr.moving_date,
  qr.home_size,
  qr.home_type,
  qr.floor_from,
  qr.floor_to,
  qr.elevator_from,
  qr.elevator_to,
  qr.elevator_capacity_from,
  qr.elevator_capacity_to,
  qr.surface_m2,
  qr.volume_m3,
  qr.from_home_type,
  qr.from_home_size,
  qr.from_surface_m2,
  qr.to_home_type,
  qr.to_home_size,
  qr.to_surface_m2,
  qr.furniture_lift_needed_departure,
  qr.furniture_lift_needed_arrival,
  qr.date_flexibility_days,
  qr.services_needed,
  qr.additional_info,
  qr.status,
  qr.assigned_mover_id,
  qr.accepted_quote_id,
  qr.payment_status,
  qr.client_user_id,
  qr.created_at,
  qr.updated_at,
  qr.accepts_groupage,
  qr.furniture_inventory,
  qr.furniture_photos,
  qr.carrying_distance_from,
  qr.carrying_distance_to,
  qr.distance_km,
  qr.market_price_estimate,

  CASE
    WHEN EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid()) THEN false
    WHEN qr.client_user_id = auth.uid() THEN false
    WHEN EXISTS (SELECT 1 FROM movers WHERE movers.user_id = auth.uid()) THEN NOT mover_has_paid_access(qr.id, auth.uid())
    ELSE true
  END AS is_data_masked,

  qr.reference,
  qr.is_draft

FROM quote_requests qr;

GRANT SELECT ON quote_requests_with_privacy TO authenticated;
ALTER VIEW quote_requests_with_privacy SET (security_barrier = true);

COMMENT ON VIEW quote_requests_with_privacy IS
'Secure view that automatically masks client contact information for movers until first payment is completed. Includes all fields from quote_requests including furniture_inventory, furniture_photos, carrying distances, groupage preferences, distance_km, market_price_estimate, reference and is_draft.';
