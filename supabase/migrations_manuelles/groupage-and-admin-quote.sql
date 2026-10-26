-- Groupage (déménagements proches < 200 km, ≤ 3 jours d'écart) + devis déposé par l'admin. Idempotent.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS added_by_admin boolean NOT NULL DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS mover_email_sent_at timestamptz;

CREATE TABLE IF NOT EXISTS public.groupage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_a uuid NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  request_b uuid NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('same_route', 'return_trip')),
  distance_1_km numeric,
  distance_2_km numeric,
  days_apart integer,
  movers_alerted_at timestamptz,
  movers_alerted_count integer DEFAULT 0,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_a, request_b, kind)
);
GRANT SELECT, UPDATE ON public.groupage_alerts TO authenticated;
GRANT ALL ON public.groupage_alerts TO service_role;
ALTER TABLE public.groupage_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read groupage" ON public.groupage_alerts;
CREATE POLICY "Admins read groupage" ON public.groupage_alerts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid()));
DROP POLICY IF EXISTS "Admins update groupage" ON public.groupage_alerts;
CREATE POLICY "Admins update groupage" ON public.groupage_alerts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid()));

ALTER TABLE public.groupage_alerts ADD COLUMN IF NOT EXISTS emails_sent_at timestamptz;

-- Prévient tous les déménageurs vérifiés d'un groupage
CREATE OR REPLACE FUNCTION public.groupage_alert_movers(p_alert uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; a record; b record; n integer := 0; m record; msg text;
BEGIN
  SELECT * INTO g FROM groupage_alerts WHERE id = p_alert;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO a FROM quote_requests WHERE id = g.request_a;
  SELECT * INTO b FROM quote_requests WHERE id = g.request_b;
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
END $$;

-- Détecte les nouveaux groupages, alerte admins + déménageurs vérifiés
CREATE OR REPLACE FUNCTION public.detect_groupages()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; new_id uuid; ad record; total integer := 0;
BEGIN
  FOR r IN
    WITH act AS (
      SELECT * FROM quote_requests
      WHERE status IN ('new','assigned','quoted') AND moving_date >= CURRENT_DATE
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
END $$;

-- Relance manuelle depuis l'admin
CREATE OR REPLACE FUNCTION public.admin_groupage_alert_movers(p_alert uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'Réservé aux admins'; END IF;
  RETURN groupage_alert_movers(p_alert);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_groupage_alert_movers(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.groupage_alert_movers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_groupages() FROM PUBLIC, anon, authenticated;

-- L'admin dépose un devis au nom d'un déménageur (le client accepte et paie l'acompte comme d'habitude)
CREATE OR REPLACE FUNCTION public.admin_add_quote_for_mover(p_request uuid, p_mover uuid, p_price numeric, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE qr record; mv record; qid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'Réservé aux admins'; END IF;
  IF p_price IS NULL OR p_price <= 0 THEN RAISE EXCEPTION 'Prix invalide'; END IF;
  SELECT * INTO qr FROM quote_requests WHERE id = p_request;
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
END $$;
GRANT EXECUTE ON FUNCTION public.admin_add_quote_for_mover(uuid, uuid, numeric, text) TO authenticated;

-- Détection toutes les heures
DO $$ BEGIN PERFORM cron.unschedule('detect-groupages'); EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule('detect-groupages', '15 * * * *', $$ SELECT public.detect_groupages(); $$);
SELECT public.detect_groupages();

DO $$ BEGIN PERFORM cron.unschedule('send-groupage-emails'); EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule('send-groupage-emails', '7,22,37,52 * * * *', $c$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/send-groupage-emails',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-agent-secret', (SELECT secret FROM public.agent_secrets WHERE name = 'cron'))
  );
$c$);
