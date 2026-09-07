-- 009_rls_policies.sql
-- V10 SECURITY HARDENING
-- No Supabase execution performed here.

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_ea_id_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_raw_ea_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_team_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_activity_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ea_sync_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ea_sync_logs ENABLE ROW LEVEL SECURITY;

-- 1. Profiles
CREATE POLICY "Public read profiles"
  ON profiles FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Admin full profiles"
  ON profiles FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 2. User Roles
CREATE POLICY "Users read own roles"
  ON user_roles FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Admin read non-super roles"
  ON user_roles FOR SELECT TO authenticated
  USING (
    has_role('ADMIN')
    AND role <> 'SUPER_ADMIN'
  );

-- SUPER_ADMIN has complete role management.
CREATE POLICY "Super Admin full user_roles"
  ON user_roles FOR ALL TO authenticated
  USING (has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('SUPER_ADMIN'));

-- ADMIN may manage PLAYER, CAPTAIN and MODERATOR roles only.
-- ADMIN cannot create, modify or delete ADMIN/SUPER_ADMIN roles.
CREATE POLICY "Admin manage lower roles"
  ON user_roles FOR INSERT TO authenticated
  WITH CHECK (
    has_role('ADMIN')
    AND role IN ('MODERATOR', 'CAPTAIN', 'PLAYER')
  );

CREATE POLICY "Admin update lower roles"
  ON user_roles FOR UPDATE TO authenticated
  USING (
    has_role('ADMIN')
    AND role IN ('MODERATOR', 'CAPTAIN', 'PLAYER')
  )
  WITH CHECK (
    has_role('ADMIN')
    AND role IN ('MODERATOR', 'CAPTAIN', 'PLAYER')
  );

CREATE POLICY "Admin delete lower roles"
  ON user_roles FOR DELETE TO authenticated
  USING (
    has_role('ADMIN')
    AND role IN ('MODERATOR', 'CAPTAIN', 'PLAYER')
  );

-- 3. Core structural tables
CREATE POLICY "Public read seasons"
  ON seasons FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admin full seasons"
  ON seasons FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Public read leagues"
  ON leagues FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admin full leagues"
  ON leagues FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Public read teams"
  ON teams FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admin full teams"
  ON teams FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Public read league_teams"
  ON league_teams FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admin full league_teams"
  ON league_teams FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Public read transfer_windows"
  ON transfer_windows FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admin full transfer_windows"
  ON transfer_windows FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Public read fixtures"
  ON fixtures FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admin full fixtures"
  ON fixtures FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 4. Player Memberships & EA History
CREATE POLICY "Users read own history"
  ON player_ea_id_history FOR SELECT TO authenticated
  USING ((select auth.uid()) = player_id);

CREATE POLICY "Admin full player_ea_id_history"
  ON player_ea_id_history FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Public read team_memberships"
  ON team_memberships FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admin full team_memberships"
  ON team_memberships FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 5. Transfers
CREATE POLICY "Player read own transfers"
  ON transfers FOR SELECT TO authenticated
  USING ((select auth.uid()) = player_id);

CREATE POLICY "Captain read team transfers"
  ON transfers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'CAPTAIN'
        AND is_active = true
        AND (
          team_id = transfers.to_team_id
          OR team_id = transfers.from_team_id
        )
    )
  );

CREATE POLICY "Captain insert transfers"
  ON transfers FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = (select auth.uid())
    AND status = 'PENDING_PLAYER'::transfer_status_enum
    AND admin_id IS NULL
    AND admin_acted_at IS NULL
    AND player_responded_at IS NULL
    AND effective_at IS NULL
    AND from_team_id IS DISTINCT FROM to_team_id
    AND EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'CAPTAIN'
        AND is_active = true
        AND team_id = transfers.to_team_id
    )
  );

-- Direct client writes may not create/transition a transfer to APPROVED.
-- Approval is performed atomically by approve_transfer() (SECURITY DEFINER).
CREATE POLICY "Admin insert pending transfers"
  ON transfers FOR INSERT TO authenticated
  WITH CHECK (
    (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
    AND status = 'PENDING_PLAYER'::transfer_status_enum
    AND admin_id IS NULL
    AND admin_acted_at IS NULL
    AND player_responded_at IS NULL
    AND effective_at IS NULL
  );

CREATE POLICY "Admin update non-approved transfers"
  ON transfers FOR UPDATE TO authenticated
  USING (
    (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
    AND status <> 'APPROVED'::transfer_status_enum
  )
  WITH CHECK (
    (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
    AND status <> 'APPROVED'::transfer_status_enum
  );

CREATE POLICY "Admin delete transfers"
  ON transfers FOR DELETE TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Admin read transfers"
  ON transfers FOR SELECT TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 6. Matches & EA Data
CREATE POLICY "Public read matches"
  ON matches FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Captain submit match"
  ON matches FOR INSERT TO authenticated
  WITH CHECK (
    source = 'MANUAL'
    AND fixture_id IS NOT NULL
    AND status = 'PENDING_REVIEW'
    AND submitted_by = (select auth.uid())
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'CAPTAIN'
        AND is_active = true
        AND (
          team_id = matches.home_team_id
          OR team_id = matches.away_team_id
        )
    )
  );

CREATE POLICY "Captain update pending match"
  ON matches FOR UPDATE TO authenticated
  USING (
    status = 'PENDING_REVIEW'
    AND EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'CAPTAIN'
        AND is_active = true
        AND (
          team_id = matches.home_team_id
          OR team_id = matches.away_team_id
        )
    )
  )
  WITH CHECK (
    status = 'PENDING_REVIEW'
    AND source = 'MANUAL'
    AND fixture_id IS NOT NULL
    AND submitted_by = (select auth.uid())
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role = 'CAPTAIN'
        AND is_active = true
        AND (
          team_id = matches.home_team_id
          OR team_id = matches.away_team_id
        )
    )
  );

CREATE POLICY "Admin full matches"
  ON matches FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- RAW EA DATA (Admin Only)
CREATE POLICY "Admin full match_raw_ea_data"
  ON match_raw_ea_data FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- Match Player Stats
CREATE POLICY "Public read match_player_stats"
  ON match_player_stats FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Captain insert stats"
  ON match_player_stats FOR INSERT TO authenticated
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
    )
  );

CREATE POLICY "Captain update stats"
  ON match_player_stats FOR UPDATE TO authenticated
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
    )
  );

CREATE POLICY "Captain delete stats"
  ON match_player_stats FOR DELETE TO authenticated
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
    )
  );

CREATE POLICY "Admin full match_player_stats"
  ON match_player_stats FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 7. Stats
CREATE POLICY "Public read stats"
  ON player_season_stats FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Public read p_t_stats"
  ON player_team_season_stats FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Public read team_stats"
  ON team_season_stats FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admin full stats"
  ON player_season_stats FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Admin full p_t_stats"
  ON player_team_season_stats FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Admin full team_stats"
  ON team_season_stats FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 8. Social
CREATE POLICY "Public read active posts"
  ON posts FOR SELECT TO anon, authenticated
  USING (is_deleted = false OR (select auth.uid()) = author_id);

CREATE POLICY "Users insert posts"
  ON posts FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = author_id);

CREATE POLICY "Users update own posts"
  ON posts FOR UPDATE TO authenticated
  USING ((select auth.uid()) = author_id)
  WITH CHECK ((select auth.uid()) = author_id);

-- Moderator can moderate existing posts, but cannot create posts.
CREATE POLICY "Moderator update posts"
  ON posts FOR UPDATE TO authenticated
  USING (has_role('MODERATOR'))
  WITH CHECK (has_role('MODERATOR'));

CREATE POLICY "Moderator delete posts"
  ON posts FOR DELETE TO authenticated
  USING (has_role('MODERATOR'));

CREATE POLICY "Admin full posts"
  ON posts FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Public read active comments"
  ON comments FOR SELECT TO anon, authenticated
  USING (is_deleted = false OR (select auth.uid()) = author_id);

CREATE POLICY "Users insert comments"
  ON comments FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = author_id);

CREATE POLICY "Users update own comments"
  ON comments FOR UPDATE TO authenticated
  USING ((select auth.uid()) = author_id)
  WITH CHECK ((select auth.uid()) = author_id);

CREATE POLICY "Moderator update comments"
  ON comments FOR UPDATE TO authenticated
  USING (has_role('MODERATOR'))
  WITH CHECK (has_role('MODERATOR'));

CREATE POLICY "Moderator delete comments"
  ON comments FOR DELETE TO authenticated
  USING (has_role('MODERATOR'));

CREATE POLICY "Admin full comments"
  ON comments FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Public read likes"
  ON likes FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Users insert likes"
  ON likes FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users delete likes"
  ON likes FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users read own reports"
  ON reports FOR SELECT TO authenticated
  USING ((select auth.uid()) = reporter_id);

CREATE POLICY "Users insert reports"
  ON reports FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = reporter_id);

CREATE POLICY "Moderator update reports"
  ON reports FOR UPDATE TO authenticated
  USING (has_role('MODERATOR'))
  WITH CHECK (has_role('MODERATOR'));

CREATE POLICY "Moderator delete reports"
  ON reports FOR DELETE TO authenticated
  USING (has_role('MODERATOR'));

CREATE POLICY "Admin full reports"
  ON reports FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Users read own activity"
  ON daily_activity_counts FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Admin full activity"
  ON daily_activity_counts FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 9. System
CREATE POLICY "Users own notifications"
  ON notifications FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users update notifications"
  ON notifications FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Admin full notifications"
  ON notifications FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Admin read audit_logs"
  ON audit_logs FOR SELECT TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Admin full system_settings"
  ON system_settings FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Admin read ea_sync_configs"
  ON ea_sync_configs FOR SELECT TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Admin full ea_sync_configs"
  ON ea_sync_configs FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Admin read ea_sync_logs"
  ON ea_sync_logs FOR SELECT TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

CREATE POLICY "Admin full ea_sync_logs"
  ON ea_sync_logs FOR ALL TO authenticated
  USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- NOTE:
-- has_role() remains executable by authenticated because it is referenced by
-- RLS policies. Revoking EXECUTE from authenticated would break those policies.
-- ============================================================
-- TABLE PRIVILEGES
-- RLS decides WHICH rows/actions are allowed.
-- PostgreSQL GRANT decides WHICH operations are available.
-- Keep these privileges broad enough for RLS, but do not GRANT ALL.
-- ============================================================

-- Public read-only tables
GRANT SELECT ON TABLE
  public.fixtures,
  public.league_teams,
  public.leagues,
  public.comments,
  public.likes,
  public.match_player_stats,
  public.matches,
  public.player_season_stats,
  public.player_team_season_stats,
  public.posts,
  public.profiles,
  public.seasons,
  public.team_memberships,
  public.team_season_stats,
  public.teams,
  public.transfer_windows
TO anon;

-- Authenticated users need SELECT wherever RLS policies expose rows.
GRANT SELECT ON TABLE
  public.fixtures,
  public.league_teams,
  public.leagues,
  public.comments,
  public.likes,
  public.match_player_stats,
  public.matches,
  public.player_season_stats,
  public.player_team_season_stats,
  public.posts,
  public.profiles,
  public.seasons,
  public.team_memberships,
  public.team_season_stats,
  public.teams,
  public.transfer_windows,
  public.audit_logs,
  public.daily_activity_counts,
  public.ea_sync_configs,
  public.ea_sync_logs,
  public.match_raw_ea_data,
  public.notifications,
  public.player_ea_id_history,
  public.reports,
  public.system_settings,
  public.transfers,
  public.user_roles
TO authenticated;

-- Authenticated write privileges required by RLS policies.
GRANT INSERT, UPDATE, DELETE ON TABLE
  public.comments,
  public.likes,
  public.match_player_stats,
  public.matches,
  public.posts,
  public.profiles,
  public.reports,
  public.transfers,
  public.notifications,
  public.user_roles
TO authenticated;

-- Admin policies may operate on these tables through RLS.
GRANT INSERT, UPDATE, DELETE ON TABLE
  public.audit_logs,
  public.daily_activity_counts,
  public.ea_sync_configs,
  public.ea_sync_logs,
  public.fixtures,
  public.league_teams,
  public.leagues,
  public.match_raw_ea_data,
  public.player_ea_id_history,
  public.player_season_stats,
  public.player_team_season_stats,
  public.seasons,
  public.system_settings,
  public.team_memberships,
  public.team_season_stats,
  public.teams,
  public.transfer_windows
TO authenticated;
