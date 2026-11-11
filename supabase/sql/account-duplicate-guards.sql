BEGIN;
CREATE OR REPLACE FUNCTION public.identity_email(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT nullif(lower(btrim(v)),'') $$;
CREATE OR REPLACE FUNCTION public.identity_phone(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT nullif(CASE WHEN d ~ '^0033[1-9][0-9]{8}$' THEN '0'||substr(d,5) WHEN d ~ '^33[1-9][0-9]{8}$' THEN '0'||substr(d,3) ELSE d END,'') FROM (SELECT regexp_replace(v,'[^0-9]','','g') d) s $$;
CREATE TABLE IF NOT EXISTS public.account_identity_claims (identity_key text PRIMARY KEY, user_id uuid NOT NULL);
GRANT ALL ON public.account_identity_claims TO service_role;
REVOKE ALL ON public.account_identity_claims FROM anon,authenticated;
ALTER TABLE public.account_identity_claims ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.move_identity_claims (identity_key text PRIMARY KEY, request_id uuid NOT NULL);
GRANT ALL ON public.move_identity_claims TO service_role;
REVOKE ALL ON public.move_identity_claims FROM anon,authenticated;
ALTER TABLE public.move_identity_claims ENABLE ROW LEVEL SECURITY;
-- Retain every historical row. Only reserve keys for future writes.
INSERT INTO public.account_identity_claims
SELECT 'email:'||public.identity_email(email),id FROM auth.users WHERE public.identity_email(email) IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.account_identity_claims
SELECT key,user_id FROM (
 SELECT 'email:'||public.identity_email(email) key,user_id FROM public.clients
 UNION ALL SELECT 'phone:'||public.identity_phone(phone),user_id FROM public.clients
 UNION ALL SELECT 'email:'||public.identity_email(email),user_id FROM public.movers
 UNION ALL SELECT 'phone:'||public.identity_phone(phone),user_id FROM public.movers
 UNION ALL SELECT 'phone:'||public.identity_phone(manager_phone),user_id FROM public.movers
 UNION ALL SELECT 'phone:'||public.identity_phone(raw_user_meta_data->>'phone'),id FROM auth.users
) s WHERE key IS NOT NULL AND user_id IS NOT NULL ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.guard_account_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb; owner_id uuid; k text; keys text[]; old_keys text[]; claimed uuid;
BEGIN
 IF TG_OP='UPDATE' THEN o:=to_jsonb(OLD); END IF;
 owner_id:=CASE WHEN TG_TABLE_SCHEMA='auth' THEN NEW.id ELSE (n->>'user_id')::uuid END;
 keys:=ARRAY['email:'||public.identity_email(n->>'email'),'phone:'||public.identity_phone(n->>'phone'),'phone:'||public.identity_phone(n->>'manager_phone'),'phone:'||public.identity_phone(n->'raw_user_meta_data'->>'phone')];
 old_keys:=ARRAY['email:'||public.identity_email(o->>'email'),'phone:'||public.identity_phone(o->>'phone'),'phone:'||public.identity_phone(o->>'manager_phone'),'phone:'||public.identity_phone(o->'raw_user_meta_data'->>'phone')];
 FOR k IN SELECT DISTINCT x FROM unnest(keys) x WHERE x IS NOT NULL ORDER BY x LOOP
  IF TG_OP='UPDATE' AND k=ANY(old_keys) AND owner_id IS NOT DISTINCT FROM (CASE WHEN TG_TABLE_SCHEMA='auth' THEN OLD.id ELSE (o->>'user_id')::uuid END) THEN CONTINUE; END IF;
  INSERT INTO public.account_identity_claims VALUES(k,owner_id) ON CONFLICT DO NOTHING;
  SELECT user_id INTO claimed FROM public.account_identity_claims WHERE identity_key=k FOR UPDATE;
  IF claimed<>owner_id THEN RAISE EXCEPTION 'DUPLICATE_ACCOUNT: Un compte utilise déjà cet email ou ce téléphone. Connectez-vous ou contactez notre équipe.' USING ERRCODE='23505'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_account_identity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_account_identity ON auth.users;
CREATE TRIGGER guard_account_identity BEFORE INSERT OR UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.guard_account_identity();
DROP TRIGGER IF EXISTS guard_account_identity ON public.clients;
CREATE TRIGGER guard_account_identity BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_account_identity();
DROP TRIGGER IF EXISTS guard_account_identity ON public.movers;
CREATE TRIGGER guard_account_identity BEFORE INSERT OR UPDATE ON public.movers FOR EACH ROW EXECUTE FUNCTION public.guard_account_identity();
CREATE OR REPLACE FUNCTION public.move_identity_keys(q public.quote_requests) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT ARRAY['user:'||q.client_user_id::text||':'||r,'email:'||public.identity_email(q.client_email)||':'||r,'phone:'||public.identity_phone(q.client_phone)||':'||r]
 FROM (SELECT md5(lower(regexp_replace(concat_ws('|',q.from_address,q.from_postal_code,q.to_address,q.to_postal_code,q.moving_date::text),'\s+',' ','g'))) r) s
$$;
INSERT INTO public.move_identity_claims SELECT k,q.id FROM public.quote_requests q CROSS JOIN LATERAL unnest(public.move_identity_keys(q)) k WHERE k IS NOT NULL AND NOT coalesce(q.is_draft,true) AND q.deleted_at IS NULL AND q.status NOT IN ('cancelled','completed') ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.guard_duplicate_move() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k text; owner_id uuid;
BEGIN
 IF coalesce(NEW.is_draft,true) OR NEW.deleted_at IS NOT NULL OR NEW.status IN ('cancelled','completed') THEN RETURN NEW; END IF;
 -- Unchanged historical duplicates remain editable/restorable by the administrator.
 IF TG_OP='UPDATE' AND NOT coalesce(OLD.is_draft,true) AND public.move_identity_keys(NEW) IS NOT DISTINCT FROM public.move_identity_keys(OLD) THEN RETURN NEW; END IF;
 FOR k IN SELECT DISTINCT x FROM unnest(public.move_identity_keys(NEW)) x WHERE x IS NOT NULL ORDER BY x LOOP
  INSERT INTO public.move_identity_claims VALUES(k,NEW.id) ON CONFLICT DO NOTHING;
  SELECT request_id INTO owner_id FROM public.move_identity_claims WHERE identity_key=k FOR UPDATE;
  IF owner_id<>NEW.id THEN
   IF EXISTS(SELECT 1 FROM public.quote_requests q WHERE q.id=owner_id AND q.deleted_at IS NULL AND NOT coalesce(q.is_draft,true) AND q.status NOT IN ('cancelled','completed') AND k=ANY(public.move_identity_keys(q))) THEN
    RAISE EXCEPTION 'DUPLICATE_MOVE: Une demande existe déjà pour ce trajet et cette date. Retrouvez-la dans votre espace client pour la modifier.' USING ERRCODE='23505';
   END IF;
   UPDATE public.move_identity_claims SET request_id=NEW.id WHERE identity_key=k;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_duplicate_move() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.move_identity_keys(public.quote_requests) FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_duplicate_move ON public.quote_requests;
CREATE TRIGGER guard_duplicate_move BEFORE INSERT OR UPDATE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.guard_duplicate_move();
COMMIT;
