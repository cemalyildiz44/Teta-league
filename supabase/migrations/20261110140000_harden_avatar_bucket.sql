-- 20261110140000_harden_avatar_bucket.sql
-- The avatars bucket had no size or type limit, so any file of any size could be stored in a public bucket.
-- Use the same limits as the other image buckets (existing avatars are webp/png/jpeg and at most ~1 MB).
-- The UPDATE policy also lacked a USING clause; it now only matches rows in the caller's own folder.

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'avatars';

DROP POLICY IF EXISTS "Users can update their own avatars." ON storage.objects;
CREATE POLICY "Users can update their own avatars."
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
