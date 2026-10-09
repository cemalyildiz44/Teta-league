-- ==============================================================================
-- Migration: 20261009170000_night_cup_phase1_tournaments_and_storage.sql
-- Description: Night Cup Phase 1 - Tournament fields enhancement and storage setup.
-- Adds banner_url, rules, details, prize, teams_per_group, advancing_teams_per_group,
-- status, and discord_url to public.tournaments.
-- Sets up the tournament-logos storage bucket with secure authenticated RLS.
-- ==============================================================================

-- 1. Add Phase 1 columns to public.tournaments
ALTER TABLE public.tournaments
ADD COLUMN IF NOT EXISTS banner_url TEXT,
ADD COLUMN IF NOT EXISTS rules TEXT,
ADD COLUMN IF NOT EXISTS details TEXT,
ADD COLUMN IF NOT EXISTS prize TEXT,
ADD COLUMN IF NOT EXISTS teams_per_group INTEGER DEFAULT 4,
ADD COLUMN IF NOT EXISTS advancing_teams_per_group INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'REGISTRATION',
ADD COLUMN IF NOT EXISTS discord_url TEXT;

-- Safely add status CHECK constraint if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournaments_status_check'
      AND conrelid = 'public.tournaments'::regclass
  ) THEN
    ALTER TABLE public.tournaments
    ADD CONSTRAINT tournaments_status_check
    CHECK (status IN ('DRAFT', 'REGISTRATION', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'));
  END IF;
END $$;

-- 2. Create tournament-logos storage bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tournament-logos',
  'tournament-logos',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 3. Storage Policies for tournament-logos
-- Public read access
DROP POLICY IF EXISTS "Public read access for tournament logos" ON storage.objects;
CREATE POLICY "Public read access for tournament logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'tournament-logos');

-- Authenticated users can upload to their own folder: ${auth.uid()}/*
DROP POLICY IF EXISTS "Authenticated users upload own tournament logo" ON storage.objects;
CREATE POLICY "Authenticated users upload own tournament logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tournament-logos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
);

-- Authenticated users can update their own logos
DROP POLICY IF EXISTS "Authenticated users update own tournament logo" ON storage.objects;
CREATE POLICY "Authenticated users update own tournament logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tournament-logos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
)
WITH CHECK (
  bucket_id = 'tournament-logos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
);

-- Authenticated users can delete their own logos
DROP POLICY IF EXISTS "Authenticated users delete own tournament logo" ON storage.objects;
CREATE POLICY "Authenticated users delete own tournament logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tournament-logos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
);

-- Admins full access to tournament-logos
DROP POLICY IF EXISTS "Admins full access to tournament logos" ON storage.objects;
CREATE POLICY "Admins full access to tournament logos"
ON storage.objects FOR ALL
TO authenticated
USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));
