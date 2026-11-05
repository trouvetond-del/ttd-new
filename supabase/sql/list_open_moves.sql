-- Liste publique des déménagements ouverts : aucune donnée client, seulement villes, date, volume, distance.
CREATE OR REPLACE FUNCTION public.list_open_moves()
RETURNS TABLE (id uuid, reference text, from_city text, from_postal_code text, to_city text, to_postal_code text,
  moving_date date, volume_m3 numeric, distance_km numeric, from_home_size text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT qr.id, qr.reference::text, qr.from_city::text, qr.from_postal_code::text, qr.to_city::text, qr.to_postal_code::text,
    qr.moving_date::date, qr.volume_m3::numeric, qr.distance_km::numeric, qr.from_home_size::text
  FROM quote_requests qr
  WHERE qr.status IN ('new','quoted')
    AND COALESCE(qr.is_draft,false) = false
    AND qr.moving_date >= CURRENT_DATE
  ORDER BY qr.moving_date ASC;
$$;
REVOKE ALL ON FUNCTION public.list_open_moves() FROM public;
GRANT EXECUTE ON FUNCTION public.list_open_moves() TO anon, authenticated;
