BEGIN;
CREATE TEMP TABLE consistency_payments_before AS SELECT to_jsonb(p) data FROM public.payments p;
CREATE TEMP TABLE consistency_quotes_before AS SELECT to_jsonb(q) data FROM public.quotes q;
DO $$
DECLARE target uuid; actor uuid; g uuid; result jsonb; baseline jsonb;
BEGIN
 SELECT a.id,g.id INTO target,g FROM public.groupage_alerts g JOIN public.quote_requests a ON a.id=g.request_a
 WHERE a.deleted_at IS NULL LIMIT 1;
 SELECT user_id INTO actor FROM public.admins WHERE user_id IS NOT NULL LIMIT 1;
 IF target IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Existing groupage and admin required'; END IF;
 SELECT to_jsonb(q) INTO baseline FROM public.quote_requests q WHERE id=target;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM public.admin_trash_quote_request(target);
 IF EXISTS(SELECT 1 FROM public.groupage_alerts WHERE (request_a=target OR request_b=target) AND dismissed_at IS NULL AND invalidated_at IS NULL) THEN RAISE EXCEPTION 'Deleted request remains in Groupage'; END IF;
 result=public.admin_verify_request_action(target,'trashed');
 IF NOT (result->>'ok')::boolean THEN RAISE EXCEPTION 'Post-action verification failed'; END IF;
 PERFORM public.admin_restore_quote_request(target);
 IF public.groupage_pair_valid(g) AND EXISTS(SELECT 1 FROM public.groupage_alerts WHERE id=g AND invalidated_at IS NOT NULL) THEN RAISE EXCEPTION 'Restored valid groupage stays invalid'; END IF;
 IF (SELECT to_jsonb(q) FROM public.quote_requests q WHERE id=target) - 'deleted_at' - 'deleted_by' IS DISTINCT FROM baseline - 'deleted_at' - 'deleted_by' THEN RAISE EXCEPTION 'Business fields changed'; END IF;
 UPDATE public.quote_requests SET status='completed' WHERE id=target;
 IF EXISTS(SELECT 1 FROM public.groupage_alerts WHERE (request_a=target OR request_b=target) AND dismissed_at IS NULL AND invalidated_at IS NULL) THEN RAISE EXCEPTION 'Archived request remains in Groupage'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN
  PERFORM public.admin_verify_request_action(target,'completed');
  RAISE EXCEPTION 'Anonymous verifier accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS((SELECT to_jsonb(p) FROM public.payments p EXCEPT SELECT data FROM consistency_payments_before) UNION ALL (SELECT data FROM consistency_payments_before EXCEPT SELECT to_jsonb(p) FROM public.payments p)) THEN RAISE EXCEPTION 'Payment data changed'; END IF;
 IF EXISTS((SELECT to_jsonb(q) FROM public.quotes q EXCEPT SELECT data FROM consistency_quotes_before) UNION ALL (SELECT data FROM consistency_quotes_before EXCEPT SELECT to_jsonb(q) FROM public.quotes q)) THEN RAISE EXCEPTION 'Quote data changed'; END IF;
END $$;
ROLLBACK;
SELECT 'Request/groupage action checks passed; all test mutations rolled back' AS result;
