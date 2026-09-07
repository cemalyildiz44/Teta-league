-- 1. Add image_url to leagues table
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Create league-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('league-images', 'league-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage Policies for league-images
-- Public read access for league images
CREATE POLICY "League images public access"
ON storage.objects FOR SELECT
USING (bucket_id = 'league-images');

-- Admin upload league images
CREATE POLICY "Admin upload league images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'league-images'
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('ADMIN', 'SUPER_ADMIN')
    AND is_active = true
  )
);

-- Admin update league images
CREATE POLICY "Admin update league images"
ON storage.objects FOR UPDATE
WITH CHECK (
  bucket_id = 'league-images'
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('ADMIN', 'SUPER_ADMIN')
    AND is_active = true
  )
);

-- Admin delete league images
CREATE POLICY "Admin delete league images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'league-images'
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('ADMIN', 'SUPER_ADMIN')
    AND is_active = true
  )
);
