-- Pages villes SEO (/demenagement/:slug). Contenu géré ici plutôt que
-- dans `articles` (table du blog GetAutoSEO) : sémantiquement distinct,
-- et on ne veut surtout pas mélanger un contenu édité à la main avec un
-- pipeline d'écriture automatisé tiers.

CREATE TABLE IF NOT EXISTS city_pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nom_ville text not null,
  departement text,
  intro_locale text not null,
  zones_desservies text[] default '{}',
  statut text not null default 'draft' check (statut in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_city_pages_statut ON city_pages(statut);
CREATE INDEX IF NOT EXISTS idx_city_pages_slug ON city_pages(slug);

ALTER TABLE city_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "city_pages_public_read_published" ON city_pages;
CREATE POLICY "city_pages_public_read_published" ON city_pages
  FOR SELECT
  TO anon, authenticated
  USING (statut = 'published');

-- updated_at automatique, meme pattern que le reste du projet
CREATE OR REPLACE FUNCTION set_city_pages_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_city_pages_updated_at ON city_pages;
CREATE TRIGGER trigger_city_pages_updated_at
  BEFORE UPDATE ON city_pages
  FOR EACH ROW
  EXECUTE FUNCTION set_city_pages_updated_at();
