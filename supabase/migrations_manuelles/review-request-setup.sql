-- Demande d'avis Trustpilot : 1 email par déménagement validé (pas de spam)
CREATE TABLE IF NOT EXISTS review_request_log (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique,
  sent_at timestamptz not null default now()
);
GRANT ALL ON review_request_log TO service_role;
ALTER TABLE review_request_log ENABLE ROW LEVEL SECURITY;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-review-request-daily';
SELECT cron.schedule(
  'send-review-request-daily',
  '17 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/send-review-request',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
