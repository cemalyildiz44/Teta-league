-- Create match-screenshots storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'match-screenshots',
  'match-screenshots',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage Policies for match-screenshots

-- Public read access for match screenshots
CREATE POLICY "Match screenshots public access"
ON storage.objects FOR SELECT
USING (bucket_id = 'match-screenshots');

-- Captain and Admin upload match screenshots
CREATE POLICY "Captains and Admins upload match screenshots"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'match-screenshots'
  AND (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role = 'CAPTAIN'
      AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
  )
);

-- Captain and Admin update match screenshots
CREATE POLICY "Captains and Admins update match screenshots"
ON storage.objects FOR UPDATE
WITH CHECK (
  bucket_id = 'match-screenshots'
  AND (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role = 'CAPTAIN'
      AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
  )
);

-- Captain and Admin delete match screenshots
CREATE POLICY "Captains and Admins delete match screenshots"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'match-screenshots'
  AND (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role = 'CAPTAIN'
      AND is_active = true
    )
  )
);
