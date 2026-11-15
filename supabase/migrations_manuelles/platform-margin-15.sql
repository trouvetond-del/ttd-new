-- Temporary 15% platform margin, requested on 2026-11-15.
-- Only pending, unpaid, unaccepted quotes are repriced. Historical contracts stay unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS public.quote_margin_updates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_id uuid NOT NULL UNIQUE REFERENCES public.quotes(id) ON DELETE CASCADE,
  old_client_price numeric(12,2) NOT NULL,
  new_client_price numeric(12,2) NOT NULL,
  margin_rate numeric(5,4) NOT NULL DEFAULT 0.15,
  repriced_at timestamptz NOT NULL DEFAULT now(),
  email_sent_at timestamptz,
  email_provider_id text,
  email_error text
);
GRANT ALL ON public.quote_margin_updates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.quote_margin_updates_id_seq TO service_role;
ALTER TABLE public.quote_margin_updates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.calculate_quote_client_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.price IS NOT NULL AND (
    TG_OP = 'INSERT'
    OR NEW.client_display_price IS NULL
    OR NEW.price IS DISTINCT FROM OLD.price
  ) THEN
    NEW.client_display_price := ROUND(NEW.price * 1.15);
  END IF;

  IF NEW.market_price_estimate IS NULL THEN
    NEW.market_price_estimate := ROUND(NEW.price * 1.08);
  END IF;

  IF NEW.price IS NOT NULL AND NEW.market_price_estimate IS NOT NULL THEN
    DECLARE price_ratio numeric;
    BEGIN
      price_ratio := (NEW.price::numeric - NEW.market_price_estimate::numeric) / NEW.market_price_estimate::numeric;
      IF price_ratio <= -0.05 THEN
        NEW.price_indicator := 'green';
      ELSIF price_ratio <= 0.15 THEN
        NEW.price_indicator := 'orange';
      ELSE
        NEW.price_indicator := 'red';
      END IF;
    END;
  END IF;
  RETURN NEW;
END;
$$;

WITH eligible AS (
  SELECT q.id, q.client_display_price AS old_price
  FROM public.quotes q
  JOIN public.quote_requests qr ON qr.id = q.quote_request_id
  WHERE q.status = 'pending'
    AND q.price > 0
    AND q.client_display_price IS DISTINCT FROM ROUND(q.price * 1.15)
    AND qr.deleted_at IS NULL
    AND qr.accepted_quote_id IS NULL
    AND COALESCE(qr.status, '') NOT IN ('accepted', 'ongoing', 'completed', 'cancelled')
    AND COALESCE(qr.payment_status, '') NOT IN ('deposit_paid', 'fully_paid', 'completed', 'paid')
    AND NOT EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.quote_id = q.id
        AND COALESCE(p.payment_status, '') IN ('completed', 'deposit_released', 'released_to_mover', 'paid')
    )
    AND NOT EXISTS (SELECT 1 FROM public.quote_margin_updates h WHERE h.quote_id = q.id)
), updated AS (
  UPDATE public.quotes q
  SET client_display_price = ROUND(q.price * 1.15), updated_at = now()
  FROM eligible e
  WHERE q.id = e.id
  RETURNING q.id, e.old_price, q.client_display_price AS new_price
)
INSERT INTO public.quote_margin_updates (quote_id, old_client_price, new_client_price)
SELECT id, old_price, new_price FROM updated
ON CONFLICT (quote_id) DO NOTHING;

COMMIT;
