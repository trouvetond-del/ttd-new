-- Run only in an isolated empty test database with psql -v ON_ERROR_STOP=1.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.quote_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text);
INSERT INTO public.quote_requests (reference) VALUES ('TTD-387980EA'), ('DEM-000001'), (NULL), ('TTD-837291');
\ir ../supabase/migrations_manuelles/quote-random-reference.sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.quote_requests WHERE reference !~ '^TTD-[0-9]{6}$') THEN
    RAISE EXCEPTION 'Expected TTD- plus exactly six digits, no suffix letters';
  END IF;
END $$;
-- Force a collision by replaying the random seed. The second allocation must retry.
SELECT setseed(0.42);
INSERT INTO public.quote_requests DEFAULT VALUES;
SELECT setseed(0.42);
INSERT INTO public.quote_requests DEFAULT VALUES;
DO $$ BEGIN
  IF (SELECT count(DISTINCT reference) FROM public.quote_requests) <> 6 THEN
    RAISE EXCEPTION 'Duplicate after forced random collision';
  END IF;
END $$;
-- Idempotent deployment and immutable references.
CREATE TEMP TABLE before_replay AS SELECT * FROM public.quote_requests;
\ir ../supabase/migrations_manuelles/quote-random-reference.sql
UPDATE public.quote_requests SET reference = 'TTD-000001';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.quote_requests q JOIN before_replay b USING (id) WHERE q.reference <> b.reference) THEN
    RAISE EXCEPTION 'Existing reference changed';
  END IF;
END $$;
DELETE FROM public.quote_requests WHERE reference = 'TTD-837291';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quote_reference_reservations WHERE reference = 'TTD-837291') THEN
    RAISE EXCEPTION 'Deleted reference was released for reuse';
  END IF;
END $$;