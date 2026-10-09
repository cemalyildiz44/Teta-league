-- ==============================================================================
-- TETA LEAGUE — NIGHT CUP PHASE 2: GROUPS, GROUP TEAMS AND TOURNAMENT MATCHES
-- ==============================================================================

-- 1. Create tournament_groups table
CREATE TABLE IF NOT EXISTS public.tournament_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create tournament_group_teams table
-- Enforces: A team application can only be assigned to ONE group per tournament
CREATE TABLE IF NOT EXISTS public.tournament_group_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.tournament_groups(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.tournament_applications(id) ON DELETE CASCADE,
  seed INT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, application_id)
);

-- 3. Create tournament_matches table
-- Independent from official league fixtures and matches
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
  home_application_id UUID REFERENCES public.tournament_applications(id) ON DELETE CASCADE,
  away_application_id UUID REFERENCES public.tournament_applications(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'GROUP',
  round_number INT NOT NULL DEFAULT 1,
  match_order INT NOT NULL DEFAULT 1,
  home_score INT DEFAULT NULL,
  away_score INT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'PLAYING', 'COMPLETED', 'CANCELLED')),
  scheduled_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_diff_teams CHECK (
    home_application_id IS NULL OR
    away_application_id IS NULL OR
    home_application_id <> away_application_id
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tournament_groups_tour_id ON public.tournament_groups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_group_teams_tour_group ON public.tournament_group_teams(tournament_id, group_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tour_group ON public.tournament_matches(tournament_id, group_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON public.tournament_matches(status);

-- 4. Enable Row Level Security
ALTER TABLE public.tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_group_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- 5. Grant Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_groups TO authenticated;
GRANT SELECT ON TABLE public.tournament_groups TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_group_teams TO authenticated;
GRANT SELECT ON TABLE public.tournament_group_teams TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_matches TO authenticated;
GRANT SELECT ON TABLE public.tournament_matches TO anon;

-- 6. RLS Policies for tournament_groups
DROP POLICY IF EXISTS "Public read access for tournament_groups" ON public.tournament_groups;
CREATE POLICY "Public read access for tournament_groups"
  ON public.tournament_groups FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin all access for tournament_groups" ON public.tournament_groups;
CREATE POLICY "Admin all access for tournament_groups"
  ON public.tournament_groups FOR ALL
  TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 7. RLS Policies for tournament_group_teams
DROP POLICY IF EXISTS "Public read access for tournament_group_teams" ON public.tournament_group_teams;
CREATE POLICY "Public read access for tournament_group_teams"
  ON public.tournament_group_teams FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin all access for tournament_group_teams" ON public.tournament_group_teams;
CREATE POLICY "Admin all access for tournament_group_teams"
  ON public.tournament_group_teams FOR ALL
  TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 8. RLS Policies for tournament_matches
DROP POLICY IF EXISTS "Public read access for tournament_matches" ON public.tournament_matches;
CREATE POLICY "Public read access for tournament_matches"
  ON public.tournament_matches FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin all access for tournament_matches" ON public.tournament_matches;
CREATE POLICY "Admin all access for tournament_matches"
  ON public.tournament_matches FOR ALL
  TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));
