-- Ajoute uniquement qr.reference à la vue existante (append en fin de
-- liste de colonnes, CREATE OR REPLACE VIEW ne permet pas d'insérer une
-- colonne au milieu sans DROP, donc on l'ajoute à la toute fin -- ça ne
-- casse rien côté frontend puisque le select() nomme les colonnes).

CREATE OR REPLACE VIEW quote_requests_with_privacy AS
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

  qr.reference

FROM quote_requests qr;

GRANT SELECT ON quote_requests_with_privacy TO authenticated;
ALTER VIEW quote_requests_with_privacy SET (security_barrier = true);
