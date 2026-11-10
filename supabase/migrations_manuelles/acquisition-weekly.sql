-- Lots hebdomadaires de la Machine d'acquisition. Lecture réservée aux admins.
CREATE TABLE IF NOT EXISTS acquisition_weekly (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  week_start date not null unique,
  items jsonb not null default '[]'
);
ALTER TABLE acquisition_weekly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acquisition_weekly_admin_read" ON acquisition_weekly;
CREATE POLICY "acquisition_weekly_admin_read" ON acquisition_weekly
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid()));
GRANT SELECT ON acquisition_weekly TO authenticated;
GRANT ALL ON acquisition_weekly TO service_role;
