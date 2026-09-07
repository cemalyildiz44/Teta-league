-- 000015_restrict_team_creation.sql

DROP FUNCTION IF EXISTS public.create_user_team(TEXT, TEXT, BIGINT, TEXT);
