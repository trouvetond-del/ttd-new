-- Autorise les Reels créés depuis la Machine d'acquisition dans le Studio (idempotent).
DO $$
DECLARE kinds text;
BEGIN
  SELECT string_agg(quote_literal(k), ',') INTO kinds FROM (
    SELECT DISTINCT kind AS k FROM marketing_posts
    UNION SELECT unnest(ARRAY['article_client','article_mover','video_client','video_mover','manual_image','manual_video','opportunity','acq_video_client','acq_video_mover'])
  ) s;
  ALTER TABLE marketing_posts DROP CONSTRAINT IF EXISTS marketing_posts_kind_check;
  EXECUTE format('ALTER TABLE marketing_posts ADD CONSTRAINT marketing_posts_kind_check CHECK (kind IN (%s))', kinds);
END $$;
