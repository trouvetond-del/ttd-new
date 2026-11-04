-- Mission en 4 étapes obligatoires, comptes chauffeurs, conservation des photos (1 an).
BEGIN;

-- 1. Taille d'équipe déclarée par l'entreprise (chauffeurs obligatoires dès 2 personnes)
ALTER TABLE public.movers ADD COLUMN IF NOT EXISTS team_size integer NOT NULL DEFAULT 1;

-- 2. Chauffeurs
CREATE TABLE IF NOT EXISTS public.mover_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mover_id uuid NOT NULL REFERENCES public.movers(id) ON DELETE CASCADE,
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  invited_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mover_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mover_drivers TO authenticated;
GRANT ALL ON public.mover_drivers TO service_role;
ALTER TABLE public.mover_drivers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE lower(email) = lower(auth.jwt()->>'email'));
$$;

DROP POLICY IF EXISTS "owner manages drivers" ON public.mover_drivers;
CREATE POLICY "owner manages drivers" ON public.mover_drivers FOR ALL TO authenticated
  USING (mover_id IN (SELECT id FROM public.movers WHERE user_id = auth.uid()))
  WITH CHECK (mover_id IN (SELECT id FROM public.movers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "driver reads self" ON public.mover_drivers;
CREATE POLICY "driver reads self" ON public.mover_drivers FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "admin reads drivers" ON public.mover_drivers;
CREATE POLICY "admin reads drivers" ON public.mover_drivers FOR SELECT TO authenticated USING (public.is_platform_admin());

-- 3. Étapes de mission
ALTER TABLE public.moving_status
  ADD COLUMN IF NOT EXISTS mission_step text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS loading_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS loading_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS unloading_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS unloading_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES public.mover_drivers(id) ON DELETE SET NULL;
ALTER TABLE public.moving_status DROP CONSTRAINT IF EXISTS moving_status_mission_step_check;
ALTER TABLE public.moving_status ADD CONSTRAINT moving_status_mission_step_check
  CHECK (mission_step IN ('not_started','loading','loaded','unloading','completed'));

-- Qui peut agir sur la mission : l'entreprise dont le devis est accepté, ou son chauffeur assigné
CREATE OR REPLACE FUNCTION public.mission_actor(p_qr uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mover uuid;
BEGIN
  SELECT q.mover_id INTO v_mover FROM quotes q WHERE q.quote_request_id = p_qr AND q.status = 'accepted' LIMIT 1;
  IF v_mover IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM movers WHERE id = v_mover AND user_id = auth.uid()) THEN RETURN 'owner'; END IF;
  IF EXISTS (SELECT 1 FROM moving_status ms JOIN mover_drivers d ON d.id = ms.assigned_driver_id
             WHERE ms.quote_request_id = p_qr AND d.user_id = auth.uid() AND d.active AND d.mover_id = v_mover) THEN
    RETURN 'driver';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.mission_state(p_qr uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_actor text; v_mover uuid; v_team int; v_drivers int; lp int; up int;
BEGIN
  v_actor := mission_actor(p_qr);
  IF v_actor IS NULL AND NOT is_platform_admin()
     AND NOT EXISTS (SELECT 1 FROM quote_requests WHERE id = p_qr AND client_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  SELECT * INTO r FROM moving_status WHERE quote_request_id = p_qr;
  SELECT q.mover_id INTO v_mover FROM quotes q WHERE q.quote_request_id = p_qr AND q.status = 'accepted' LIMIT 1;
  SELECT team_size INTO v_team FROM movers WHERE id = v_mover;
  SELECT count(*) INTO v_drivers FROM mover_drivers WHERE mover_id = v_mover AND active;
  SELECT count(*) INTO lp FROM moving_photos WHERE quote_request_id = p_qr AND photo_type = 'loading' AND (metadata->>'mission_step') = 'loading';
  SELECT count(*) INTO up FROM moving_photos WHERE quote_request_id = p_qr AND photo_type = 'unloading' AND (metadata->>'mission_step') = 'unloading';
  RETURN jsonb_build_object(
    'actor', v_actor,
    'step', COALESCE(r.mission_step, 'not_started'),
    'loading_started_at', r.loading_started_at, 'loading_completed_at', r.loading_completed_at,
    'unloading_started_at', r.unloading_started_at, 'unloading_completed_at', r.unloading_completed_at,
    'assigned_driver_id', r.assigned_driver_id,
    'driver_required', COALESCE(v_team, 1) >= 2,
    'drivers_count', v_drivers,
    'loading_photos', lp, 'unloading_photos', up);
END $$;

CREATE OR REPLACE FUNCTION public.mission_assign_driver(p_qr uuid, p_driver uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mover uuid;
BEGIN
  IF mission_actor(p_qr) <> 'owner' OR mission_actor(p_qr) IS NULL THEN RAISE EXCEPTION 'Seule l''entreprise peut choisir le chauffeur'; END IF;
  SELECT q.mover_id INTO v_mover FROM quotes q WHERE q.quote_request_id = p_qr AND q.status = 'accepted' LIMIT 1;
  IF p_driver IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mover_drivers WHERE id = p_driver AND mover_id = v_mover AND active) THEN
    RAISE EXCEPTION 'Chauffeur inconnu';
  END IF;
  INSERT INTO moving_status (quote_request_id, assigned_driver_id) VALUES (p_qr, p_driver)
  ON CONFLICT (quote_request_id) DO UPDATE SET assigned_driver_id = EXCLUDED.assigned_driver_id, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.mission_add_photo(p_qr uuid, p_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_step text;
BEGIN
  IF mission_actor(p_qr) IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p_path NOT LIKE p_qr::text || '/%' THEN RAISE EXCEPTION 'Chemin invalide'; END IF;
  SELECT mission_step INTO v_step FROM moving_status WHERE quote_request_id = p_qr;
  IF v_step NOT IN ('loading','unloading') THEN RAISE EXCEPTION 'Démarrez d''abord l''étape'; END IF;
  INSERT INTO moving_photos (quote_request_id, uploaded_by, photo_type, storage_path, metadata)
  VALUES (p_qr, auth.uid(), v_step, p_path, jsonb_build_object('mission_step', v_step, 'by', mission_actor(p_qr)));
END $$;

CREATE OR REPLACE FUNCTION public.mission_advance(p_qr uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; v_step text; v_next text;
BEGIN
  IF mission_actor(p_qr) IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  s := mission_state(p_qr);
  v_step := s->>'step';
  IF v_step = 'not_started' THEN
    IF (s->>'driver_required')::boolean AND (s->>'assigned_driver_id') IS NULL THEN
      RAISE EXCEPTION 'Votre équipe compte plusieurs personnes : choisissez d''abord le chauffeur de la mission';
    END IF;
    v_next := 'loading';
    INSERT INTO moving_status (quote_request_id, mission_step, loading_started_at, started_at, status)
    VALUES (p_qr, 'loading', now(), now(), 'in_transit')
    ON CONFLICT (quote_request_id) DO UPDATE SET mission_step = 'loading', loading_started_at = now(), started_at = COALESCE(moving_status.started_at, now()), updated_at = now();
  ELSIF v_step = 'loading' THEN
    IF (s->>'loading_photos')::int < 3 THEN RAISE EXCEPTION 'Ajoutez au moins 3 photos du chargement'; END IF;
    v_next := 'loaded';
    UPDATE moving_status SET mission_step = 'loaded', loading_completed_at = now(), loaded_at = now(), status = 'loading_photos_uploaded', updated_at = now() WHERE quote_request_id = p_qr;
  ELSIF v_step = 'loaded' THEN
    v_next := 'unloading';
    UPDATE moving_status SET mission_step = 'unloading', unloading_started_at = now(), arrived_at = now(), status = 'arrived', updated_at = now() WHERE quote_request_id = p_qr;
  ELSIF v_step = 'unloading' THEN
    IF (s->>'unloading_photos')::int < 3 THEN RAISE EXCEPTION 'Ajoutez au moins 3 photos du déchargement'; END IF;
    v_next := 'completed';
    UPDATE moving_status SET mission_step = 'completed', unloading_completed_at = now(), status = 'unloading_photos_uploaded', updated_at = now() WHERE quote_request_id = p_qr;
  ELSE
    RAISE EXCEPTION 'Mission déjà terminée';
  END IF;
  RETURN v_next;
END $$;

-- Missions visibles par un chauffeur (sans prix ni coordonnées bancaires)
CREATE OR REPLACE FUNCTION public.driver_missions() RETURNS TABLE (
  quote_request_id uuid, reference text, moving_date date, from_address text, from_city text, to_address text, to_city text,
  floor_from text, floor_to text, volume_m3 numeric, client_name text, client_phone text, mission_step text, company_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT qr.id, qr.reference, qr.moving_date::date, qr.from_address, qr.from_city, qr.to_address, qr.to_city,
         qr.floor_from::text, qr.floor_to::text, qr.volume_m3::numeric, qr.client_name, qr.client_phone, ms.mission_step, m.company_name
  FROM moving_status ms
  JOIN mover_drivers d ON d.id = ms.assigned_driver_id AND d.user_id = auth.uid() AND d.active
  JOIN movers m ON m.id = d.mover_id
  JOIN quote_requests qr ON qr.id = ms.quote_request_id
  JOIN quotes q ON q.quote_request_id = qr.id AND q.status = 'accepted' AND q.mover_id = d.mover_id
  ORDER BY qr.moving_date;
$$;

GRANT EXECUTE ON FUNCTION public.mission_state(uuid), public.mission_assign_driver(uuid, uuid), public.mission_add_photo(uuid, text),
  public.mission_advance(uuid), public.driver_missions(), public.is_platform_admin() TO authenticated;

-- 4. Conservation : photos supprimées 1 an après la fin de mission, sauf réclamation ouverte
CREATE OR REPLACE FUNCTION public.expired_mission_photos() RETURNS TABLE (id uuid, storage_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.storage_path FROM moving_photos p
  JOIN quote_requests qr ON qr.id = p.quote_request_id
  LEFT JOIN moving_status ms ON ms.quote_request_id = p.quote_request_id
  WHERE COALESCE(ms.unloading_completed_at, ms.completed_at, qr.moving_date::timestamptz) < now() - interval '365 days'
    AND NOT EXISTS (SELECT 1 FROM damage_reports d WHERE d.quote_request_id = p.quote_request_id AND d.status IN ('pending','under_review'))
  LIMIT 1000;
$$;
REVOKE ALL ON FUNCTION public.expired_mission_photos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expired_mission_photos() TO service_role;

-- 5. Envoi des photos de mission dans le dossier de la demande (entreprise ou chauffeur assigné)
DROP POLICY IF EXISTS "mission actors upload photos" ON storage.objects;
CREATE POLICY "mission actors upload photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'moving-photos'
    AND name LIKE '%/mission\_%'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN public.mission_actor(((storage.foldername(name))[1])::uuid) IS NOT NULL ELSE false END
  );
GRANT EXECUTE ON FUNCTION public.mission_actor(uuid) TO authenticated;

COMMIT;
