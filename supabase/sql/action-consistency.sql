BEGIN;
ALTER TABLE public.groupage_alerts ADD COLUMN IF NOT EXISTS invalidated_at timestamptz;
CREATE TABLE IF NOT EXISTS public.action_consistency_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid, action text NOT NULL,
 ok boolean NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.action_consistency_checks TO authenticated;
GRANT ALL ON public.action_consistency_checks TO service_role;
ALTER TABLE public.action_consistency_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_read_checks ON public.action_consistency_checks;
CREATE POLICY admin_read_checks ON public.action_consistency_checks FOR SELECT TO authenticated USING (public.quote_trash_is_admin());

CREATE OR REPLACE FUNCTION public.groupage_pair_valid(p_alert uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM groupage_alerts g JOIN quote_requests a ON a.id=g.request_a JOIN quote_requests b ON b.id=g.request_b
 WHERE g.id=p_alert AND a.id<>b.id AND a.deleted_at IS NULL AND b.deleted_at IS NULL
 AND NOT COALESCE(a.is_draft,false) AND NOT COALESCE(b.is_draft,false)
 AND a.status IN ('new','assigned','quoted') AND b.status IN ('new','assigned','quoted')
 AND a.moving_date>=CURRENT_DATE AND b.moving_date>=CURRENT_DATE
 AND abs(a.moving_date-b.moving_date)<=3
 AND CASE WHEN g.kind='same_route' THEN
 calculate_distance_km(a.from_latitude,a.from_longitude,b.from_latitude,b.from_longitude)<=200
 AND calculate_distance_km(a.to_latitude,a.to_longitude,b.to_latitude,b.to_longitude)<=200
 ELSE b.moving_date>=a.moving_date AND calculate_distance_km(a.to_latitude,a.to_longitude,b.from_latitude,b.from_longitude)<=200
 AND calculate_distance_km(a.from_latitude,a.from_longitude,a.to_latitude,a.to_longitude)>200 END);
$$;
REVOKE ALL ON FUNCTION public.groupage_pair_valid(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.groupage_pair_valid(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_request_consistency(p_request uuid, p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE bad integer; hidden boolean; leaked boolean; result jsonb;
BEGIN
 UPDATE groupage_alerts SET invalidated_at=CASE WHEN public.groupage_pair_valid(id) THEN NULL ELSE COALESCE(invalidated_at,now()) END
 WHERE (p_request IS NULL OR request_a=p_request OR request_b=p_request)
 AND (invalidated_at IS NULL) IS DISTINCT FROM public.groupage_pair_valid(id);
 SELECT count(*) INTO bad FROM groupage_alerts WHERE dismissed_at IS NULL AND invalidated_at IS NULL
 AND (p_request IS NULL OR request_a=p_request OR request_b=p_request) AND NOT public.groupage_pair_valid(id);
 SELECT EXISTS(SELECT 1 FROM quote_requests q WHERE q.deleted_at IS NOT NULL AND (p_request IS NULL OR q.id=p_request)
 AND (EXISTS(SELECT 1 FROM list_open_moves() m WHERE m.id=q.id) OR EXISTS(SELECT 1 FROM quote_requests_with_privacy v WHERE v.id=q.id)
 OR EXISTS(SELECT 1 FROM quote_requests_with_counts v WHERE v.id=q.id))) INTO leaked;
 result=jsonb_build_object('ok',bad=0 AND NOT leaked,'invalid_groupages',bad,'trash_visible',leaked);
 INSERT INTO action_consistency_checks(request_id,action,ok,details) VALUES(p_request,p_action,bad=0 AND NOT leaked,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.check_request_consistency(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_request_consistency(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_request_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 result=public.check_request_consistency(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,TG_OP);
 IF NOT (result->>'ok')::boolean THEN RAISE EXCEPTION 'La demande n’a pas pu être synchronisée. Aucune modification appliquée.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_request_consistency ON public.quote_requests;
CREATE TRIGGER enforce_request_consistency AFTER INSERT OR UPDATE OR DELETE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.enforce_request_consistency();

CREATE OR REPLACE FUNCTION public.admin_verify_request_action(p_request uuid,p_expected text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE matches boolean; result jsonb;
BEGIN
 IF NOT public.quote_trash_is_admin() THEN RAISE EXCEPTION 'Action réservée aux administrateurs' USING ERRCODE='42501'; END IF;
 SELECT CASE p_expected WHEN 'trashed' THEN deleted_at IS NOT NULL WHEN 'restored' THEN deleted_at IS NULL
 WHEN 'completed' THEN status='completed' AND deleted_at IS NULL ELSE false END INTO matches FROM quote_requests WHERE id=p_request;
 result=public.check_request_consistency(p_request,'verify_'||p_expected);
 RETURN result || jsonb_build_object('ok',COALESCE(matches,false) AND (result->>'ok')::boolean);
END $$;
REVOKE ALL ON FUNCTION public.admin_verify_request_action(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_request_action(uuid,text) TO authenticated;

-- Preserve existing notifier logic, but refuse stale/dismissed/invalid pairs before notifications.
DO $body$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.groupage_alert_movers(uuid)'::regprocedure) INTO definition;
 IF definition NOT LIKE '%groupage_pair_valid(p_alert)%' THEN
  definition=replace(definition,'SELECT * INTO g FROM groupage_alerts WHERE id = p_alert;',
  'IF NOT public.groupage_pair_valid(p_alert) THEN RETURN 0; END IF; SELECT * INTO g FROM groupage_alerts WHERE id = p_alert AND dismissed_at IS NULL AND invalidated_at IS NULL;');
  EXECUTE definition;
 END IF;
END $body$;
SELECT public.check_request_consistency(NULL,'initial_reconciliation');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='quote_requests') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.quote_requests; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='groupage_alerts') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.groupage_alerts; END IF;
END $$;
DO $$ BEGIN PERFORM cron.unschedule('action-consistency-watchdog'); EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule('action-consistency-watchdog','*/5 * * * *',$c$ SELECT public.check_request_consistency(NULL,'watchdog'); DELETE FROM public.action_consistency_checks WHERE created_at < now()-interval '90 days'; $c$);
COMMIT;
