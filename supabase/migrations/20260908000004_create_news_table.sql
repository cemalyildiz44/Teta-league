-- 1. Create news table
CREATE TABLE IF NOT EXISTS public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'LİG HABERİ',
  summary TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_news_published_at ON public.news(published_at DESC) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_news_slug ON public.news(slug);
CREATE INDEX IF NOT EXISTS idx_news_category ON public.news(category);

-- 3. Table Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.news TO authenticated;
GRANT SELECT ON TABLE public.news TO anon;

-- 4. Row Level Security
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- Public can read published news
CREATE POLICY "Public read access for published news"
ON public.news FOR SELECT
USING (is_published = true);

-- Admins can read, insert, update, and delete all news
CREATE POLICY "Admin all access for news"
ON public.news FOR ALL TO authenticated
USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 5. Storage Bucket for news images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'news-images',
  'news-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Storage policies for news-images
CREATE POLICY "News images public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'news-images');

CREATE POLICY "Admin insert news images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'news-images'
  AND (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
);

CREATE POLICY "Admin update news images"
ON storage.objects FOR UPDATE TO authenticated
WITH CHECK (
  bucket_id = 'news-images'
  AND (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
);

CREATE POLICY "Admin delete news images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'news-images'
  AND (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
);
