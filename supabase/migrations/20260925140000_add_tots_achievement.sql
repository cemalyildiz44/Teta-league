-- 20260925140000_add_tots_achievement.sql
-- Add TOTS (Team of the Season) to player_achievements achievement_type check constraint
-- Add partial unique index for (player_id, season_id) where achievement_type = 'TOTS'

-- 1. Update check constraint to include TOTS
ALTER TABLE public.player_achievements
DROP CONSTRAINT IF EXISTS player_achievements_achievement_type_check;

ALTER TABLE public.player_achievements
ADD CONSTRAINT player_achievements_achievement_type_check
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

-- 2. Partial unique index to prevent duplicate TOTS per player per season
CREATE UNIQUE INDEX IF NOT EXISTS unique_tots_per_season
ON public.player_achievements (player_id, season_id)
WHERE achievement_type = 'TOTS';
