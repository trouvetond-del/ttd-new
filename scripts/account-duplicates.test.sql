BEGIN;
-- Never commit test writes; no emails or payments are sent.
DO $$
DECLARE source public.quote_requests; candidate public.quote_requests; target_client uuid; client_phone text; target_mover uuid; blocked boolean := false;
BEGIN
 SELECT * INTO STRICT source FROM public.quote_requests WHERE reference='TTD-190329';
 candidate := source; candidate.id := gen_random_uuid(); candidate.reference := NULL; candidate.resume_token := gen_random_uuid();
 BEGIN
  INSERT INTO public.quote_requests SELECT (candidate).*;
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM NOT LIKE 'DUPLICATE_MOVE:%' THEN RAISE; END IF; blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL: identical move accepted for same customer'; END IF;
 SELECT id,phone INTO target_client,client_phone FROM public.clients WHERE phone IS NOT NULL AND phone<>'' ORDER BY created_at LIMIT 1;
 blocked := false;
 SELECT id INTO target_mover FROM public.movers WHERE user_id<>(SELECT user_id FROM public.clients WHERE id=target_client) LIMIT 1;
 IF target_mover IS NULL THEN RAISE EXCEPTION 'Missing mover fixture'; END IF;
 BEGIN
  UPDATE public.movers SET phone=client_phone WHERE id=target_mover;
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM NOT LIKE 'DUPLICATE_ACCOUNT:%' THEN RAISE; END IF; blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL: phone shared across client/pro accounts accepted'; END IF;
 IF public.identity_phone('07 45 52 84 86') <> public.identity_phone('+33 7 45 52 84 86') OR public.identity_phone('0033745528486') <> public.identity_phone('0745528486') THEN RAISE EXCEPTION 'Phone normalization failed'; END IF;
 IF public.identity_email(' CLIENT@Example.FR ') <> 'client@example.fr' THEN RAISE EXCEPTION 'Email normalization failed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: identical move, client/pro phone boundary and normalization; all test writes rolled back' AS result;
