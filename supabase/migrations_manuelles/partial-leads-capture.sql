-- supabase/migrations_manuelles/partial-leads-capture.sql
-- Capture progressive des inscriptions rapides (client ET déménageur)
-- AVANT que le formulaire complet soit soumis avec succès.
--
-- Pourquoi : aujourd'hui, /devis-rapide et /inscription-demenageur
-- n'enregistrent RIEN tant que le formulaire entier n'est pas validé
-- (email, téléphone, SIRET...). Quelqu'un qui abandonne sur le champ
-- SIRET (le plus probable) ne laisse aucune trace -- alors que
-- l'objectif business est justement de pouvoir rappeler ces personnes.
--
-- Ce n'est PAS un remplacement du formulaire complet : dès que le
-- lead_type correspondant se convertit réellement (mover_lead_verifications
-- ou movers/quote_requests), converted_at est renseigné et les relances
-- s'arrêtent.

CREATE TABLE IF NOT EXISTS partial_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_type text NOT NULL CHECK (lead_type IN ('client', 'mover')),

  -- Client : email + téléphone minimum. Déménageur : raison sociale +
  -- nom/prénom + SIRET valide minimum (voir contrainte plus bas).
  email text,
  phone text,
  first_name text,
  last_name text,
  company_name text,
  siret text,

  source text,                      -- ex: 'devis-rapide', 'inscription-demenageur'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reminder_sent_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0,
  converted_at timestamptz          -- renseigné dès que la vraie inscription est finalisée ailleurs
);

-- Un lead client doit avoir au moins email + téléphone.
-- Un lead déménageur doit avoir au moins raison sociale + nom + prénom + SIRET.
ALTER TABLE partial_leads DROP CONSTRAINT IF EXISTS partial_leads_min_fields;
ALTER TABLE partial_leads ADD CONSTRAINT partial_leads_min_fields CHECK (
  (lead_type = 'client' AND email IS NOT NULL AND phone IS NOT NULL)
  OR
  (lead_type = 'mover' AND company_name IS NOT NULL AND first_name IS NOT NULL AND last_name IS NOT NULL AND siret IS NOT NULL)
);

-- Un même email ne doit pas créer 50 lignes si la personne recharge la
-- page plusieurs fois : upsert par (lead_type, email) quand l'email est
-- connu, sinon par (lead_type, siret) pour un déménageur qui n'a pas
-- encore renseigné d'email valide.
CREATE UNIQUE INDEX IF NOT EXISTS partial_leads_email_unique
  ON partial_leads (lead_type, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS partial_leads_siret_unique
  ON partial_leads (lead_type, siret) WHERE siret IS NOT NULL;

CREATE INDEX IF NOT EXISTS partial_leads_reminder_idx
  ON partial_leads (lead_type, converted_at, reminder_sent_at);

ALTER TABLE partial_leads ENABLE ROW LEVEL SECURITY;

-- Aucun accès public direct : uniquement via les fonctions Edge/API qui
-- utilisent la clé service_role (déjà le pattern utilisé partout ailleurs
-- dans ce projet pour les tables sensibles côté lead gen).
DROP POLICY IF EXISTS "no_public_access" ON partial_leads;
CREATE POLICY "no_public_access" ON partial_leads FOR ALL USING (false);
