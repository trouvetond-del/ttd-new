-- Le trigger trigger_notify_nearby_missions notifiait les déménageurs dès
-- l'INSERT d'une demande, même totalement vide (cas du devis-rapide
-- jamais finalisé : from_home_size, from_home_type, volume_m3,
-- from_surface_m2 tous vides). On ajoute la même vérification de
-- complétude que côté page déménageur et relances.

CREATE OR REPLACE FUNCTION notify_movers_with_nearby_missions()
RETURNS TRIGGER AS $$
DECLARE
  v_mover RECORD;
  v_mission RECORD;
  v_distance numeric;
  v_notification_count integer := 0;
BEGIN
  IF NEW.from_latitude IS NULL OR NEW.from_longitude IS NULL THEN
    RETURN NEW;
  END IF;

  -- Ne notifie que pour une demande réellement complète (le client a fini
  -- /client/quote), jamais pour un simple devis-rapide non finalisé.
  IF NEW.from_home_size IS NULL OR NEW.from_home_size = '' OR
     NEW.from_home_type IS NULL OR NEW.from_home_type = '' OR
     NEW.to_home_size IS NULL OR NEW.to_home_size = '' OR
     NEW.to_home_type IS NULL OR NEW.to_home_type = '' OR
     NEW.volume_m3 IS NULL OR NEW.volume_m3 <= 0 THEN
    RETURN NEW;
  END IF;

  FOR v_mover IN
    SELECT DISTINCT m.id, m.user_id, m.company_name
    FROM movers m
    WHERE m.verification_status = 'verified'
    AND m.is_active = true
    AND m.email_notifications_enabled = true
  LOOP
    FOR v_mission IN
      SELECT DISTINCT qr.id, qr.to_latitude, qr.to_longitude, qr.to_city, qr.moving_date
      FROM quote_requests qr
      INNER JOIN quotes q ON q.quote_request_id = qr.id
      WHERE q.mover_id = v_mover.id
      AND q.status = 'accepted'
      AND qr.status IN ('accepted', 'ongoing')
      AND qr.to_latitude IS NOT NULL
      AND qr.to_longitude IS NOT NULL
      AND qr.moving_date >= CURRENT_DATE
    LOOP
      v_distance := calculate_distance_km(
        v_mission.to_latitude,
        v_mission.to_longitude,
        NEW.from_latitude,
        NEW.from_longitude
      );

      IF v_distance IS NOT NULL AND v_distance <= 200 THEN
        INSERT INTO notifications (
          user_id, user_type, title, message, type, related_id, read, data
        ) VALUES (
          v_mover.user_id,
          'mover',
          'Nouvelle demande proche de votre mission',
          format(
            'Une nouvelle demande de déménagement depuis %s est disponible à seulement %s km du point d''arrivée de votre mission à %s (prévue le %s). Cela pourrait être une opportunité de rentabiliser votre retour !',
            NEW.from_city,
            ROUND(v_distance, 1),
            v_mission.to_city,
            to_char(v_mission.moving_date, 'DD/MM/YYYY')
          ),
          'nearby_mission_opportunity',
          NEW.id,
          false,
          jsonb_build_object(
            'quote_request_id', NEW.id,
            'existing_mission_id', v_mission.id,
            'distance_km', ROUND(v_distance, 1),
            'from_city', NEW.from_city,
            'to_city', NEW.to_city,
            'existing_mission_to_city', v_mission.to_city,
            'existing_mission_date', v_mission.moving_date,
            'moving_date', NEW.moving_date
          )
        )
        ON CONFLICT DO NOTHING;

        v_notification_count := v_notification_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF v_notification_count > 0 THEN
    RAISE NOTICE 'Créé % notification(s) pour missions proches', v_notification_count;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
