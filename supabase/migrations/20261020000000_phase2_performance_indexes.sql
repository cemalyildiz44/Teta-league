-- 20261020000000_phase2_performance_indexes.sql
-- TETA League: Phase 2 - Database Query Performance Indexes
-- Adds targeted B-Tree indexes for matches and match_player_stats to eliminate
-- sequential table scans on public player, stats, and team profile routes.

-- 1. Index match_player_stats on player_id
-- Accelerates player profile (/oyuncular/[username]), market value calculations (/oyuncular),
-- and team roster career performance lookups (/takim/[slug]).
CREATE INDEX IF NOT EXISTS idx_match_player_stats_player_id
ON public.match_player_stats (player_id);

-- 2. Composite index on matches (season_id, league_id, status)
-- Accelerates approved match queries for global stats (/istatistikler),
-- league stats (/lig/.../istatistikler), and TOTW period selection.
CREATE INDEX IF NOT EXISTS idx_matches_scope_status
ON public.matches (season_id, league_id, status);

-- 3. Indexes on matches for team match lookups (home and away)
-- Accelerates team profile (/takim/[slug]) all-time and season match history,
-- enabling PostgreSQL to execute fast BitmapOr index scans for home_team_id / away_team_id queries.
CREATE INDEX IF NOT EXISTS idx_matches_home_team
ON public.matches (home_team_id);

CREATE INDEX IF NOT EXISTS idx_matches_away_team
ON public.matches (away_team_id);
