-- ==============================================================================
-- Migration: 20261021020000_allow_repeat_trophies_and_tournament_award.sql
-- Description:
-- 1. Remove duplicate trophy restriction on trophy_winners to allow players and teams
--    to earn the same trophy multiple times (e.g. 1x, 2x, 3x).
-- 2. Preserve strict TOTW unique index (unique_totw_week_player_winner) for single-week integrity.
-- 3. Add trophy_id foreign key column to public.tournaments for custom Night Cup awards.
-- 4. Add idempotency_key to trophy_winners with partial unique index for atomic duplicate
--    protection and safe repeat award operations.
-- ==============================================================================

-- 1. Drop partial unique indexes that prevented repeat trophies
DROP INDEX IF EXISTS public.unique_trophy_player_general_winner;
DROP INDEX IF EXISTS public.unique_trophy_team_winner;

-- 2. Create non-unique query performance indexes
CREATE INDEX IF NOT EXISTS idx_trophy_winners_trophy_player_general
ON public.trophy_winners (trophy_id, player_id)
WHERE player_id IS NOT NULL AND totw_week_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_trophy_winners_trophy_team_general
ON public.trophy_winners (trophy_id, team_id)
WHERE team_id IS NOT NULL;

-- 3. Add trophy_id to public.tournaments for Night Cup customizable winner awards
ALTER TABLE public.tournaments
ADD COLUMN IF NOT EXISTS trophy_id UUID REFERENCES public.trophies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_trophy_id
ON public.tournaments (trophy_id);

-- 4. Add idempotency_key to trophy_winners for atomic operation duplicate safety
ALTER TABLE public.trophy_winners
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS unique_trophy_winners_idempotency
ON public.trophy_winners (idempotency_key)
WHERE idempotency_key IS NOT NULL;
