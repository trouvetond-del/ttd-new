-- Alerte admin "à rappeler dans l'heure" pour chaque contact /devis-rapide
ALTER TABLE partial_leads ADD COLUMN IF NOT EXISTS callback_alerted_at timestamptz;
-- Pas d'alerte sur l'historique : seuls les nouveaux contacts déclenchent l'alerte
UPDATE partial_leads SET callback_alerted_at = now() WHERE callback_alerted_at IS NULL;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'agent-callback-alert';
SELECT cron.schedule('agent-callback-alert', '*/10 6-19 * * *', $$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/agent-callback-alert',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-agent-secret', (SELECT secret FROM public.agent_secrets WHERE name = 'cron'))
  );
$$);
