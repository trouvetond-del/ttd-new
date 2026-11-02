-- Persistent random move references, including existing requests. Never reused after deletion.
BEGIN;
LOCK TABLE public.quote_requests IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS reference text;

CREATE TABLE IF NOT EXISTS public.quote_reference_reservations (
  reference text PRIMARY KEY CHECK (reference ~ '^TTD-[0-9]{6}$'),
  quote_request_id uuid NOT NULL UNIQUE
);
GRANT ALL ON public.quote_reference_reservations TO service_role;
REVOKE ALL ON public.quote_reference_reservations FROM anon, authenticated;
ALTER TABLE public.quote_reference_reservations ENABLE ROW LEVEL SECURITY;
-- No public policies: only the trigger can allocate references.

INSERT INTO public.quote_reference_reservations (reference, quote_request_id)
SELECT reference, id FROM public.quote_requests WHERE reference ~ '^TTD-[0-9]{6}$'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_quote_request_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  candidate text;
  allocated text;
  attempt integer;
BEGIN
  -- References are immutable once migrated, even if a caller sends a replacement.
  IF TG_OP = 'UPDATE' AND OLD.reference ~ '^TTD-[0-9]{6}$' THEN
    NEW.reference := OLD.reference;
    RETURN NEW;
  END IF;
  SELECT r.reference INTO allocated FROM public.quote_reference_reservations r
  WHERE r.quote_request_id = NEW.id;
  IF allocated IS NOT NULL THEN
    NEW.reference := allocated;
    RETURN NEW;
  END IF;
  FOR attempt IN 1..100 LOOP
    candidate := 'TTD-' || (100000 + floor(random() * 900000)::integer)::text;
    INSERT INTO public.quote_reference_reservations (reference, quote_request_id)
    VALUES (candidate, NEW.id) ON CONFLICT DO NOTHING RETURNING reference INTO allocated;
    IF allocated IS NOT NULL THEN
      NEW.reference := allocated;
      RETURN NEW;
    END IF;
  END LOOP;
  -- Bounded fallback if collisions are frequent; inserts still arbitrate concurrent claims.
  FOR candidate IN
    SELECT 'TTD-' || n::text FROM generate_series(100000, 999999) n
    WHERE NOT EXISTS (SELECT 1 FROM public.quote_reference_reservations r WHERE r.reference = 'TTD-' || n::text)
  LOOP
    INSERT INTO public.quote_reference_reservations (reference, quote_request_id)
    VALUES (candidate, NEW.id) ON CONFLICT DO NOTHING RETURNING reference INTO allocated;
    IF allocated IS NOT NULL THEN
      NEW.reference := allocated;
      RETURN NEW;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Toutes les références de déménagement à six chiffres sont utilisées.';
END;
$$;
REVOKE ALL ON FUNCTION public.set_quote_request_reference() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_set_quote_request_reference ON public.quote_requests;
CREATE TRIGGER trg_set_quote_request_reference
BEFORE INSERT OR UPDATE OF reference ON public.quote_requests
FOR EACH ROW EXECUTE FUNCTION public.set_quote_request_reference();

UPDATE public.quote_requests SET reference = NULL
WHERE reference IS NULL OR reference !~ '^TTD-[0-9]{6}$';
ALTER TABLE public.quote_requests ALTER COLUMN reference SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quote_requests_random_reference_unique ON public.quote_requests(reference);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quote_requests'::regclass AND conname = 'quote_requests_reference_format') THEN
    ALTER TABLE public.quote_requests ADD CONSTRAINT quote_requests_reference_format CHECK (reference ~ '^TTD-[0-9]{6}$');
  END IF;
END $$;
COMMIT;