-- Relances "information manquante / document à mettre à jour" rédigées par l'IA
-- à partir du commentaire de l'admin. 1 email initial puis 1 relance par jour ;
-- après 3 relances sans action, l'admin est alerté pour appeler.
CREATE TABLE IF NOT EXISTS public.admin_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('mover','client')),
  mover_id uuid,
  target_user_id uuid,
  email text NOT NULL,
  display_name text,
  phone text,
  admin_note text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','escalated','cancelled')),
  reminder_count int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  resolved_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_followups_open_idx ON public.admin_followups (status, last_sent_at);
CREATE INDEX IF NOT EXISTS admin_followups_mover_idx ON public.admin_followups (mover_id);
CREATE INDEX IF NOT EXISTS admin_followups_user_idx ON public.admin_followups (target_user_id);

ALTER TABLE public.admin_followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage followups" ON public.admin_followups;
CREATE POLICY "admins manage followups" ON public.admin_followups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_followups TO authenticated;
GRANT ALL ON public.admin_followups TO service_role;

-- Les anciennes alertes "SIRET invalide" sur des inscriptions non terminées (PENDING-…) étaient de fausses alertes.
UPDATE public.fraud_alerts SET status = 'false_positive', resolved_at = now()
WHERE alert_type = 'fake_mover' AND details->>'siret' LIKE 'PENDING-%' AND status IN ('new','investigating');

-- Passage quotidien des relances (9h13 Paris en été ≈ 7h13 UTC)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-admin-followups-daily';
SELECT cron.schedule('send-admin-followups-daily', '13 7 * * *', $$
  SELECT net.http_post(
    url := 'https://bvvbkaluajgdurxnnqqu.supabase.co/functions/v1/send-admin-followups',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-agent-secret', (SELECT secret FROM public.agent_secrets WHERE name = 'cron'))
  );
$$);
