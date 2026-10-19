-- Studio Social Media (admin) : édition des posts, voix off, republication manuelle, imports, statistiques.
-- Idempotent : exécuté à chaque passage de l'agent social (toutes les 30 min).

-- 1) marketing_posts : posts importés à la main + scènes de vidéo modifiables
ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS video_scenes jsonb;
ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.marketing_posts ALTER COLUMN slot_date SET DEFAULT current_date;
ALTER TABLE public.marketing_posts DROP CONSTRAINT IF EXISTS marketing_posts_kind_check;
ALTER TABLE public.marketing_posts ADD CONSTRAINT marketing_posts_kind_check
  CHECK (kind IN ('article_client','article_mover','video_client','video_mover','manual_image','manual_video'));
ALTER TABLE public.marketing_posts DROP CONSTRAINT IF EXISTS marketing_posts_audience_check;
ALTER TABLE public.marketing_posts ADD CONSTRAINT marketing_posts_audience_check
  CHECK (audience IN ('client','mover','all'));
ALTER TABLE public.marketing_posts DROP CONSTRAINT IF EXISTS marketing_posts_status_check;
ALTER TABLE public.marketing_posts ADD CONSTRAINT marketing_posts_status_check
  CHECK (status IN ('pending','published','failed','draft','archived'));
-- l'unicité (jour, type) ne vaut que pour les posts de l'agent, pas pour les imports manuels
ALTER TABLE public.marketing_posts DROP CONSTRAINT IF EXISTS marketing_posts_slot_date_kind_key;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_posts_agent_slot_uidx
  ON public.marketing_posts (slot_date, kind) WHERE kind NOT LIKE 'manual_%';

DROP POLICY IF EXISTS "admins insert marketing_posts" ON public.marketing_posts;
CREATE POLICY "admins insert marketing_posts" ON public.marketing_posts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));
DROP POLICY IF EXISTS "admins update marketing_posts" ON public.marketing_posts;
CREATE POLICY "admins update marketing_posts" ON public.marketing_posts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.marketing_posts TO authenticated;

DROP POLICY IF EXISTS "admins update opportunity posts" ON public.marketing_opportunity_posts;
CREATE POLICY "admins update opportunity posts" ON public.marketing_opportunity_posts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));
GRANT SELECT, UPDATE ON public.marketing_opportunity_posts TO authenticated;
GRANT ALL ON public.marketing_opportunity_posts TO service_role;
GRANT SELECT ON public.social_comment_checks TO authenticated;
GRANT ALL ON public.social_comment_checks TO service_role;

-- 2) File d'actions demandées par l'admin, exécutées par l'agent
CREATE TABLE IF NOT EXISTS public.social_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('publish','update_text','rerender_video','delete','refresh_stats')),
  target_table text CHECK (target_table IN ('marketing_posts','marketing_opportunity_posts')),
  target_id uuid,
  platforms text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  result text,
  error text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
GRANT SELECT, INSERT ON public.social_jobs TO authenticated;
GRANT ALL ON public.social_jobs TO service_role;
ALTER TABLE public.social_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read social jobs" ON public.social_jobs;
CREATE POLICY "admins read social jobs" ON public.social_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));
DROP POLICY IF EXISTS "admins create social jobs" ON public.social_jobs;
CREATE POLICY "admins create social jobs" ON public.social_jobs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()) AND status = 'queued');

-- 3) Chaque publication sur une plateforme + ses statistiques
CREATE TABLE IF NOT EXISTS public.social_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram')),
  media_type text NOT NULL DEFAULT 'image',
  external_id text NOT NULL,
  permalink text,
  published_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  views integer, clicks integer, likes integer, comments integer, shares integer, saves integer,
  stats_at timestamptz,
  stats_error text,
  UNIQUE (platform, external_id)
);
GRANT SELECT ON public.social_publications TO authenticated;
GRANT ALL ON public.social_publications TO service_role;
ALTER TABLE public.social_publications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read social publications" ON public.social_publications;
CREATE POLICY "admins read social publications" ON public.social_publications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));

-- 4) Dictionnaire de prononciation de la voix off + réglages voix
CREATE TABLE IF NOT EXISTS public.social_pronunciations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word text NOT NULL UNIQUE,
  spoken text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_pronunciations TO authenticated;
GRANT ALL ON public.social_pronunciations TO service_role;
ALTER TABLE public.social_pronunciations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage pronunciations" ON public.social_pronunciations;
CREATE POLICY "admins manage pronunciations" ON public.social_pronunciations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));
INSERT INTO public.social_pronunciations (word, spoken) VALUES
  ('trouvetondemenageur.fr', 'trouve ton déménageur point f r'),
  ('www.trouvetondemenageur.fr', 'trouve ton déménageur point f r'),
  ('TrouveTonDemenageur', 'Trouve Ton Déménageur'),
  ('KBIS', 'ka-biss'),
  ('URSSAF', 'urssaf'),
  ('RC Pro', 'R C pro'),
  ('m³', 'mètres cubes'),
  ('m3', 'mètres cubes')
ON CONFLICT (word) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.social_studio_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  voice text NOT NULL DEFAULT 'nova',
  voice_instructions text NOT NULL DEFAULT 'Voix française chaleureuse, rassurante et dynamique, rythme naturel de Reel. Prononciation française soignée.',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.social_studio_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT SELECT, UPDATE ON public.social_studio_settings TO authenticated;
GRANT ALL ON public.social_studio_settings TO service_role;
ALTER TABLE public.social_studio_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read studio settings" ON public.social_studio_settings;
CREATE POLICY "admins read studio settings" ON public.social_studio_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));
DROP POLICY IF EXISTS "admins update studio settings" ON public.social_studio_settings;
CREATE POLICY "admins update studio settings" ON public.social_studio_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));

-- 5) Imports photos / vidéos par les admins dans le dossier studio/ du stockage marketing
DROP POLICY IF EXISTS "admins upload marketing media" ON storage.objects;
CREATE POLICY "admins upload marketing media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-media' AND (storage.foldername(name))[1] = 'studio'
    AND EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));
