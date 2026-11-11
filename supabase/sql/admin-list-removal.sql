BEGIN;
CREATE TABLE IF NOT EXISTS public.admin_list_removals (
 entity text NOT NULL, record_id uuid NOT NULL, removed_by uuid NOT NULL, removed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(entity,record_id)
);
GRANT SELECT ON public.admin_list_removals TO authenticated;
GRANT ALL ON public.admin_list_removals TO service_role;
ALTER TABLE public.admin_list_removals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_read_removals ON public.admin_list_removals;
CREATE POLICY admin_read_removals ON public.admin_list_removals FOR SELECT TO authenticated USING(public.quote_trash_is_admin());
CREATE OR REPLACE FUNCTION public.admin_remove_list_records(p_entity text,p_ids uuid[],p_restore boolean DEFAULT false) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE record uuid; valid boolean; total integer:=0;
BEGIN
 IF NOT public.quote_trash_is_admin() THEN RAISE EXCEPTION 'Action réservée aux administrateurs' USING ERRCODE='42501'; END IF;
 IF p_entity NOT IN ('accounts','movers','mover_prospects','client_prospects','storage_partners','mover_contracts','contracts') THEN RAISE EXCEPTION 'Liste non autorisée'; END IF;
 IF p_ids IS NULL OR cardinality(p_ids)=0 OR cardinality(p_ids)>500 THEN RAISE EXCEPTION 'Sélection invalide'; END IF;
 IF cardinality(p_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_ids)x) THEN RAISE EXCEPTION 'Sélection en double'; END IF;
 FOREACH record IN ARRAY p_ids LOOP
  IF p_entity='accounts' THEN
   SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=record) AND NOT EXISTS(SELECT 1 FROM admins WHERE user_id=record) INTO valid;
  ELSE
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id=$1)',p_entity) INTO valid USING record;
  END IF;
  IF NOT COALESCE(valid,false) THEN RAISE EXCEPTION 'Élément introuvable ou protégé'; END IF;
  IF p_restore THEN
   DELETE FROM admin_list_removals WHERE entity=p_entity AND record_id=record;
  ELSE
   INSERT INTO admin_list_removals(entity,record_id,removed_by) VALUES(p_entity,record,auth.uid()) ON CONFLICT(entity,record_id) DO NOTHING;
  END IF;
  -- Keep account and mover removal synchronized across both administrative lists.
  IF p_entity='accounts' THEN
   IF p_restore THEN DELETE FROM admin_list_removals WHERE entity='movers' AND record_id IN(SELECT id FROM movers WHERE user_id=record);
   ELSE INSERT INTO admin_list_removals(entity,record_id,removed_by) SELECT 'movers',id,auth.uid() FROM movers WHERE user_id=record ON CONFLICT DO NOTHING; END IF;
  ELSIF p_entity='movers' THEN
   IF p_restore THEN DELETE FROM admin_list_removals WHERE entity='accounts' AND record_id IN(SELECT user_id FROM movers WHERE id=record);
   ELSE INSERT INTO admin_list_removals(entity,record_id,removed_by) SELECT 'accounts',user_id,auth.uid() FROM movers WHERE id=record AND user_id IS NOT NULL ON CONFLICT DO NOTHING; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM admin_list_removals WHERE entity=p_entity AND record_id=record) = p_restore THEN RAISE EXCEPTION 'Contrôle de suppression incomplet'; END IF;
  total=total+1;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.admin_remove_list_records(text,uuid[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_list_records(text,uuid[],boolean) TO authenticated;
-- Existing publication/job check constraints must admit the supported LinkedIn channel.
DO $$ DECLARE c record; definition text; BEGIN
 FOR c IN SELECT conname,conrelid FROM pg_constraint WHERE contype='c' AND conrelid IN('public.social_publications'::regclass,'public.social_jobs'::regclass) AND pg_get_constraintdef(oid) LIKE '%platform%' LOOP
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conname=c.conname AND conrelid=c.conrelid;
  IF definition LIKE '%facebook%' AND definition NOT LIKE '%linkedin%' THEN
   definition=replace(definition,'''instagram''::text','''instagram''::text, ''linkedin''::text');
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',c.conrelid::regclass,c.conname);
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',c.conrelid::regclass,c.conname,definition);
  END IF;
 END LOOP;
END $$;
COMMIT;
