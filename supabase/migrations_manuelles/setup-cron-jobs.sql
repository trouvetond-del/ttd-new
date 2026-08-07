-- Extensions nécessaires pour programmer des tâches périodiques depuis Postgres.
-- Pas de "WITH SCHEMA" explicite : sur Supabase, pg_cron/pg_net sont déjà
-- pré-installées dans des schémas dédiés (cron / net) ; forcer un autre
-- schéma ici ferait échouer la commande si l'extension existe déjà ailleurs.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Retire d'éventuelles anciennes programmations avant de les recréer (idempotent)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-mover-quote-reminders-3h';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-profile-reminder-hourly';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-client-quote-reminder-12h';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-photo-protection-reminder-6h';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-client-reengagement-daily';

-- Relance des clients qui ont un compte mais n'ont jamais fini de remplir
-- leur demande (étage, taille, type, cubage), toutes les 12 heures
SELECT cron.schedule(
  'send-client-quote-reminder-12h',
  '0 */12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/send-client-quote-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Relance des déménageurs sur les demandes ouvertes, toutes les 2 heures
-- (la fonction elle-même respecte une fréquence minimale par paire
-- déménageur/demande selon l'urgence : 2h/4h/6h/8h).
SELECT cron.schedule(
  'send-mover-quote-reminders-3h',
  '0 */2 * * *',
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

-- Rappel "photographiez votre mobilier" aux clients dont la demande vient
-- de devenir complète, toutes les 6 heures
SELECT cron.schedule(
  'send-photo-protection-reminder-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/send-photo-protection-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Relance des clients inactifs depuis 14+ jours, 1x/jour
SELECT cron.schedule(
  'send-client-reengagement-daily',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/send-client-reengagement',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Vérification : doit renvoyer tous les jobs actifs
SELECT jobname, schedule, active FROM cron.job WHERE jobname IN (
  'send-mover-quote-reminders-3h', 'send-profile-reminder-hourly',
  'send-client-quote-reminder-12h', 'send-photo-protection-reminder-6h',
  'send-client-reengagement-daily'
);
