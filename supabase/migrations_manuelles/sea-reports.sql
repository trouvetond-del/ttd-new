CREATE TABLE IF NOT EXISTS public.sea_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_day date NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 summary jsonb NOT NULL DEFAULT '{}'
);
GRANT SELECT ON public.sea_reports TO authenticated;
GRANT ALL ON public.sea_reports TO service_role;
ALTER TABLE public.sea_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sea_admin_read ON public.sea_reports;
CREATE POLICY sea_admin_read ON public.sea_reports FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()));
CREATE TABLE IF NOT EXISTS public.sea_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_id uuid NOT NULL REFERENCES public.sea_reports(id) ON DELETE CASCADE,
 proposal_key text NOT NULL,
 title text NOT NULL,
 detail text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 decided_by uuid REFERENCES auth.users(id),
 decided_at timestamptz,
 UNIQUE(report_id,proposal_key)
);
GRANT SELECT ON public.sea_proposals TO authenticated;
GRANT UPDATE(status,decided_by,decided_at) ON public.sea_proposals TO authenticated;
GRANT ALL ON public.sea_proposals TO service_role;
ALTER TABLE public.sea_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sea_proposals_admin_read ON public.sea_proposals;
CREATE POLICY sea_proposals_admin_read ON public.sea_proposals FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()));
DROP POLICY IF EXISTS sea_proposals_admin_decide ON public.sea_proposals;
CREATE POLICY sea_proposals_admin_decide ON public.sea_proposals FOR UPDATE TO authenticated
 USING (status='pending' AND EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()))
 WITH CHECK(status IN ('accepted','rejected') AND decided_by=auth.uid() AND decided_at IS NOT NULL
 AND EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()));
CREATE OR REPLACE FUNCTION public.sea_stamp_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'Decision already recorded'; END IF;
  NEW.decided_by := auth.uid(); NEW.decided_at := now();
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS sea_stamp_decision ON public.sea_proposals;
CREATE TRIGGER sea_stamp_decision BEFORE UPDATE ON public.sea_proposals
 FOR EACH ROW EXECUTE FUNCTION public.sea_stamp_decision();
