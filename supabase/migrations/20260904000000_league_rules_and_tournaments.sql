
-- 1. Leagues Rules
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS rules JSONB DEFAULT '{}'::jsonb;

-- 2. Tournaments Table
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('1V1', 'KARMA', 'NIGHT_CUP')),
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(season_id, type, name)
);

-- 3. Tournament Winners Table
CREATE TABLE IF NOT EXISTS tournament_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  placement INTEGER NOT NULL CHECK (placement > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (profile_id IS NOT NULL OR team_id IS NOT NULL)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_season ON tournaments(season_id);
CREATE INDEX IF NOT EXISTS idx_tournament_winners_tour ON tournament_winners(tournament_id);

-- 5. RLS on Tournaments
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for tournaments" ON tournaments FOR SELECT USING (true);
CREATE POLICY "Public read access for tournament winners" ON tournament_winners FOR SELECT USING (true);

-- We assume server-side mutations use service role or we add explicit admin policy
CREATE POLICY "Admin all access for tournaments" ON tournaments FOR ALL 
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = true));

CREATE POLICY "Admin all access for tournament winners" ON tournament_winners FOR ALL 
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = true));

-- 6. Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('team-logos', 'team-logos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('tournaments', 'tournaments', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Team logos public access" ON storage.objects FOR SELECT USING (bucket_id = 'team-logos');
CREATE POLICY "Tournaments images public access" ON storage.objects FOR SELECT USING (bucket_id = 'tournaments');

CREATE POLICY "Admin upload team logos" ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'team-logos' AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = true));
CREATE POLICY "Admin update team logos" ON storage.objects FOR UPDATE 
WITH CHECK (bucket_id = 'team-logos' AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = true));
CREATE POLICY "Admin delete team logos" ON storage.objects FOR DELETE 
USING (bucket_id = 'team-logos' AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = true));

CREATE POLICY "Admin upload tournaments" ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'tournaments' AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = true));
CREATE POLICY "Admin update tournaments" ON storage.objects FOR UPDATE 
WITH CHECK (bucket_id = 'tournaments' AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = true));
CREATE POLICY "Admin delete tournaments" ON storage.objects FOR DELETE 
USING (bucket_id = 'tournaments' AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN') AND is_active = true));

