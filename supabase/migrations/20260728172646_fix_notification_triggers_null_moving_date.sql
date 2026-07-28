/*
  # Fix: triggers de notification cassés par moving_date NULL

  1. Contexte
    - La migration précédente (20260728172001) a rendu `moving_date`
      nullable sur `quote_requests`, pour correspondre au champ
      "(optionnel)" du formulaire /devis-rapide.
    - Deux fonctions déclenchées automatiquement après chaque insertion
      dans `quote_requests` construisaient leur message de notification
      avec `TO_CHAR(NEW.moving_date, 'DD/MM/YYYY')`, sans gérer le cas
      NULL. En SQL, `TO_CHAR(NULL, ...)` renvoie NULL, et toute
      concaténation (`||`) ou `format()` avec un NULL comme
      TO_CHAR(...) rend l'intégralité du message NULL, ce qui viole la
      contrainte NOT NULL sur `notifications.message` et fait échouer
      l'insertion complète (y compris la ligne quote_requests
      elle-même, la transaction étant annulée).
    - Repéré via un test réel: /devis-rapide sans date renseignée
      renvoyait une erreur 500.

  2. Fonctions corrigées
    - `notify_admins_on_quote_request_insert` (notifie les admins)
    - `detect_activity_zone_matches` (notifie les déménageurs)
    Les deux utilisent maintenant COALESCE pour afficher "date à
    définir" au lieu de faire planter l'insertion quand moving_date
    est NULL.

  3. Non concerné
    - `notify_movers_with_nearby_missions` (vérifié: la date utilisée
      dans son message provient d'une sous-requête filtrée sur
      `moving_date >= CURRENT_DATE`, donc jamais NULL par construction,
      et la fonction retourne de toute façon avant si NEW.from_latitude
      est NULL — toujours le cas pour /devis-rapide).
    - `detect_return_trip_opportunities` (utilise moving_date dans un
      BETWEEN, pas dans un message texte: NULL fait juste échouer le
      match silencieusement, sans erreur).
*/

CREATE OR REPLACE FUNCTION notify_admins_on_quote_request_insert()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  admin_record RECORD;
  route_info TEXT;
BEGIN
  route_info := NEW.from_city || ' (' || NEW.from_postal_code || ') → ' ||
                NEW.to_city || ' (' || NEW.to_postal_code || ')';

  FOR admin_record IN
    SELECT user_id FROM admins
  LOOP
    INSERT INTO notifications (
      user_id,
      user_type,
      type,
      title,
      message,
      related_id,
      created_at
    ) VALUES (
      admin_record.user_id,
      'admin',
      'new_quote_request',
      'Nouvelle demande de devis',
      'Nouvelle demande de déménagement: ' || route_info || ' le ' ||
        COALESCE(TO_CHAR(NEW.moving_date, 'DD/MM/YYYY'), 'date à définir'),
      NEW.id,
      NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION detect_activity_zone_matches()
RETURNS TRIGGER AS $$
DECLARE
  v_mover RECORD;
  v_from_dept text;
  v_to_dept text;
BEGIN
  v_from_dept := LEFT(NEW.from_postal_code, 2);
  v_to_dept := LEFT(NEW.to_postal_code, 2);

  FOR v_mover IN
    SELECT id, user_id, email_notifications_enabled, coverage_type, activity_departments
    FROM movers
    WHERE verification_status = 'verified'
    AND is_active = true
    AND email_notifications_enabled = true
    AND (
      coverage_type = 'all_france'
      OR (
        coverage_type = 'departments'
        AND activity_departments IS NOT NULL
        AND array_length(activity_departments, 1) > 0
        AND (v_from_dept = ANY(activity_departments) OR v_to_dept = ANY(activity_departments))
      )
      OR (
        coverage_type = 'departments'
        AND (activity_departments IS NULL OR array_length(activity_departments, 1) = 0)
      )
    )
  LOOP
    INSERT INTO notifications (
      user_id,
      user_type,
      title,
      message,
      type,
      related_id,
      read,
      data
    ) VALUES (
      v_mover.user_id,
      'mover',
      'Nouvelle demande de devis disponible',
      format('Une nouvelle demande de déménagement de %s (%s) vers %s (%s) le %s est disponible.',
        NEW.from_city,
        LEFT(NEW.from_postal_code, 2),
        NEW.to_city,
        LEFT(NEW.to_postal_code, 2),
        COALESCE(to_char(NEW.moving_date, 'DD/MM/YYYY'), 'date à définir')
      ),
      'new_quote_request',
      NEW.id,
      false,
      jsonb_build_object(
        'quote_request_id', NEW.id,
        'from_city', NEW.from_city,
        'to_city', NEW.to_city,
        'moving_date', NEW.moving_date
      )
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
