-- ==============================================================================
-- Migration: 20261112140000_team_replacement_plain_links.sql
-- Description: Keep league_teams.replaces_team_id / replaced_by_team_id as plain UUIDs.
--
-- As foreign keys to teams they gave PostgREST three teams <-> league_teams relationships,
-- so existing embeds such as teams.select('league_teams!inner(id)') failed with PGRST201
-- (ambiguous relationship) and pages like /takimlar and Admin > Ligler came back empty.
-- The values are only written by admin_replace_team, which validates both teams.
-- ==============================================================================

ALTER TABLE public.league_teams DROP CONSTRAINT IF EXISTS league_teams_replaces_team_id_fkey;
ALTER TABLE public.league_teams DROP CONSTRAINT IF EXISTS league_teams_replaced_by_team_id_fkey;

NOTIFY pgrst, 'reload schema';
