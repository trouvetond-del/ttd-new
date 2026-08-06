-- Extensions nécessaires pour programmer des tâches périodiques depuis Postgres.
-- Pas de "WITH SCHEMA" explicite : sur Supabase, pg_cron/pg_net sont déjà
-- pré-installées dans des schémas dédiés (cron / net) ; forcer un autre
-- schéma ici ferait échouer la commande si l'extension existe déjà ailleurs.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Retire d'éventuelles anciennes programmations avant de les recréer (idempotent)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-mover-quote-reminders-3h';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-profile-reminder-hourly';

-- Relance des déménageurs sur les demandes ouvertes, toutes les 3 heures
-- (la fonction elle-même respecte une fréquence minimale par paire
-- déménageur/demande selon l'urgence : 4h/24h/48h/96h).
SELECT cron.schedule(
  'send-mover-quote-reminders-3h',
  '0 */3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/send-mover-quote-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Relance des profils Google jamais complétés, toutes les heures
SELECT cron.schedule(
  'send-profile-reminder-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/send-profile-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Vérification : doit renvoyer les 2 jobs actifs
SELECT jobname, schedule, active FROM cron.job WHERE jobname IN ('send-mover-quote-reminders-3h', 'send-profile-reminder-hourly');
