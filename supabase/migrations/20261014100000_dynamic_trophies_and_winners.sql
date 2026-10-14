-- 20261014100000_dynamic_trophies_and_winners.sql
-- TETA League: Dynamic Trophies and Awards Management System
-- Creates trophies and trophy_winners tables, unique constraints, RLS policies and Storage bucket

-- 1. Create trophies table (Master definition of trophies & awards)
CREATE TABLE IF NOT EXISTS public.trophies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Özel Başarılar',
    target_type TEXT NOT NULL CHECK (target_type IN ('PLAYER', 'TEAM', 'BOTH')),
    season_id UUID REFERENCES public.seasons(id) ON DELETE SET NULL,
    season_name TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create trophy_winners table (Winner assignments)
CREATE TABLE IF NOT EXISTS public.trophy_winners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trophy_id UUID NOT NULL REFERENCES public.trophies(id) ON DELETE CASCADE,
    winner_type TEXT NOT NULL CHECK (winner_type IN ('PLAYER', 'TEAM')),
    player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    notes TEXT,
    awarded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    awarded_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- Bütünlük Kuralı: winner_type='PLAYER' ise player_id dolu, team_id null olmalı
    -- winner_type='TEAM' ise team_id dolu, player_id null olmalı
    CONSTRAINT check_winner_target_integrity CHECK (
        (winner_type = 'PLAYER' AND player_id IS NOT NULL AND team_id IS NULL) OR
        (winner_type = 'TEAM' AND team_id IS NOT NULL AND player_id IS NULL)
    )
);

-- 3. Unique partial indexes to prevent duplicate winner assignment to the same trophy
CREATE UNIQUE INDEX IF NOT EXISTS unique_trophy_player_winner 
ON public.trophy_winners (trophy_id, player_id) 
WHERE player_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_trophy_team_winner 
ON public.trophy_winners (trophy_id, team_id) 
WHERE team_id IS NOT NULL;

-- 4. Query performance indexes
CREATE INDEX IF NOT EXISTS idx_trophy_winners_player_id ON public.trophy_winners (player_id);
CREATE INDEX IF NOT EXISTS idx_trophy_winners_team_id ON public.trophy_winners (team_id);
CREATE INDEX IF NOT EXISTS idx_trophy_winners_trophy_id ON public.trophy_winners (trophy_id);
CREATE INDEX IF NOT EXISTS idx_trophies_season_id ON public.trophies (season_id);

-- 5. RLS Policies
ALTER TABLE public.trophies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trophy_winners ENABLE ROW LEVEL SECURITY;

-- Anyone can view trophies and winners
DROP POLICY IF EXISTS "Anyone can view trophies" ON public.trophies;
CREATE POLICY "Anyone can view trophies"
ON public.trophies
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Anyone can view trophy winners" ON public.trophy_winners;
CREATE POLICY "Anyone can view trophy winners"
ON public.trophy_winners
FOR SELECT
USING (true);

-- Admins can manage trophies
DROP POLICY IF EXISTS "Admins can manage trophies" ON public.trophies;
CREATE POLICY "Admins can manage trophies"
ON public.trophies
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
    )
);

-- Admins can manage trophy winners
DROP POLICY IF EXISTS "Admins can manage trophy winners" ON public.trophy_winners;
CREATE POLICY "Admins can manage trophy winners"
ON public.trophy_winners
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
    )
);

-- Table grants
GRANT SELECT ON TABLE public.trophies TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.trophies TO authenticated;
GRANT SELECT ON TABLE public.trophy_winners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.trophy_winners TO authenticated;

-- 6. Supabase Storage: trophies bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'trophies',
    'trophies',
    true,
    5242880,
    ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/jpg'];

-- Storage RLS policies
DROP POLICY IF EXISTS "Public read trophies bucket" ON storage.objects;
CREATE POLICY "Public read trophies bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'trophies');

DROP POLICY IF EXISTS "Admins upload trophies" ON storage.objects;
CREATE POLICY "Admins upload trophies"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'trophies' AND
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
    )
);

DROP POLICY IF EXISTS "Admins update trophies" ON storage.objects;
CREATE POLICY "Admins update trophies"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'trophies' AND
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
    )
);

DROP POLICY IF EXISTS "Admins delete trophies" ON storage.objects;
CREATE POLICY "Admins delete trophies"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'trophies' AND
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
    )
);
