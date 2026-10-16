-- Agent marketing : historique des articles / vidéos publiés + stockage public des médias
CREATE TABLE IF NOT EXISTS public.marketing_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('article_client','article_mover','video_client','video_mover')),
  audience text NOT NULL CHECK (audience IN ('client','mover')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
  topic text,
  title text,
  body text,
  video_script text,
  sources jsonb DEFAULT '[]'::jsonb,
  image_urls text[] DEFAULT '{}',
  video_url text,
  fb_post_id text,
  ig_media_id text,
  source_post_id uuid REFERENCES public.marketing_posts(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (slot_date, kind)
);

ALTER TABLE public.marketing_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read marketing_posts" ON public.marketing_posts;
CREATE POLICY "admins read marketing_posts" ON public.marketing_posts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid()));
GRANT SELECT ON public.marketing_posts TO authenticated;
GRANT ALL ON public.marketing_posts TO service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-media', 'marketing-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;
