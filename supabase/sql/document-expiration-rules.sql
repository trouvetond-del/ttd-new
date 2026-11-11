-- Dates d'expiration des documents déménageurs.
-- Une date saisie fait foi. Sinon la validité légale est calculée depuis l'envoi du document :
-- KBIS 3 mois, attestation URSSAF 6 mois, attestation d'assurance 12 mois.
DROP FUNCTION IF EXISTS public.get_expiring_documents(integer);
CREATE FUNCTION public.get_expiring_documents(days_threshold integer DEFAULT 30)
RETURNS TABLE (mover_id uuid, company_name text, document_type text, expiration_date date, days_remaining integer, basis text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH docs AS (
    SELECT d.mover_id, CASE WHEN d.document_type IN ('id_card','identity_recto','identity_verso') THEN 'identity' ELSE d.document_type END AS t,
           d.expiration_date AS exp, d.uploaded_at
    FROM verification_documents d WHERE coalesce(d.verification_status,'') <> 'rejected'
    UNION ALL
    SELECT d.mover_id, d.document_type, NULL::date, d.uploaded_at
    FROM mover_documents d WHERE coalesce(d.verification_status,'') <> 'rejected'
  ),
  latest AS (
    SELECT DISTINCT ON (mover_id, t) mover_id, t, exp, uploaded_at FROM docs ORDER BY mover_id, t, uploaded_at DESC NULLS LAST
  ),
  computed AS (
    SELECT l.mover_id, l.t,
      coalesce(l.exp, CASE l.t
        WHEN 'kbis' THEN (l.uploaded_at + interval '3 months')::date
        WHEN 'urssaf' THEN (l.uploaded_at + interval '6 months')::date
        WHEN 'insurance' THEN (l.uploaded_at + interval '12 months')::date END) AS exp,
      CASE WHEN l.exp IS NOT NULL THEN 'date saisie' ELSE 'validité légale depuis l''envoi' END AS basis
    FROM latest l
  ),
  from_movers AS (
    SELECT m.id, 'kbis' t, m.kbis_expiration_date::date e FROM movers m
    UNION ALL SELECT m.id, 'insurance', m.insurance_expiration_date::date FROM movers m
    UNION ALL SELECT m.id, 'identity', m.identity_expiration_date::date FROM movers m
    UNION ALL SELECT m.id, 'transport_license', m.transport_license_expiration_date::date FROM movers m
  ),
  merged AS (
    SELECT fm.id AS mover_id, fm.t, fm.e AS exp, 'date saisie' AS basis FROM from_movers fm WHERE fm.e IS NOT NULL
    UNION ALL
    SELECT c.mover_id, c.t, c.exp, c.basis FROM computed c WHERE c.exp IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM from_movers fm WHERE fm.id = c.mover_id AND fm.t = c.t AND fm.e IS NOT NULL)
  )
  SELECT m.id, m.company_name, x.t, x.exp, (x.exp - CURRENT_DATE)::integer, x.basis
  FROM merged x JOIN movers m ON m.id = x.mover_id
  WHERE m.verification_status = 'verified' AND x.exp - CURRENT_DATE <= days_threshold
  ORDER BY 5 ASC;
$$;
REVOKE ALL ON FUNCTION public.get_expiring_documents(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expiring_documents(integer) TO authenticated, service_role;
