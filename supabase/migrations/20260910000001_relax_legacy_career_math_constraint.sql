-- 20260910000001_relax_legacy_career_math_constraint.sql
-- Relax player_legacy_career_stats math constraint and allow NULL for wins, draws, losses

-- 1. Drop the check constraint that enforces wins + draws + losses = matches_played
ALTER TABLE public.player_legacy_career_stats
DROP CONSTRAINT IF EXISTS chk_legacy_matches_math;

-- 2. Drop NOT NULL constraints on wins, draws, losses to allow NULL in new records
ALTER TABLE public.player_legacy_career_stats
ALTER COLUMN wins DROP NOT NULL,
ALTER COLUMN draws DROP NOT NULL,
ALTER COLUMN losses DROP NOT NULL;

-- 3. Drop DEFAULT 0 on wins, draws, losses so that omitted fields default to NULL instead of 0
ALTER TABLE public.player_legacy_career_stats
ALTER COLUMN wins DROP DEFAULT,
ALTER COLUMN draws DROP DEFAULT,
ALTER COLUMN losses DROP DEFAULT;
