-- Calculateur de volume : un contact client peut être enregistré avec son seul email.
ALTER TABLE public.partial_leads DROP CONSTRAINT IF EXISTS partial_leads_min_fields;
ALTER TABLE public.partial_leads ADD CONSTRAINT partial_leads_min_fields CHECK (
  (lead_type = 'client' AND (email IS NOT NULL OR phone IS NOT NULL))
  OR
  (lead_type = 'mover' AND company_name IS NOT NULL AND first_name IS NOT NULL AND last_name IS NOT NULL AND siret IS NOT NULL)
);
-- Contacts qui ont déjà terminé une demande : plus aucune relance.
UPDATE public.partial_leads pl SET converted_at = now()
WHERE pl.lead_type = 'client' AND pl.converted_at IS NULL AND pl.email IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.quote_requests q WHERE lower(q.client_email) = lower(pl.email) AND q.is_draft = false AND q.created_at >= pl.created_at);
SELECT count(*) FILTER (WHERE converted_at IS NULL AND lead_type='client') AS clients_en_relance FROM public.partial_leads;
