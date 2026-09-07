-- Drop the old incorrect general UNIQUE constraints
ALTER TABLE public.player_achievements DROP CONSTRAINT IF EXISTS unique_potm_per_match;
ALTER TABLE public.player_achievements DROP CONSTRAINT IF EXISTS unique_totw_per_week;
ALTER TABLE public.player_achievements DROP CONSTRAINT IF EXISTS unique_monthly_potm;
ALTER TABLE public.player_achievements DROP CONSTRAINT IF EXISTS unique_pots_per_season;

-- Create correct Partial Unique Indexes so they only apply to their specific achievement types
-- This prevents postgres from falsely throwing unique violations when match_id is null for non-MATCH_POTM types

CREATE UNIQUE INDEX unique_totw_per_week 
ON public.player_achievements (player_id, season_id, week_number) 
WHERE achievement_type = 'TOTW';

CREATE UNIQUE INDEX unique_potm_per_match 
ON public.player_achievements (player_id, match_id) 
WHERE achievement_type = 'MATCH_POTM';

CREATE UNIQUE INDEX unique_monthly_potm 
ON public.player_achievements (player_id, season_id, month_number) 
WHERE achievement_type = 'MONTH_POTM';

CREATE UNIQUE INDEX unique_pots_per_season 
ON public.player_achievements (player_id, season_id) 
WHERE achievement_type = 'POTS';
