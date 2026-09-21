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

-- 1. Public read access for match screenshots
CREATE POLICY "Match screenshots public access"
ON storage.objects FOR SELECT
USING (bucket_id = 'match-screenshots');

-- 2. Captain and Admin upload match screenshots
CREATE POLICY "Captains and Admins upload match screenshots"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'match-screenshots'
  AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
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
      AND team_id::text = (storage.foldername(name))[1]
    )
  )
);

-- 3. Admin update match screenshots (Captains cannot update)
CREATE POLICY "Admins update match screenshots"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'match-screenshots'
  AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('ADMIN', 'SUPER_ADMIN')
    AND is_active = true
  )
)
WITH CHECK (
  bucket_id = 'match-screenshots'
  AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('ADMIN', 'SUPER_ADMIN')
    AND is_active = true
  )
);

-- 4. Admin delete match screenshots (Captains cannot delete)
CREATE POLICY "Admins delete match screenshots"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'match-screenshots'
  AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('ADMIN', 'SUPER_ADMIN')
    AND is_active = true
  )
);
