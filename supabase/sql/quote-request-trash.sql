-- Additive, reversible quote-request trash; business records are never deleted.
BEGIN;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS deleted_by uuid;
CREATE INDEX IF NOT EXISTS quote_requests_trash_date ON public.quote_requests (deleted_at DESC) WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.quote_trash_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.quote_trash_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_trash_is_admin() TO authenticated;

-- Restrictive policies are ANDed with every existing permissive policy.
DROP POLICY IF EXISTS quote_trash_read_guard ON public.quote_requests;
CREATE POLICY quote_trash_read_guard ON public.quote_requests AS RESTRICTIVE FOR SELECT TO authenticated
 USING (deleted_at IS NULL OR public.quote_trash_is_admin());
DROP POLICY IF EXISTS quote_trash_write_guard ON public.quote_requests;
CREATE POLICY quote_trash_write_guard ON public.quote_requests AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (deleted_at IS NULL OR public.quote_trash_is_admin())
 WITH CHECK (deleted_at IS NULL OR public.quote_trash_is_admin());
DROP POLICY IF EXISTS quote_trash_no_admin_hard_delete ON public.quote_requests;
CREATE POLICY quote_trash_no_admin_hard_delete ON public.quote_requests AS RESTRICTIVE FOR DELETE TO authenticated
 USING (NOT public.quote_trash_is_admin() AND deleted_at IS NULL);

CREATE OR REPLACE FUNCTION public.guard_quote_trash_metadata() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
   IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN
     RAISE EXCEPTION 'Les nouvelles demandes ne peuvent pas être créées dans la corbeille' USING ERRCODE='42501';
   END IF;
 ELSIF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by THEN
   IF NOT public.quote_trash_is_admin() THEN
     RAISE EXCEPTION 'Action réservée aux administrateurs' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_quote_trash_metadata ON public.quote_requests;
CREATE TRIGGER guard_quote_trash_metadata BEFORE INSERT OR UPDATE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.guard_quote_trash_metadata();

CREATE OR REPLACE FUNCTION public.admin_trash_quote_request(request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result uuid;
BEGIN
 IF NOT public.quote_trash_is_admin() THEN RAISE EXCEPTION 'Action réservée aux administrateurs' USING ERRCODE='42501'; END IF;
 UPDATE public.quote_requests SET deleted_at = COALESCE(deleted_at, now()), deleted_by = COALESCE(deleted_by, auth.uid())
 WHERE id = request_id RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'Demande introuvable' USING ERRCODE='P0002'; END IF;
 RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_restore_quote_request(request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result uuid;
BEGIN
 IF NOT public.quote_trash_is_admin() THEN RAISE EXCEPTION 'Action réservée aux administrateurs' USING ERRCODE='42501'; END IF;
 UPDATE public.quote_requests SET deleted_at = NULL, deleted_by = NULL WHERE id = request_id RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'Demande introuvable' USING ERRCODE='P0002'; END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_trash_quote_request(uuid), public.admin_restore_quote_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_trash_quote_request(uuid), public.admin_restore_quote_request(uuid) TO authenticated;

-- The timestamp trigger must not turn trash/restore into a client content edit.
DROP TRIGGER IF EXISTS update_quote_requests_updated_at ON public.quote_requests;
CREATE TRIGGER update_quote_requests_updated_at BEFORE UPDATE ON public.quote_requests FOR EACH ROW WHEN ((to_jsonb(OLD) - 'deleted_at' - 'deleted_by') IS DISTINCT FROM (to_jsonb(NEW) - 'deleted_at' - 'deleted_by')) EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE VIEW public.quote_requests_with_counts AS  SELECT qr.id,
    qr.client_user_id,
    qr.client_name,
    qr.client_email,
    qr.client_phone,
    qr.from_address,
    qr.from_city,
    qr.from_postal_code,
    qr.to_address,
    qr.to_city,
    qr.to_postal_code,
    qr.moving_date,
    qr.home_size,
    qr.home_type,
    qr.floor_from,
    qr.floor_to,
    qr.elevator_from,
    qr.elevator_to,
    qr.services_needed,
    qr.additional_info,
    qr.status,
    qr.assigned_mover_id,
    qr.created_at,
    qr.updated_at,
    qr.elevator_capacity_from,
    qr.elevator_capacity_to,
    qr.surface_m2,
    qr.volume_m3,
    qr.accepted_quote_id,
    qr.payment_status,
    qr.furniture_lift_needed_departure,
    qr.furniture_lift_needed_arrival,
    count(q.id) AS quotes_count
   FROM (quote_requests qr
     LEFT JOIN quotes q ON ((q.quote_request_id = qr.id)))
  WHERE qr.deleted_at IS NULL
  GROUP BY qr.id;
CREATE OR REPLACE VIEW public.urgent_quote_requests AS  SELECT id,
    client_user_id,
    client_name,
    client_email,
    client_phone,
    from_address,
    from_city,
    to_address,
    to_city,
    moving_date,
    date_flexibility_days,
    created_at,
    status,
    (moving_date - CURRENT_DATE) AS days_until_move,
    ( SELECT count(*) AS count
           FROM quotes
          WHERE (quotes.quote_request_id = qr.id)) AS quote_count
   FROM quote_requests qr
  WHERE qr.deleted_at IS NULL AND ((is_draft = false) AND (status = 'new'::text) AND ((moving_date - CURRENT_DATE) <= 10) AND ((moving_date - CURRENT_DATE) >= 0) AND (( SELECT count(*) AS count
           FROM quotes
          WHERE (quotes.quote_request_id = qr.id)) = 0) AND (from_home_size IS NOT NULL) AND (from_home_size <> ''::text) AND (from_home_type IS NOT NULL) AND (from_home_type <> ''::text) AND (to_home_size IS NOT NULL) AND (to_home_size <> ''::text) AND (to_home_type IS NOT NULL) AND (to_home_type <> ''::text) AND (volume_m3 IS NOT NULL) AND (volume_m3 > (0)::numeric))
  ORDER BY moving_date;
CREATE OR REPLACE VIEW public.nearby_mission_opportunities AS  SELECT qr_new.id AS new_request_id,
    qr_new.from_city AS new_from_city,
    qr_new.to_city AS new_to_city,
    qr_new.moving_date AS new_moving_date,
    m.id AS mover_id,
    m.company_name,
    qr_existing.id AS existing_mission_id,
    qr_existing.to_city AS existing_to_city,
    qr_existing.moving_date AS existing_mission_date,
    calculate_distance_km(qr_existing.to_latitude, qr_existing.to_longitude, qr_new.from_latitude, qr_new.from_longitude) AS distance_km
   FROM (((quote_requests qr_new
     CROSS JOIN movers m)
     JOIN quotes q ON ((q.mover_id = m.id)))
     JOIN quote_requests qr_existing ON ((qr_existing.id = q.quote_request_id)))
  WHERE qr_new.deleted_at IS NULL AND qr_existing.deleted_at IS NULL AND ((m.verification_status = 'verified'::text) AND (m.is_active = true) AND (q.status = 'accepted'::text) AND (qr_existing.status = ANY (ARRAY['accepted'::text, 'ongoing'::text])) AND (qr_existing.moving_date >= CURRENT_DATE) AND (qr_new.from_latitude IS NOT NULL) AND (qr_new.from_longitude IS NOT NULL) AND (qr_existing.to_latitude IS NOT NULL) AND (qr_existing.to_longitude IS NOT NULL) AND (calculate_distance_km(qr_existing.to_latitude, qr_existing.to_longitude, qr_new.from_latitude, qr_new.from_longitude) <= (200)::numeric))
  ORDER BY (calculate_distance_km(qr_existing.to_latitude, qr_existing.to_longitude, qr_new.from_latitude, qr_new.from_longitude));
CREATE OR REPLACE VIEW public.quote_requests_with_privacy AS  SELECT id,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM admins
              WHERE (admins.user_id = auth.uid()))) THEN client_name
            WHEN (client_user_id = auth.uid()) THEN client_name
            WHEN (EXISTS ( SELECT 1
               FROM movers
              WHERE (movers.user_id = auth.uid()))) THEN
            CASE
                WHEN mover_has_paid_access(id, auth.uid()) THEN client_name
                ELSE mask_name(client_name)
            END
            ELSE mask_name(client_name)
        END AS client_name,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM admins
              WHERE (admins.user_id = auth.uid()))) THEN client_email
            WHEN (client_user_id = auth.uid()) THEN client_email
            WHEN (EXISTS ( SELECT 1
               FROM movers
              WHERE (movers.user_id = auth.uid()))) THEN
            CASE
                WHEN mover_has_paid_access(id, auth.uid()) THEN client_email
                ELSE mask_email(client_email)
            END
            ELSE mask_email(client_email)
        END AS client_email,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM admins
              WHERE (admins.user_id = auth.uid()))) THEN client_phone
            WHEN (client_user_id = auth.uid()) THEN client_phone
            WHEN (EXISTS ( SELECT 1
               FROM movers
              WHERE (movers.user_id = auth.uid()))) THEN
            CASE
                WHEN mover_has_paid_access(id, auth.uid()) THEN client_phone
                ELSE mask_phone(client_phone)
            END
            ELSE mask_phone(client_phone)
        END AS client_phone,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM admins
              WHERE (admins.user_id = auth.uid()))) THEN from_address
            WHEN (client_user_id = auth.uid()) THEN from_address
            WHEN (EXISTS ( SELECT 1
               FROM movers
              WHERE (movers.user_id = auth.uid()))) THEN
            CASE
                WHEN mover_has_paid_access(id, auth.uid()) THEN from_address
                ELSE mask_address(from_address, from_city, from_postal_code)
            END
            ELSE mask_address(from_address, from_city, from_postal_code)
        END AS from_address,
    from_city,
    from_postal_code,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM admins
              WHERE (admins.user_id = auth.uid()))) THEN to_address
            WHEN (client_user_id = auth.uid()) THEN to_address
            WHEN (EXISTS ( SELECT 1
               FROM movers
              WHERE (movers.user_id = auth.uid()))) THEN
            CASE
                WHEN mover_has_paid_access(id, auth.uid()) THEN to_address
                ELSE mask_address(to_address, to_city, to_postal_code)
            END
            ELSE mask_address(to_address, to_city, to_postal_code)
        END AS to_address,
    to_city,
    to_postal_code,
    moving_date,
    home_size,
    home_type,
    floor_from,
    floor_to,
    elevator_from,
    elevator_to,
    elevator_capacity_from,
    elevator_capacity_to,
    surface_m2,
    volume_m3,
    from_home_type,
    from_home_size,
    from_surface_m2,
    to_home_type,
    to_home_size,
    to_surface_m2,
    furniture_lift_needed_departure,
    furniture_lift_needed_arrival,
    date_flexibility_days,
    services_needed,
    additional_info,
    status,
    assigned_mover_id,
    accepted_quote_id,
    payment_status,
    client_user_id,
    created_at,
    updated_at,
    accepts_groupage,
    furniture_inventory,
    furniture_photos,
    carrying_distance_from,
    carrying_distance_to,
    distance_km,
    market_price_estimate,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM admins
              WHERE (admins.user_id = auth.uid()))) THEN false
            WHEN (client_user_id = auth.uid()) THEN false
            WHEN (EXISTS ( SELECT 1
               FROM movers
              WHERE (movers.user_id = auth.uid()))) THEN (NOT mover_has_paid_access(id, auth.uid()))
            ELSE true
        END AS is_data_masked,
    reference,
    is_draft
   FROM quote_requests qr WHERE qr.deleted_at IS NULL;
-- Liste publique des déménagements ouverts : aucune donnée client, seulement villes, date, volume, distance.
CREATE OR REPLACE FUNCTION public.list_open_moves()
RETURNS TABLE (id uuid, reference text, from_city text, from_postal_code text, to_city text, to_postal_code text,
  moving_date date, volume_m3 numeric, distance_km numeric, from_home_size text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT qr.id, qr.reference::text, qr.from_city::text, qr.from_postal_code::text, qr.to_city::text, qr.to_postal_code::text,
    qr.moving_date::date, qr.volume_m3::numeric, qr.distance_km::numeric, qr.from_home_size::text
  FROM quote_requests qr
  WHERE qr.deleted_at IS NULL AND qr.status IN ('new','quoted')
    AND COALESCE(qr.is_draft,false) = false
    AND qr.moving_date >= CURRENT_DATE
  ORDER BY qr.moving_date ASC;
$$;
REVOKE ALL ON FUNCTION public.list_open_moves() FROM public;
GRANT EXECUTE ON FUNCTION public.list_open_moves() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_admin_alerts_for_urgent_quote_requests()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  urgent_request RECORD;
  admin_record RECORD;
  notification_exists boolean;
BEGIN
  -- Loop through all urgent quote requests
  FOR urgent_request IN 
    SELECT * FROM urgent_quote_requests
  LOOP
    -- Loop through all admins
    FOR admin_record IN 
      SELECT user_id FROM admins WHERE role IN ('super_admin', 'admin_agent')
    LOOP
      -- Check if notification already exists for this admin and quote request
      SELECT EXISTS(
        SELECT 1 FROM notifications 
        WHERE user_id = admin_record.user_id 
        AND type = 'urgent_quote_request'
        AND data->>'quote_request_id' = urgent_request.id::text
        AND created_at > CURRENT_DATE - INTERVAL '1 day'
      ) INTO notification_exists;
      
      -- Create notification only if it doesn't exist
      IF NOT notification_exists THEN
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message,
          data,
          is_read
        ) VALUES (
          admin_record.user_id,
          'urgent_quote_request',
          'Demande urgente sans devis',
          format(
            'La demande de %s pour un déménagement le %s (dans %s jours) n''a reçu aucun devis !',
            urgent_request.client_name,
            to_char(urgent_request.moving_date, 'DD/MM/YYYY'),
            urgent_request.days_until_move
          ),
          jsonb_build_object(
            'quote_request_id', urgent_request.id,
            'client_name', urgent_request.client_name,
            'moving_date', urgent_request.moving_date,
            'days_until_move', urgent_request.days_until_move,
            'from_address', urgent_request.from_address,
            'to_address', urgent_request.to_address
          ),
          false
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_and_alert_urgent_quote_requests()
 RETURNS TABLE(alert_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  count_created integer := 0;
BEGIN
  -- Call the function to create alerts
  PERFORM create_admin_alerts_for_urgent_quote_requests();
  
  -- Count how many urgent requests exist
  SELECT COUNT(*)::integer INTO count_created FROM urgent_quote_requests;
  
  RETURN QUERY SELECT count_created;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.groupage_alert_movers(p_alert uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g record; a record; b record; n integer := 0; m record; msg text;
BEGIN
  SELECT * INTO g FROM groupage_alerts WHERE id = p_alert;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO a FROM (SELECT * FROM public.quote_requests WHERE deleted_at IS NULL) live_requests WHERE id = g.request_a;
  SELECT * INTO b FROM (SELECT * FROM public.quote_requests WHERE deleted_at IS NULL) live_requests WHERE id = g.request_b;
  IF a.id IS NULL OR b.id IS NULL THEN RETURN 0; END IF;
  IF g.kind = 'same_route' THEN
    msg := 'Groupage possible : 2 déménagements sur le même trajet ' || a.from_city || ' → ' || a.to_city || ' (' || TO_CHAR(a.moving_date,'DD/MM') || ') et ' || b.from_city || ' → ' || b.to_city || ' (' || TO_CHAR(b.moving_date,'DD/MM') || '). Un seul camion, deux missions.';
  ELSE
    msg := 'Évitez le retour à vide : ' || a.from_city || ' → ' || a.to_city || ' le ' || TO_CHAR(a.moving_date,'DD/MM') || ', puis ' || b.from_city || ' → ' || b.to_city || ' le ' || TO_CHAR(b.moving_date,'DD/MM') || '.';
  END IF;
  FOR m IN SELECT user_id FROM movers WHERE verification_status = 'verified' AND COALESCE(is_active, true) AND user_id IS NOT NULL LOOP
    INSERT INTO notifications (user_id, user_type, type, title, message, related_id)
    VALUES (m.user_id, 'mover', 'info', '🚚 Groupage disponible', msg, g.request_a);
    n := n + 1;
  END LOOP;
  UPDATE groupage_alerts SET movers_alerted_at = now(), movers_alerted_count = n, emails_sent_at = NULL WHERE id = p_alert;
  RETURN n;
END $function$
;
CREATE OR REPLACE FUNCTION public.detect_groupages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; new_id uuid; ad record; total integer := 0;
BEGIN
  FOR r IN
    WITH act AS (
      SELECT * FROM quote_requests
      WHERE deleted_at IS NULL AND status IN ('new','assigned','quoted') AND moving_date >= CURRENT_DATE
        AND COALESCE(is_draft, false) = false
        AND from_latitude IS NOT NULL AND to_latitude IS NOT NULL
    )
    SELECT a.id AS ida, b.id AS idb, 'same_route' AS kind,
      calculate_distance_km(a.from_latitude,a.from_longitude,b.from_latitude,b.from_longitude) AS d1,
      calculate_distance_km(a.to_latitude,a.to_longitude,b.to_latitude,b.to_longitude) AS d2,
      abs(a.moving_date - b.moving_date) AS days
    FROM act a JOIN act b ON a.id < b.id AND abs(a.moving_date - b.moving_date) <= 3
    WHERE calculate_distance_km(a.from_latitude,a.from_longitude,b.from_latitude,b.from_longitude) <= 200
      AND calculate_distance_km(a.to_latitude,a.to_longitude,b.to_latitude,b.to_longitude) <= 200
    UNION ALL
    SELECT a.id, b.id, 'return_trip',
      calculate_distance_km(a.to_latitude,a.to_longitude,b.from_latitude,b.from_longitude),
      calculate_distance_km(a.from_latitude,a.from_longitude,b.to_latitude,b.to_longitude),
      (b.moving_date - a.moving_date)
    FROM act a JOIN act b ON a.id <> b.id AND (b.moving_date - a.moving_date) BETWEEN 0 AND 3
    WHERE calculate_distance_km(a.to_latitude,a.to_longitude,b.from_latitude,b.from_longitude) <= 200
      AND calculate_distance_km(a.from_latitude,a.from_longitude,a.to_latitude,a.to_longitude) > 200
  LOOP
    INSERT INTO groupage_alerts (request_a, request_b, kind, distance_1_km, distance_2_km, days_apart)
    VALUES (r.ida, r.idb, r.kind, round(r.d1), round(r.d2), r.days)
    ON CONFLICT DO NOTHING RETURNING id INTO new_id;
    IF new_id IS NOT NULL THEN
      total := total + 1;
      FOR ad IN SELECT user_id FROM admins LOOP
        INSERT INTO notifications (user_id, user_type, type, title, message, related_id)
        VALUES (ad.user_id, 'admin', 'info', 'Nouveau groupage détecté',
          CASE WHEN r.kind = 'same_route' THEN 'Deux déménagements sur le même trajet (moins de 200 km d''écart). Voir l''onglet Groupage.'
               ELSE 'Un déménagement peut éviter un retour à vide. Voir l''onglet Groupage.' END, r.ida);
      END LOOP;
      PERFORM groupage_alert_movers(new_id);
      new_id := NULL;
    END IF;
  END LOOP;
  RETURN total;
END $function$
;
CREATE OR REPLACE FUNCTION public.admin_add_quote_for_mover(p_request uuid, p_mover uuid, p_price numeric, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE qr record; mv record; qid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'Réservé aux admins'; END IF;
  IF p_price IS NULL OR p_price <= 0 THEN RAISE EXCEPTION 'Prix invalide'; END IF;
  SELECT * INTO qr FROM (SELECT * FROM public.quote_requests WHERE deleted_at IS NULL) live_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  SELECT * INTO mv FROM movers WHERE id = p_mover AND verification_status = 'verified';
  IF NOT FOUND THEN RAISE EXCEPTION 'Déménageur introuvable ou non vérifié'; END IF;
  IF EXISTS (SELECT 1 FROM quotes WHERE quote_request_id = p_request AND mover_id = p_mover AND status IN ('pending','accepted')) THEN
    RAISE EXCEPTION 'Ce déménageur a déjà un devis sur cette demande';
  END IF;
  INSERT INTO quotes (quote_request_id, mover_id, price, notes, status, validity_date, proposed_moving_date, added_by_admin)
  VALUES (p_request, p_mover, p_price, NULLIF(p_notes,''), 'pending', qr.moving_date, qr.moving_date, true)
  RETURNING id INTO qid;
  UPDATE quote_requests SET status = 'quoted' WHERE id = p_request AND status IN ('new','assigned');
  IF mv.user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, user_type, type, title, message, related_id)
    VALUES (mv.user_id, 'mover', 'info', 'Mission attribuée par TrouveTonDéménageur',
      'L''équipe a déposé pour vous un devis de ' || p_price || ' € pour ' || qr.from_city || ' → ' || qr.to_city || ' le ' || TO_CHAR(qr.moving_date,'DD/MM/YYYY') || '. Le client doit l''accepter.', p_request);
  END IF;
  RETURN qid;
END $function$
;
COMMIT;
