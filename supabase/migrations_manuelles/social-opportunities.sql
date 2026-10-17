-- Posts « Déménagement disponible » (1 par demande de devis) + journal de modération des commentaires
CREATE TABLE IF NOT EXISTS public.marketing_opportunity_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id uuid NOT NULL UNIQUE REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
  attempts integer NOT NULL DEFAULT 0,
  body text,
  image_url text,
  fb_post_id text,
  ig_media_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
ALTER TABLE public.marketing_opportunity_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read opportunity posts" ON public.marketing_opportunity_posts;
CREATE POLICY "admins read opportunity posts" ON public.marketing_opportunity_posts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.social_comment_checks (
  comment_id text PRIMARY KEY,
  platform text NOT NULL,
  author text,
  text text,
  verdict text,
  action text NOT NULL DEFAULT 'ok',
  error text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.social_comment_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read comment checks" ON public.social_comment_checks;
CREATE POLICY "admins read comment checks" ON public.social_comment_checks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));
