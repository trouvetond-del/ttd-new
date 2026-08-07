-- Distingue les relances automatiques (cron send-client-quote-reminder) des
-- relances manuelles déclenchées par l'admin (bouton "Relancer" sur une
-- demande précise, edge function admin-send-client-quote-reminder).
ALTER TABLE client_quote_reminder_log
  ADD COLUMN IF NOT EXISTS triggered_by text NOT NULL DEFAULT 'cron';
