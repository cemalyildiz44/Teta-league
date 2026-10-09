-- ==============================================================================
-- TETA LEAGUE — NIGHT CUP PHASE 3: MATCH SUBMISSIONS, GOALSCORERS & PROOFS
-- ==============================================================================

-- 1. Create tournament-proofs storage bucket for match screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tournament-proofs',
  'tournament-proofs',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage Policies for tournament-proofs
DROP POLICY IF EXISTS "Tournament proofs public access" ON storage.objects;
CREATE POLICY "Tournament proofs public access"
ON storage.objects FOR SELECT
USING (bucket_id = 'tournament-proofs');

DROP POLICY IF EXISTS "Tournament representatives upload match proofs" ON storage.objects;
CREATE POLICY "Tournament representatives upload match proofs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'tournament-proofs'
  AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.tournament_matches tm
      JOIN public.tournament_applications ta ON (ta.id = tm.home_application_id OR ta.id = tm.away_application_id)
      WHERE tm.id::text = (storage.foldername(name))[2]
        AND ta.applicant_id = auth.uid()
        AND ta.status = 'APPROVED'
    )
  )
);

-- 2. Update tournament_matches status check to support review statuses
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_check;
ALTER TABLE public.tournament_matches ADD CONSTRAINT tournament_matches_status_check
  CHECK (status IN ('SCHEDULED', 'PLAYING', 'PENDING_REVIEW', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED'));

-- Add columns to tournament_matches if not exist
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS screenshot_url TEXT DEFAULT NULL;

-- 3. Create tournament_match_submissions table
CREATE TABLE IF NOT EXISTS public.tournament_match_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submitted_team_application_id UUID NOT NULL REFERENCES public.tournament_applications(id) ON DELETE CASCADE,
  home_score INT NOT NULL CHECK (home_score >= 0),
  away_score INT NOT NULL CHECK (away_score >= 0),
  screenshot_url TEXT NOT NULL,
  notes TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  rejection_reason TEXT DEFAULT NULL,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create tournament_match_goals table
CREATE TABLE IF NOT EXISTS public.tournament_match_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.tournament_match_submissions(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_application_id UUID NOT NULL REFERENCES public.tournament_applications(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_name TEXT DEFAULT NULL,
  goals INT NOT NULL DEFAULT 1 CHECK (goals > 0),
  is_own_goal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tour_match_subs_match_id ON public.tournament_match_submissions(match_id);
CREATE INDEX IF NOT EXISTS idx_tour_match_subs_status ON public.tournament_match_submissions(status);
CREATE INDEX IF NOT EXISTS idx_tour_match_goals_match_id ON public.tournament_match_goals(match_id);
CREATE INDEX IF NOT EXISTS idx_tour_match_goals_submission_id ON public.tournament_match_goals(submission_id);

-- Enable RLS
ALTER TABLE public.tournament_match_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_match_goals ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_match_submissions TO authenticated;
GRANT SELECT ON TABLE public.tournament_match_submissions TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_match_goals TO authenticated;
GRANT SELECT ON TABLE public.tournament_match_goals TO anon;

-- Policies for tournament_match_submissions
DROP POLICY IF EXISTS "Public read access for tournament_match_submissions" ON public.tournament_match_submissions;
CREATE POLICY "Public read access for tournament_match_submissions"
ON public.tournament_match_submissions FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Representatives insert tournament_match_submissions" ON public.tournament_match_submissions;
CREATE POLICY "Representatives insert tournament_match_submissions"
ON public.tournament_match_submissions FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tournament_matches tm
    JOIN public.tournament_applications ta ON (ta.id = tm.home_application_id OR ta.id = tm.away_application_id)
    WHERE tm.id = match_id
      AND ta.id = submitted_team_application_id
      AND ta.applicant_id = auth.uid()
      AND ta.status = 'APPROVED'
  )
);

DROP POLICY IF EXISTS "Admin all access for tournament_match_submissions" ON public.tournament_match_submissions;
CREATE POLICY "Admin all access for tournament_match_submissions"
ON public.tournament_match_submissions FOR ALL
TO authenticated
USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- Policies for tournament_match_goals
DROP POLICY IF EXISTS "Public read access for tournament_match_goals" ON public.tournament_match_goals;
CREATE POLICY "Public read access for tournament_match_goals"
ON public.tournament_match_goals FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Representatives insert tournament_match_goals" ON public.tournament_match_goals;
CREATE POLICY "Representatives insert tournament_match_goals"
ON public.tournament_match_goals FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tournament_match_submissions tms
    WHERE tms.id = submission_id
      AND tms.submitted_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admin all access for tournament_match_goals" ON public.tournament_match_goals;
CREATE POLICY "Admin all access for tournament_match_goals"
ON public.tournament_match_goals FOR ALL
TO authenticated
USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));
