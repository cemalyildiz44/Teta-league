
-- Fix previous migration missing GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournaments TO authenticated;
GRANT SELECT ON TABLE public.tournaments TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_winners TO authenticated;
GRANT SELECT ON TABLE public.tournament_winners TO anon;

-- Fix previous migration policies that caused recursion or didn't work for anon
DROP POLICY IF EXISTS "Admin all access for tournaments" ON tournaments;
DROP POLICY IF EXISTS "Admin all access for tournament winners" ON tournament_winners;

CREATE POLICY "Admin all access for tournaments" ON tournaments FOR ALL TO authenticated
USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Admin all access for tournament winners" ON tournament_winners FOR ALL TO authenticated
USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- Alter tournaments to add Night Cup specific fields
ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS max_teams INTEGER,
ADD COLUMN IF NOT EXISTS registration_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS registration_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tournament_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_registration_open BOOLEAN DEFAULT false;

-- Create tournament_applications
CREATE TABLE IF NOT EXISTS tournament_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, applicant_id)
);

-- Create tournament_application_players
CREATE TABLE IF NOT EXISTS tournament_application_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES tournament_applications(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(application_id, profile_id)
);

-- Alter tournament_winners to support Night Cup external teams
ALTER TABLE tournament_winners ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES tournament_applications(id) ON DELETE CASCADE;
ALTER TABLE tournament_winners DROP CONSTRAINT IF EXISTS tournament_winners_check;
ALTER TABLE tournament_winners ADD CONSTRAINT tournament_winners_check CHECK (profile_id IS NOT NULL OR team_id IS NOT NULL OR application_id IS NOT NULL);

-- Add missing RLS to new tables
ALTER TABLE tournament_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_application_players ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_applications TO authenticated;
GRANT SELECT ON TABLE public.tournament_applications TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_application_players TO authenticated;
GRANT SELECT ON TABLE public.tournament_application_players TO anon;

-- Policies for tournament_applications
CREATE POLICY "Public read access for tournament_applications" ON tournament_applications FOR SELECT USING (true);

CREATE POLICY "Users can insert their own application" ON tournament_applications FOR INSERT TO authenticated
WITH CHECK (applicant_id = (select auth.uid()));

CREATE POLICY "Users can update their own pending application" ON tournament_applications FOR UPDATE TO authenticated
USING (applicant_id = (select auth.uid()) AND status = 'PENDING')
WITH CHECK (applicant_id = (select auth.uid()));

CREATE POLICY "Admin all access for tournament_applications" ON tournament_applications FOR ALL TO authenticated
USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- Policies for tournament_application_players
CREATE POLICY "Public read access for tournament_application_players" ON tournament_application_players FOR SELECT USING (true);

CREATE POLICY "Users can insert players into their own application" ON tournament_application_players FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM tournament_applications WHERE id = application_id AND applicant_id = (select auth.uid())));

CREATE POLICY "Users can delete players from their own application" ON tournament_application_players FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM tournament_applications WHERE id = application_id AND applicant_id = (select auth.uid()) AND status = 'PENDING'));

CREATE POLICY "Admin all access for tournament_application_players" ON tournament_application_players FOR ALL TO authenticated
USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

