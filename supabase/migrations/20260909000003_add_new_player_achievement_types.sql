-- 20260909000003_add_new_player_achievement_types.sql
-- Add KARMA_WINNER, 1V1_WINNER, and NIGHT_CUP_WINNER to player_achievements check constraint

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
    'NIGHT_CUP_WINNER'
));
