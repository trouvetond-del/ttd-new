-- À exécuter manuellement dans Supabase → SQL Editor
-- (impossible de le faire depuis GitHub, nécessite l'accès direct à la base)

-- 1. Statut réel de complétion du profil client
ALTER TABLE clients ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;

-- Marque comme complets tous les comptes qui ont déjà nom+prénom+téléphone
UPDATE clients
SET profile_completed = true
WHERE first_name IS NOT NULL AND first_name != ''
  AND last_name IS NOT NULL AND last_name != ''
  AND phone IS NOT NULL AND phone != '';

-- 2. Pour la relance automatique (send-profile-reminder)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- 3. Cron horaire (nécessite l'extension pg_cron + pg_net activées, Database > Extensions)
-- Remplacer <SERVICE_ROLE_KEY> par la vraie clé avant d'exécuter.
select cron.schedule(
  'send-profile-reminder-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/send-profile-reminder',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
  );
  $$
);
