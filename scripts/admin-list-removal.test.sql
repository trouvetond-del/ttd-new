BEGIN;
CREATE TEMP TABLE removal_contracts_before AS SELECT to_jsonb(c) data FROM mover_contracts c;
CREATE TEMP TABLE removal_payments_before AS SELECT to_jsonb(p) data FROM payments p;
DO $$ DECLARE actor uuid; target uuid; n integer; list_entity text; BEGIN
 SELECT user_id INTO actor FROM admins LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Admin required'; END IF;
 FOREACH list_entity IN ARRAY ARRAY['movers','mover_prospects','client_prospects','storage_partners','mover_contracts','contracts'] LOOP
  EXECUTE format('SELECT id FROM %I LIMIT 1',list_entity) INTO target;
  IF target IS NULL THEN CONTINUE; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN PERFORM admin_remove_list_records(list_entity,ARRAY[target],false);RAISE EXCEPTION 'Signed-out removal accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  n=admin_remove_list_records(list_entity,ARRAY[target],false);
  IF n<>1 OR NOT EXISTS(SELECT 1 FROM admin_list_removals WHERE entity=list_entity AND record_id=target) THEN RAISE EXCEPTION 'Removal not verified'; END IF;
  n=admin_remove_list_records(list_entity,ARRAY[target],true);
  IF n<>1 OR EXISTS(SELECT 1 FROM admin_list_removals WHERE entity=list_entity AND record_id=target) THEN RAISE EXCEPTION 'Restore not verified'; END IF;
 END LOOP;
 BEGIN PERFORM admin_remove_list_records('accounts',ARRAY[actor],false);RAISE EXCEPTION 'Admin account removal accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Admin account removal accepted' THEN RAISE; END IF; END;
 IF EXISTS((SELECT to_jsonb(c) FROM mover_contracts c EXCEPT SELECT data FROM removal_contracts_before) UNION ALL (SELECT data FROM removal_contracts_before EXCEPT SELECT to_jsonb(c) FROM mover_contracts c)) THEN RAISE EXCEPTION 'Signed contracts changed'; END IF;
 IF EXISTS((SELECT to_jsonb(p) FROM payments p EXCEPT SELECT data FROM removal_payments_before) UNION ALL (SELECT data FROM removal_payments_before EXCEPT SELECT to_jsonb(p) FROM payments p)) THEN RAISE EXCEPTION 'Payments changed'; END IF;
END $$;
ROLLBACK;
SELECT 'Removal/restore permission and history checks passed; all tests rolled back' AS result;
