-- 20261110140100_restrict_captain_stats_to_own_matches.sql
-- The captain stats policies only checked that the row's team_id is the captain's team and that the match is a
-- pending manual match. They did not check that the captain's team actually plays in that match, so a captain
-- could add stats for their players to any other pending match. The match must now involve the row's team.

DROP POLICY IF EXISTS "Captain insert stats" ON public.match_player_stats;
CREATE POLICY "Captain insert stats"
  ON public.match_player_stats FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'CAPTAIN'
        AND is_active = true
        AND team_id = match_player_stats.team_id
    )
    AND EXISTS (
      SELECT 1
      FROM matches m
      WHERE m.id = match_player_stats.match_id
        AND m.source = 'MANUAL'
        AND m.status = 'PENDING_REVIEW'
        AND match_player_stats.team_id IN (m.home_team_id, m.away_team_id)
    )
  );

DROP POLICY IF EXISTS "Captain update stats" ON public.match_player_stats;
CREATE POLICY "Captain update stats"
  ON public.match_player_stats FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'CAPTAIN'
        AND is_active = true
        AND team_id = match_player_stats.team_id
    )
    AND EXISTS (
      SELECT 1
      FROM matches m
      WHERE m.id = match_player_stats.match_id
        AND m.source = 'MANUAL'
        AND m.status = 'PENDING_REVIEW'
        AND match_player_stats.team_id IN (m.home_team_id, m.away_team_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'CAPTAIN'
        AND is_active = true
        AND team_id = match_player_stats.team_id
    )
    AND EXISTS (
      SELECT 1
      FROM matches m
      WHERE m.id = match_player_stats.match_id
        AND m.source = 'MANUAL'
        AND m.status = 'PENDING_REVIEW'
        AND match_player_stats.team_id IN (m.home_team_id, m.away_team_id)
    )
  );

DROP POLICY IF EXISTS "Captain delete stats" ON public.match_player_stats;
CREATE POLICY "Captain delete stats"
  ON public.match_player_stats FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'CAPTAIN'
        AND is_active = true
        AND team_id = match_player_stats.team_id
    )
    AND EXISTS (
      SELECT 1
      FROM matches m
      WHERE m.id = match_player_stats.match_id
        AND m.source = 'MANUAL'
        AND m.status = 'PENDING_REVIEW'
        AND match_player_stats.team_id IN (m.home_team_id, m.away_team_id)
    )
  );
