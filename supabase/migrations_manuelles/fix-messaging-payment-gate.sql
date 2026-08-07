-- FAILLE TROUVÉE (audit /red-team, point 2 : messagerie client-déménageur) :
-- la policy RLS d'insertion sur `messages` ne vérifiait que "l'expéditeur
-- fait bien partie de la conversation", sans jamais vérifier qu'un
-- paiement a été effectué. Côté frontend, seul le CLIENT était bloqué
-- avant paiement ("Messagerie verrouillée") -- le déménageur, lui,
-- pouvait écrire librement, y compris son numéro de téléphone perso, dès
-- l'envoi de son devis. Un déménageur malhonnête pouvait ainsi contourner
-- entièrement la commission de la plateforme en donnant ses coordonnées
-- directement au client avant tout paiement. Et comme la policy RLS ne
-- vérifiait rien non plus, même un client technique aurait pu contourner
-- le verrou frontend en appelant l'API directement.
--
-- Corrige au niveau base (donc impossible à contourner par le frontend) :
-- aucun message ne peut être inséré, ni par le client ni par le
-- déménageur, tant qu'un paiement complété n'existe pas pour la demande
-- concernée.

DROP POLICY IF EXISTS "Users can send messages in own conversations" ON messages;

CREATE POLICY "Users can send messages in own conversations"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (
        c.client_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM movers
          WHERE movers.id = c.mover_id
          AND movers.user_id = auth.uid()
        )
      )
      AND EXISTS (
        SELECT 1 FROM payments p
        WHERE p.quote_request_id = c.quote_request_id
        AND p.payment_status = 'completed'
      )
    )
  );
