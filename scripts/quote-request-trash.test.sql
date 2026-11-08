-- Real-table round-trip in a transaction; every mutation is rolled back.
BEGIN;
CREATE TEMP TABLE trash_before_requests AS SELECT id, to_jsonb(q) AS data FROM public.quote_requests q;
CREATE TEMP TABLE trash_before_quotes AS SELECT to_jsonb(q) AS data FROM public.quotes q;
CREATE TEMP TABLE trash_before_payments AS SELECT to_jsonb(p) AS data FROM public.payments p;
CREATE TEMP TABLE trash_before_notifications AS SELECT to_jsonb(n) AS data FROM public.notifications n;
DO $$
DECLARE target uuid; admin_id uuid; another uuid; before_data jsonb; after_data jsonb;
BEGIN
 SELECT id INTO target FROM public.quote_requests WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1;
 SELECT user_id INTO admin_id FROM public.admins WHERE user_id IS NOT NULL LIMIT 1;
 IF target IS NULL OR admin_id IS NULL THEN RAISE EXCEPTION 'Round-trip requires an existing request and admin'; END IF;
 SELECT data INTO before_data FROM trash_before_requests WHERE id=target;
 -- Signed-out callers cannot restore or trash.
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN
   PERFORM public.admin_trash_quote_request(target);
   RAISE EXCEPTION 'Unauthorized trash accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.admin_restore_quote_request(target);
   RAISE EXCEPTION 'Unauthorized restore accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT client_user_id INTO another FROM public.quote_requests WHERE client_user_id IS NOT NULL AND client_user_id NOT IN (SELECT user_id FROM public.admins) LIMIT 1;
 IF another IS NOT NULL THEN
   PERFORM set_config('request.jwt.claim.sub',another::text,true);
   BEGIN
     PERFORM public.admin_trash_quote_request(target);
     RAISE EXCEPTION 'Client trash accepted';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM public.admin_trash_quote_request(target);
 IF NOT EXISTS (SELECT 1 FROM public.quote_requests WHERE id=target AND deleted_at IS NOT NULL AND deleted_by=admin_id) THEN RAISE EXCEPTION 'Not placed in trash'; END IF;
 IF EXISTS (SELECT 1 FROM public.list_open_moves() WHERE id=target) THEN RAISE EXCEPTION 'Trash visible in Mission'; END IF;
 IF EXISTS (SELECT 1 FROM public.quote_requests_with_privacy WHERE id=target) THEN RAISE EXCEPTION 'Trash exposed by privacy view'; END IF;
 SELECT to_jsonb(q) INTO after_data FROM public.quote_requests q WHERE id=target;
 IF (after_data-'deleted_at'-'deleted_by') IS DISTINCT FROM (before_data-'deleted_at'-'deleted_by') THEN RAISE EXCEPTION 'Business fields changed on trash'; END IF;
 PERFORM public.admin_trash_quote_request(target); -- repeated action remains safe
 PERFORM public.admin_restore_quote_request(target);
 PERFORM public.admin_restore_quote_request(target);
 IF (SELECT to_jsonb(q) FROM public.quote_requests q WHERE id=target) IS DISTINCT FROM before_data THEN RAISE EXCEPTION 'Restoration changed request data'; END IF;
 IF EXISTS ((SELECT id,to_jsonb(q) FROM public.quote_requests q EXCEPT SELECT id,data FROM trash_before_requests) UNION ALL (SELECT id,data FROM trash_before_requests EXCEPT SELECT id,to_jsonb(q) FROM public.quote_requests q)) THEN RAISE EXCEPTION 'Other request changed'; END IF;
 IF EXISTS ((SELECT to_jsonb(q) FROM public.quotes q EXCEPT SELECT data FROM trash_before_quotes) UNION ALL (SELECT data FROM trash_before_quotes EXCEPT SELECT to_jsonb(q) FROM public.quotes q)) THEN RAISE EXCEPTION 'Quotes changed'; END IF;
 IF EXISTS ((SELECT to_jsonb(p) FROM public.payments p EXCEPT SELECT data FROM trash_before_payments) UNION ALL (SELECT data FROM trash_before_payments EXCEPT SELECT to_jsonb(p) FROM public.payments p)) THEN RAISE EXCEPTION 'Payments changed'; END IF;
 IF EXISTS ((SELECT to_jsonb(n) FROM public.notifications n EXCEPT SELECT data FROM trash_before_notifications) UNION ALL (SELECT data FROM trash_before_notifications EXCEPT SELECT to_jsonb(n) FROM public.notifications n)) THEN RAISE EXCEPTION 'Notifications changed'; END IF;
END;
$$;
ROLLBACK;
SELECT 'Trash round-trip and isolation checks passed; no test data persisted' AS result;
