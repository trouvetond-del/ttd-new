-- 87% des leads /devis-rapide (24 sur les 10 derniers jours) ne cliquent
-- jamais le lien de vérification envoyé à la création. Aucun mécanisme
-- ne les relançait : send-client-quote-reminder ne cible que les
-- comptes déjà créés (client_user_id non null), donc ces leads-là
-- n'étaient jamais recontactés avant l'expiration du lien à 24h.
ALTER TABLE quick_lead_verifications
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
