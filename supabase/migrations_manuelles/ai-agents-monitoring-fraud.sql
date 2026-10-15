-- Agents IA : surveillance des erreurs (toutes les 15 min) + anti-fraude (toutes les 15 min)

-- 1. Secret partagé entre pg_cron et les fonctions (jamais lisible par le site)
CREATE TABLE IF NOT EXISTS agent_secrets (
  name text primary key,
  secret text not null
);
GRANT ALL ON agent_secrets TO service_role;
ALTER TABLE agent_secrets ENABLE ROW LEVEL SECURITY;
INSERT INTO agent_secrets(name, secret)
VALUES ('cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO NOTHING;

-- 2. Journal des vérifications de santé du site
CREATE TABLE IF NOT EXISTS system_health_checks (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  status text not null check (status in ('ok','warning','critical')),
  issues jsonb not null default '[]'::jsonb,
  ai_summary text
);
GRANT SELECT ON system_health_checks TO authenticated;
GRANT ALL ON system_health_checks TO service_role;
ALTER TABLE system_health_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read health checks" ON system_health_checks;
CREATE POLICY "Admins read health checks" ON system_health_checks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid()));

-- 3. Anti-spam des alertes email (une même alerte max toutes les 3h)
CREATE TABLE IF NOT EXISTS agent_alert_log (
  alert_key text primary key,
  last_sent_at timestamptz not null default now()
);
GRANT ALL ON agent_alert_log TO service_role;
ALTER TABLE agent_alert_log ENABLE ROW LEVEL SECURITY;

-- 4. Nouveaux types d'alertes fraude + colonnes de blocage
ALTER TABLE fraud_alerts DROP CONSTRAINT IF EXISTS fraud_alerts_alert_type_check;
ALTER TABLE fraud_alerts ADD CONSTRAINT fraud_alerts_alert_type_check CHECK (alert_type IN (
  'duplicate_document','suspicious_activity','fake_id','multiple_accounts','payment_fraud',
  'location_mismatch','fake_mover','fake_client','site_attack','disposable_email'));
ALTER TABLE fraud_alerts ADD COLUMN IF NOT EXISTS signal_key text;
ALTER TABLE fraud_alerts ADD COLUMN IF NOT EXISTS auto_blocked boolean not null default false;
CREATE UNIQUE INDEX IF NOT EXISTS fraud_alerts_signal_key_uniq ON fraud_alerts(signal_key) WHERE signal_key IS NOT NULL;
GRANT SELECT, UPDATE ON fraud_alerts TO authenticated;
GRANT ALL ON fraud_alerts TO service_role;
DROP POLICY IF EXISTS "Admins manage fraud alerts" ON fraud_alerts;
CREATE POLICY "Admins manage fraud alerts" ON fraud_alerts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid()));

-- 5. Lecture des tâches planifiées en échec (réservé au service interne)
CREATE OR REPLACE FUNCTION agent_failed_cron_runs(since timestamptz)
RETURNS TABLE(jobname text, status text, return_message text, start_time timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, cron AS $$
  SELECT j.jobname, d.status, left(d.return_message, 300), d.start_time
  FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.start_time >= since AND d.status = 'failed'
  ORDER BY d.start_time DESC LIMIT 20;
$$;
REVOKE ALL ON FUNCTION agent_failed_cron_runs(timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION agent_failed_cron_runs(timestamptz) TO service_role;

-- 6. Inscriptions groupées par adresse IP (robots / attaques)
CREATE OR REPLACE FUNCTION agent_signups_by_ip(since timestamptz)
RETURNS TABLE(ip text, signups bigint, user_ids uuid[])
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT ip_address::text, count(*),
         array_agg(DISTINCT nullif(payload->>'actor_id','')::uuid)
  FROM auth.audit_log_entries
  WHERE created_at >= since AND payload->>'action' = 'user_signedup'
    AND coalesce(ip_address,'') <> ''
  GROUP BY ip_address HAVING count(*) >= 4
  ORDER BY count(*) DESC LIMIT 20;
$$;
REVOKE ALL ON FUNCTION agent_signups_by_ip(timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION agent_signups_by_ip(timestamptz) TO service_role;

-- 7. Programmation toutes les 15 minutes (décalées)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('agent-monitor-errors-15m','agent-fraud-guard-15m');
SELECT cron.schedule('agent-monitor-errors-15m', '*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/agent-monitor-errors',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-agent-secret', (SELECT secret FROM public.agent_secrets WHERE name = 'cron'))
  );
$$);
SELECT cron.schedule('agent-fraud-guard-15m', '7,22,37,52 * * * *', $$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/agent-fraud-guard',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-agent-secret', (SELECT secret FROM public.agent_secrets WHERE name = 'cron'))
  );
$$);
