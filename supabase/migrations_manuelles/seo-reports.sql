-- Rapports SEO hebdomadaires (agent SEO). Lecture réservée aux admins.
CREATE TABLE IF NOT EXISTS seo_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  summary jsonb not null default '{}',
  pages jsonb not null default '[]',
  recommendations jsonb not null default '[]'
);
CREATE INDEX IF NOT EXISTS idx_seo_reports_created ON seo_reports(created_at desc);
ALTER TABLE seo_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seo_reports_admin_read" ON seo_reports;
CREATE POLICY "seo_reports_admin_read" ON seo_reports
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid()));

GRANT SELECT ON seo_reports TO authenticated;
GRANT ALL ON seo_reports TO service_role;
