-- Complément au correctif déjà en place (critical-payment-security-fix.sql,
-- qui verrouille la table `payments`). Trouvé en creusant plus loin : le
-- client garde encore un accès direct en écriture à quote_requests.status
-- via la policy "Clients can update own quote requests" (WITH CHECK ne
-- vérifie que client_user_id = auth.uid(), aucune valeur n'est
-- restreinte). Même si le verrou sur `payments` empêche déjà le scénario
-- de fraude principal (le trigger update_quote_status_after_payment ne se
-- déclenchera plus jamais côté client), un client pourrait quand même,
-- indépendamment de tout paiement, appeler directement :
--   supabase.from('quote_requests').update({status:'accepted', accepted_quote_id: <n'importe quel id>})
-- Cette migration bloque ce chemin : seul le service_role (donc le webhook
-- Stripe après vérification réelle) peut faire passer une demande à
-- 'accepted'. Les autres modifications du client sur sa propre demande
-- (étage, cubage, adresses, etc.) restent inchangées.

CREATE OR REPLACE FUNCTION prevent_client_direct_acceptance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'Le passage au statut accepted doit se faire via un paiement confirmé (webhook Stripe)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_prevent_client_direct_acceptance ON quote_requests;
CREATE TRIGGER trigger_prevent_client_direct_acceptance
  BEFORE UPDATE ON quote_requests
  FOR EACH ROW
  EXECUTE FUNCTION prevent_client_direct_acceptance();

-- ─────────────────────────────────────────────────────────────────────────
-- AUTRE FAILLE TROUVÉE EN CREUSANT : "movers_update_own" (mover peut
-- modifier sa propre fiche) ne restreint AUCUNE colonne. Un déménageur
-- pouvait donc se déclarer lui-même verification_status='verified' et
-- is_active=true depuis la console de son navigateur, sans jamais passer
-- par la vérification des documents (KBIS, assurance...) par l'admin --
-- apparaissant ensuite comme "vérifié" aux yeux des clients.
--
-- On revient silencieusement aux anciennes valeurs si un appelant qui
-- n'est ni service_role ni admin tente de passer à verified/actif : le
-- reste de la mise à jour de profil (téléphone, zones, etc.) continue de
-- fonctionner normalement.

CREATE OR REPLACE FUNCTION prevent_mover_self_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.verification_status = 'verified' AND OLD.verification_status IS DISTINCT FROM 'verified')
     OR (NEW.is_active = true AND OLD.is_active IS DISTINCT FROM true) THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND NOT EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid()) THEN
      NEW.verification_status := OLD.verification_status;
      NEW.is_active := OLD.is_active;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_prevent_mover_self_verification ON movers;
CREATE TRIGGER trigger_prevent_mover_self_verification
  BEFORE UPDATE ON movers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_mover_self_verification();
