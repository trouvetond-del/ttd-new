-- Exécuté automatiquement par le pipeline GitHub Actions (psql direct,
-- pas via l'historique de migrations Supabase CLI, pour ne pas toucher au
-- reste de l'historique déjà appliqué à la main sur cette base).

ALTER TABLE clients ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;

UPDATE clients
SET profile_completed = true
WHERE first_name IS NOT NULL AND first_name != ''
  AND last_name IS NOT NULL AND last_name != ''
  AND phone IS NOT NULL AND phone != '';

ALTER TABLE clients ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
