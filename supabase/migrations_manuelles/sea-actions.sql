CREATE TABLE IF NOT EXISTS public.sea_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 provider text NOT NULL, campaign_id text NOT NULL, campaign_name text,
 action_type text NOT NULL, cap boolean NOT NULL DEFAULT false,
 reason text, result text, ok boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.sea_actions TO authenticated;
GRANT ALL ON public.sea_actions TO service_role;
ALTER TABLE public.sea_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sea_actions_admin_read ON public.sea_actions;
CREATE POLICY sea_actions_admin_read ON public.sea_actions FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()));
