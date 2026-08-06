-- FAILLE DE SÉCURITÉ CRITIQUE CORRIGÉE : la policy RLS d'insertion sur
-- `payments` ("Clients can create payments for own quotes") vérifiait
-- uniquement client_id = auth.uid(), sans jamais restreindre les valeurs
-- de payment_status / stripe_verified. Combiné au trigger
-- update_quote_status_after_payment (SECURITY DEFINER, se déclenche dès
-- qu'une ligne a payment_status='completed'), n'importe quel client
-- authentifié pouvait, depuis la console de son navigateur, insérer une
-- ligne payments avec payment_status:'completed', stripe_verified:true et
-- un stripe_payment_id inventé -- sans jamais payer un centime sur
-- Stripe -- et obtenir automatiquement un devis marqué comme accepté et
-- payé.
--
-- Cette migration force payment_status='pending' et stripe_verified=false
-- sur tout INSERT/UPDATE ne provenant pas du rôle service_role (donc pas
-- des edge functions internes comme create-payment-intent /
-- stripe-webhook), quelles que soient les valeurs envoyées par le client.

CREATE OR REPLACE FUNCTION enforce_payment_safety()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.payment_status := 'pending';
    NEW.stripe_verified := false;
    NEW.stripe_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_enforce_payment_safety_insert ON payments;
CREATE TRIGGER trigger_enforce_payment_safety_insert
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_safety();

DROP TRIGGER IF EXISTS trigger_enforce_payment_safety_update ON payments;
CREATE TRIGGER trigger_enforce_payment_safety_update
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_safety();
