-- ==============================================================================
-- TETA LEAGUE — NIGHT CUP PHASE 4: KNOCKOUT BRACKET, FINALS & CHAMPION
-- ==============================================================================

-- 1. Enhance tournament_matches for Knockout Brackets and Extra Time / Penalties
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS penalty_home_score INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS penalty_away_score INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS winner_application_id UUID REFERENCES public.tournament_applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_match_id UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bracket_slot TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_bye BOOLEAN NOT NULL DEFAULT false;

-- Indexes for knockout bracket navigation
CREATE INDEX IF NOT EXISTS idx_tournament_matches_stage ON public.tournament_matches(tournament_id, stage);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_next_match ON public.tournament_matches(next_match_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_winner ON public.tournament_matches(winner_application_id);

-- 2. Ensure tournament_winners has unique constraint per tournament placement to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tournament_winner_placement
  ON public.tournament_winners(tournament_id, placement);

-- 3. Enhance player_achievements to safely support NIGHT_CUP_WINNER if awarded
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'player_achievements'
  ) THEN
    ALTER TABLE public.player_achievements DROP CONSTRAINT IF EXISTS player_achievements_achievement_type_check;
    ALTER TABLE public.player_achievements ADD CONSTRAINT player_achievements_achievement_type_check
      CHECK (achievement_type IN (
        'TOTW',
        'MATCH_POTM',
        'MONTH_POTM',
        'POTS',
        'KARMA_WINNER',
        '1V1_WINNER',
        'NIGHT_CUP_WINNER',
        'BALLON_DOR',
        'TOTS'
      ));
  END IF;
END $$;
