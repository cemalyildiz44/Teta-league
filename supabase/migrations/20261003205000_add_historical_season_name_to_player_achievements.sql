-- 20261003205000_add_historical_season_name_to_player_achievements.sql
-- Add season_name text column for historical season achievements (Season 1, 2, 3, 4)
-- without creating fake records in the seasons table.
-- Season 5, 6 and future seasons continue using season_id foreign key.

-- 1. Add season_name column to player_achievements
ALTER TABLE public.player_achievements
ADD COLUMN IF NOT EXISTS season_name TEXT;

-- 2. Add partial unique indexes for historical season achievements (where season_id IS NULL)
-- This ensures duplicate protection for historical seasons without interfering with existing season_id indexes.

-- Ballon d'Or duplicate protection for historical seasons
CREATE UNIQUE INDEX IF NOT EXISTS unique_historical_ballon_dor_per_season
ON public.player_achievements (player_id, season_name)
WHERE achievement_type = 'BALLON_DOR' AND season_id IS NULL;

-- TOTS duplicate protection for historical seasons
CREATE UNIQUE INDEX IF NOT EXISTS unique_historical_tots_per_season
ON public.player_achievements (player_id, season_name)
WHERE achievement_type = 'TOTS' AND season_id IS NULL;

-- POTS duplicate protection for historical seasons
CREATE UNIQUE INDEX IF NOT EXISTS unique_historical_pots_per_season
ON public.player_achievements (player_id, season_name)
WHERE achievement_type = 'POTS' AND season_id IS NULL;

-- TOTW duplicate protection for historical seasons
CREATE UNIQUE INDEX IF NOT EXISTS unique_historical_totw_per_week
ON public.player_achievements (player_id, season_name, week_number)
WHERE achievement_type = 'TOTW' AND season_id IS NULL;

-- Monthly POTM duplicate protection for historical seasons
CREATE UNIQUE INDEX IF NOT EXISTS unique_historical_monthly_potm
ON public.player_achievements (player_id, season_name, month_number)
WHERE achievement_type = 'MONTH_POTM' AND season_id IS NULL;
