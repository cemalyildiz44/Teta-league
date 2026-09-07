-- 008_functions_and_triggers.sql
-- V10 SECURITY HARDENING
-- No Supabase execution performed here.

-- 1. Role Check Helper (Secure)
CREATE OR REPLACE FUNCTION public.has_role(p_role user_role_enum)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role = p_role
      AND is_active = true
      AND revoked_at IS NULL
  );
END;
$$;

-- has_role() is intentionally executable by authenticated because RLS policies
-- call it. It is not revoked from authenticated; otherwise those policies fail.
REVOKE EXECUTE ON FUNCTION public.has_role(user_role_enum) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(user_role_enum) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(user_role_enum) TO authenticated;

-- 1B. User-role privilege-escalation protection
-- ADMIN may manage ordinary roles, but can never create, modify, or delete
-- SUPER_ADMIN rows. SUPER_ADMIN retains full role-management authority.
CREATE OR REPLACE FUNCTION public.enforce_user_role_management()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_super_admin BOOLEAN;
    v_is_admin BOOLEAN;
BEGIN
    -- Only the auth signup trigger runs without an authenticated actor.
    IF auth.uid() IS NULL THEN
        IF TG_OP = 'INSERT' AND NEW.role = 'PLAYER' THEN
            NEW.is_active := true;
            NEW.revoked_at := NULL;
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Unauthenticated role mutation is not allowed.';
    END IF;

    v_is_super_admin := has_role('SUPER_ADMIN');
    v_is_admin := has_role('ADMIN');

    IF v_is_super_admin THEN
        -- Even SUPER_ADMIN cannot create malformed role scopes.
        IF NEW.role = 'CAPTAIN' AND NEW.team_id IS NULL THEN
            RAISE EXCEPTION 'CAPTAIN role requires team_id.';
        END IF;
        IF NEW.role <> 'CAPTAIN' AND NEW.team_id IS NOT NULL THEN
            RAISE EXCEPTION 'Only CAPTAIN may have team_id.';
        END IF;
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        IF NEW.is_active = false THEN
            NEW.revoked_at := COALESCE(NEW.revoked_at, CURRENT_TIMESTAMP);
        ELSIF NEW.is_active = true THEN
            NEW.revoked_at := NULL;
        END IF;
        RETURN NEW;
    END IF;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only ADMIN or SUPER_ADMIN may manage user roles.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'SUPER_ADMIN' THEN
            RAISE EXCEPTION 'ADMIN cannot grant SUPER_ADMIN.';
        END IF;
        IF NEW.role = 'CAPTAIN' AND NEW.team_id IS NULL THEN
            RAISE EXCEPTION 'CAPTAIN role requires team_id.';
        END IF;
        IF NEW.role <> 'CAPTAIN' AND NEW.team_id IS NOT NULL THEN
            RAISE EXCEPTION 'Only CAPTAIN may have team_id.';
        END IF;
        NEW.granted_by := auth.uid();
        IF NEW.is_active = false THEN
            NEW.revoked_at := COALESCE(NEW.revoked_at, CURRENT_TIMESTAMP);
        ELSE
            NEW.revoked_at := NULL;
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.role = 'SUPER_ADMIN' OR NEW.role = 'SUPER_ADMIN' THEN
            RAISE EXCEPTION 'ADMIN cannot modify or create SUPER_ADMIN roles.';
        END IF;
        IF NEW.role = 'CAPTAIN' AND NEW.team_id IS NULL THEN
            RAISE EXCEPTION 'CAPTAIN role requires team_id.';
        END IF;
        IF NEW.role <> 'CAPTAIN' AND NEW.team_id IS NOT NULL THEN
            RAISE EXCEPTION 'Only CAPTAIN may have team_id.';
        END IF;
        NEW.granted_by := auth.uid();
        IF NEW.is_active = false THEN
            NEW.revoked_at := COALESCE(NEW.revoked_at, CURRENT_TIMESTAMP);
        ELSE
            NEW.revoked_at := NULL;
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.role = 'SUPER_ADMIN' THEN
            RAISE EXCEPTION 'ADMIN cannot delete SUPER_ADMIN roles.';
        END IF;
        RETURN OLD;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_enforce_user_role_management
  BEFORE INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_user_role_management();

-- 2. Auth Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    now(),
    now()
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'PLAYER');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. EA ID Sync Trigger
CREATE OR REPLACE FUNCTION public.sync_ea_id_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF OLD.current_ea_player_id IS DISTINCT FROM NEW.current_ea_player_id THEN
        UPDATE player_ea_id_history
        SET valid_to = now()
        WHERE player_id = NEW.id AND valid_to IS NULL;

        IF NEW.current_ea_player_id IS NOT NULL THEN
            INSERT INTO player_ea_id_history (player_id, ea_player_id, valid_from)
            VALUES (NEW.id, NEW.current_ea_player_id, now());
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_ea_id
  AFTER UPDATE OF current_ea_player_id ON profiles
  FOR EACH ROW EXECUTE PROCEDURE public.sync_ea_id_history();

-- 4. Match Player Stats Team and Membership Integrity
CREATE OR REPLACE FUNCTION public.check_match_player_team_and_membership()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_home UUID;
    v_away UUID;
    v_status match_status_enum;
    v_source match_source_enum;
    v_match_date TIMESTAMPTZ;
    v_is_admin BOOLEAN;
BEGIN
    SELECT home_team_id, away_team_id, status, source,
           COALESCE(played_at, created_at)
    INTO v_home, v_away, v_status, v_source, v_match_date
    FROM matches
    WHERE id = NEW.match_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Match not found.';
    END IF;

    IF NEW.team_id != v_home AND NEW.team_id != v_away THEN
        RAISE EXCEPTION
          'Player team % must be home % or away % for match %',
          NEW.team_id, v_home, v_away, NEW.match_id;
    END IF;

    v_is_admin := (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

    IF NOT v_is_admin THEN
        IF TG_OP = 'UPDATE' THEN
            IF OLD.match_id IS DISTINCT FROM NEW.match_id OR
               OLD.team_id IS DISTINCT FROM NEW.team_id OR
               OLD.player_id IS DISTINCT FROM NEW.player_id THEN
                RAISE EXCEPTION
                  'Captains cannot change match_id, team_id, or player_id of existing stats.';
            END IF;
        END IF;

        IF v_status != 'PENDING_REVIEW' THEN
            RAISE EXCEPTION
              'Captains can only modify player stats for PENDING_REVIEW matches.';
        END IF;

        IF v_source != 'MANUAL' THEN
            RAISE EXCEPTION
              'Captains can only modify player stats for MANUAL matches.';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
              AND role = 'CAPTAIN'
              AND is_active = true
              AND team_id = NEW.team_id
        ) THEN
            RAISE EXCEPTION
              'Captains can only enter stats for their own team.';
        END IF;

        IF NEW.player_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1
                FROM team_memberships
                WHERE player_id = NEW.player_id
                  AND team_id = NEW.team_id
                  AND joined_at <= v_match_date
                  AND (left_at IS NULL OR left_at >= v_match_date)
            ) THEN
                RAISE EXCEPTION
                  'Player % was not an active member of team % at the match date (%).',
                  NEW.player_id, NEW.team_id, v_match_date;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_match_player_team
  BEFORE INSERT OR UPDATE ON match_player_stats
  FOR EACH ROW EXECUTE PROCEDURE public.check_match_player_team_and_membership();

-- 5. Match Insert & Update State Machine Protections
CREATE OR REPLACE FUNCTION public.enforce_match_rules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    v_is_admin := (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

    IF TG_OP = 'INSERT' THEN
        IF NOT v_is_admin THEN
            IF NOT has_role('CAPTAIN') THEN
                RAISE EXCEPTION 'Only captains or admins can create matches.';
            END IF;

            IF NEW.source != 'MANUAL' THEN
                RAISE EXCEPTION 'Captains can only create MANUAL matches.';
            END IF;

            IF NEW.fixture_id IS NULL THEN
                RAISE EXCEPTION
                  'Captains must provide a valid fixture_id for manual matches.';
            END IF;

            IF NEW.status != 'PENDING_REVIEW' THEN
                RAISE EXCEPTION
                  'New matches created by captains must have status PENDING_REVIEW.';
            END IF;

            IF NEW.submitted_by IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION
                  'submitted_by must match the current authenticated user.';
            END IF;

            IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
                RAISE EXCEPTION
                  'New manual matches cannot have approved_by or approved_at set.';
            END IF;
        ELSE
            IF NEW.status = 'APPROVED' THEN
                NEW.approved_by := auth.uid();
                NEW.approved_at := CURRENT_TIMESTAMP;
            END IF;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NOT v_is_admin THEN
            IF OLD.status != 'PENDING_REVIEW' THEN
                RAISE EXCEPTION
                  'Captains can only update PENDING_REVIEW matches.';
            END IF;

            IF OLD.id IS DISTINCT FROM NEW.id THEN
                RAISE EXCEPTION 'Match id is immutable.';
            END IF;

            IF OLD.status IS DISTINCT FROM NEW.status THEN
                RAISE EXCEPTION 'Only admins can change match status.';
            END IF;

            IF OLD.fixture_id IS DISTINCT FROM NEW.fixture_id OR
               OLD.season_id IS DISTINCT FROM NEW.season_id OR
               OLD.league_id IS DISTINCT FROM NEW.league_id OR
               OLD.home_team_id IS DISTINCT FROM NEW.home_team_id OR
               OLD.away_team_id IS DISTINCT FROM NEW.away_team_id OR
               OLD.source IS DISTINCT FROM NEW.source OR
               OLD.ea_match_id IS DISTINCT FROM NEW.ea_match_id OR
               OLD.submitted_by IS DISTINCT FROM NEW.submitted_by OR
               OLD.approved_by IS DISTINCT FROM NEW.approved_by OR
               OLD.approved_at IS DISTINCT FROM NEW.approved_at OR
               OLD.rejection_reason IS DISTINCT FROM NEW.rejection_reason OR
               OLD.is_stats_applied IS DISTINCT FROM NEW.is_stats_applied THEN
                RAISE EXCEPTION
                  'Captains can only update scores, played_at, screenshot_url, and notes.';
            END IF;
        ELSE
            IF NEW.status = 'APPROVED' AND OLD.status != 'APPROVED' THEN
                -- Only the actor performing the approval transition is recorded.
                NEW.approved_by := auth.uid();
                NEW.approved_at := CURRENT_TIMESTAMP;
            ELSIF NEW.status = 'APPROVED' AND OLD.status = 'APPROVED' THEN
                -- Approval identity/timestamp are immutable after approval.
                IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
                   OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
                    RAISE EXCEPTION 'approved_by and approved_at are immutable after approval.';
                END IF;
            ELSIF NEW.status != 'APPROVED' AND OLD.status = 'APPROVED' THEN
                NEW.approved_by := NULL;
                NEW.approved_at := NULL;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_match_rules
  BEFORE INSERT OR UPDATE ON matches
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_match_rules();

-- 6. Social Limits Trigger
CREATE OR REPLACE FUNCTION public.check_social_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_today DATE;
    v_current_count INT;
BEGIN
    v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::DATE;

    INSERT INTO daily_activity_counts (user_id, date, post_count, comment_count)
    VALUES (NEW.author_id, v_today, 0, 0)
    ON CONFLICT (user_id, date) DO NOTHING;

    IF TG_TABLE_NAME = 'posts' THEN
        SELECT post_count
        INTO v_current_count
        FROM daily_activity_counts
        WHERE user_id = NEW.author_id AND date = v_today
        FOR UPDATE;

        IF v_current_count >= 2 THEN
            RAISE EXCEPTION
              'Daily post limit (2) reached (Europe/Istanbul timezone).';
        END IF;

        UPDATE daily_activity_counts
        SET post_count = post_count + 1
        WHERE user_id = NEW.author_id AND date = v_today;

    ELSIF TG_TABLE_NAME = 'comments' THEN
        SELECT comment_count
        INTO v_current_count
        FROM daily_activity_counts
        WHERE user_id = NEW.author_id AND date = v_today
        FOR UPDATE;

        IF v_current_count >= 2 THEN
            RAISE EXCEPTION
              'Daily comment limit (2) reached (Europe/Istanbul timezone).';
        END IF;

        UPDATE daily_activity_counts
        SET comment_count = comment_count + 1
        WHERE user_id = NEW.author_id AND date = v_today;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_post_limit
  BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE PROCEDURE public.check_social_limit();

CREATE TRIGGER trg_check_comment_limit
  BEFORE INSERT ON comments
  FOR EACH ROW EXECUTE PROCEDURE public.check_social_limit();

-- 6B. Social author immutability
-- A moderator may moderate another user's post/comment, but cannot transfer
-- ownership of that content to another user.
CREATE OR REPLACE FUNCTION public.enforce_social_author_immutability()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF OLD.author_id IS DISTINCT FROM NEW.author_id
       AND NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
        RAISE EXCEPTION 'Content author_id is immutable.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_posts_author_immutable
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_social_author_immutability();

CREATE TRIGGER trg_comments_author_immutable
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_social_author_immutability();

-- 6C. Social moderation-field protection
CREATE OR REPLACE FUNCTION public.enforce_social_update_rules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_deleted <> false OR NEW.deleted_by IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
            IF NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN') OR has_role('MODERATOR')) THEN
                RAISE EXCEPTION 'Users cannot create pre-deleted content.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN') OR has_role('MODERATOR')) THEN
        IF OLD.is_deleted IS DISTINCT FROM NEW.is_deleted
           OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by
           OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
           OR OLD.delete_reason IS DISTINCT FROM NEW.delete_reason
           OR (TG_TABLE_NAME = 'comments' AND (
                OLD.post_id IS DISTINCT FROM NEW.post_id
                OR OLD.parent_comment_id IS DISTINCT FROM NEW.parent_comment_id
              )) THEN
            RAISE EXCEPTION 'Only moderators/admins can change moderation fields.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_posts_social_rules
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_social_update_rules();

CREATE TRIGGER trg_comments_social_rules
  BEFORE INSERT OR UPDATE ON comments
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_social_update_rules();

-- 6D. Reports are immutable except for moderation fields.
CREATE OR REPLACE FUNCTION public.enforce_report_integrity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
        IF OLD.reporter_id IS DISTINCT FROM NEW.reporter_id
           OR OLD.post_id IS DISTINCT FROM NEW.post_id
           OR OLD.comment_id IS DISTINCT FROM NEW.comment_id
           OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
            RAISE EXCEPTION 'Report identity fields are immutable.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_report_integrity
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_report_integrity();

-- 7. Stats Recalculation Core
CREATE OR REPLACE FUNCTION public.recalculate_season_stats(p_season_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    DELETE FROM team_season_stats WHERE season_id = p_season_id;
    DELETE FROM player_team_season_stats WHERE season_id = p_season_id;
    DELETE FROM player_season_stats WHERE season_id = p_season_id;

    INSERT INTO team_season_stats (
        team_id, league_id, season_id, matches_played, wins, draws, losses,
        goals_for, goals_against, points
    )
    SELECT
        team_id, league_id, season_id, COUNT(*),
        SUM(CASE WHEN is_win THEN 1 ELSE 0 END),
        SUM(CASE WHEN is_draw THEN 1 ELSE 0 END),
        SUM(CASE WHEN is_loss THEN 1 ELSE 0 END),
        SUM(goals_for),
        SUM(goals_against),
        SUM(
          CASE
            WHEN is_win THEN (SELECT win_points FROM seasons WHERE id = p_season_id)
            WHEN is_draw THEN (SELECT draw_points FROM seasons WHERE id = p_season_id)
            ELSE (SELECT loss_points FROM seasons WHERE id = p_season_id)
          END
        )
    FROM (
        SELECT
            home_team_id AS team_id, league_id, season_id,
            home_score > away_score AS is_win,
            home_score = away_score AS is_draw,
            home_score < away_score AS is_loss,
            home_score AS goals_for,
            away_score AS goals_against
        FROM matches
        WHERE season_id = p_season_id AND status = 'APPROVED'

        UNION ALL

        SELECT
            away_team_id AS team_id, league_id, season_id,
            away_score > home_score AS is_win,
            away_score = home_score AS is_draw,
            away_score < home_score AS is_loss,
            away_score AS goals_for,
            home_score AS goals_against
        FROM matches
        WHERE season_id = p_season_id AND status = 'APPROVED'
    ) AS m
    GROUP BY team_id, league_id, season_id;

    INSERT INTO player_team_season_stats (
        player_id, team_id, league_id, season_id, matches_played, goals, assists,
        rating_sum, rating_count, shots, passes_made, pass_attempts,
        tackles_made, tackle_attempts, saves, goals_conceded, cleansheets_gk,
        cleansheets_def, red_cards, mom_count
    )
    SELECT
        mps.player_id, mps.team_id, m.league_id, m.season_id,
        COUNT(*),
        SUM(mps.goals),
        SUM(mps.assists),
        SUM(COALESCE(mps.rating, 0)),
        SUM(CASE WHEN mps.rating IS NOT NULL THEN 1 ELSE 0 END),
        SUM(mps.shots),
        SUM(mps.passes_made),
        SUM(mps.pass_attempts),
        SUM(mps.tackles_made),
        SUM(mps.tackle_attempts),
        SUM(mps.saves),
        SUM(mps.goals_conceded),
        SUM(mps.cleansheets_gk),
        SUM(mps.cleansheets_def),
        SUM(mps.red_cards),
        SUM(CASE WHEN mps.is_mom THEN 1 ELSE 0 END)
    FROM match_player_stats mps
    JOIN matches m ON m.id = mps.match_id
    WHERE m.season_id = p_season_id
      AND m.status = 'APPROVED'
      AND mps.player_id IS NOT NULL
    GROUP BY mps.player_id, mps.team_id, m.league_id, m.season_id;

    INSERT INTO player_season_stats (
        player_id, season_id, matches_played, goals, assists, rating_sum,
        rating_count, shots, passes_made, pass_attempts, tackles_made,
        tackle_attempts, saves, goals_conceded, cleansheets_gk,
        cleansheets_def, red_cards, mom_count
    )
    SELECT
        player_id, season_id,
        SUM(matches_played), SUM(goals), SUM(assists), SUM(rating_sum),
        SUM(rating_count), SUM(shots), SUM(passes_made), SUM(pass_attempts),
        SUM(tackles_made), SUM(tackle_attempts), SUM(saves), SUM(goals_conceded),
        SUM(cleansheets_gk), SUM(cleansheets_def), SUM(red_cards), SUM(mom_count)
    FROM player_team_season_stats
    WHERE season_id = p_season_id
    GROUP BY player_id, season_id;
END;
$$;

-- 8. Matches Rebuild Trigger (Handles Cross-Season Changes)
CREATE OR REPLACE FUNCTION public.trigger_recalculate_stats()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_seasons UUID[] := '{}';
    i INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'APPROVED' THEN
            v_seasons := array_append(v_seasons, OLD.season_id);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'APPROVED' THEN
            v_seasons := array_append(v_seasons, OLD.season_id);
        END IF;

        IF NEW.status = 'APPROVED'
           AND NOT (NEW.season_id = ANY(v_seasons)) THEN
            v_seasons := array_append(v_seasons, NEW.season_id);
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.status = 'APPROVED' THEN
            v_seasons := array_append(v_seasons, NEW.season_id);
        END IF;
    END IF;

    IF array_length(v_seasons, 1) IS NOT NULL THEN
        FOR i IN 1 .. array_length(v_seasons, 1) LOOP
            PERFORM recalculate_season_stats(v_seasons[i]);
        END LOOP;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER trg_recalculate_on_match
  AFTER INSERT OR UPDATE OF status, home_score, away_score, season_id OR DELETE ON matches
  FOR EACH ROW EXECUTE PROCEDURE public.trigger_recalculate_stats();

-- 9. Match Player Stats Rebuild Trigger (Handles Cross-Season Changes)
CREATE OR REPLACE FUNCTION public.trigger_recalculate_stats_from_player_stats()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_old_match RECORD;
    v_new_match RECORD;
    v_seasons UUID[] := '{}';
    i INT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.match_id != NEW.match_id THEN
            SELECT * INTO v_old_match FROM matches WHERE id = OLD.match_id;
            SELECT * INTO v_new_match FROM matches WHERE id = NEW.match_id;

            IF v_old_match.status = 'APPROVED' THEN
                v_seasons := array_append(v_seasons, v_old_match.season_id);
            END IF;

            IF v_new_match.status = 'APPROVED'
               AND NOT (v_new_match.season_id = ANY(v_seasons)) THEN
                v_seasons := array_append(v_seasons, v_new_match.season_id);
            END IF;
        ELSE
            SELECT * INTO v_new_match FROM matches WHERE id = NEW.match_id;
            IF v_new_match.status = 'APPROVED' THEN
                v_seasons := array_append(v_seasons, v_new_match.season_id);
            END IF;
        END IF;

    ELSIF TG_OP = 'INSERT' THEN
        SELECT * INTO v_new_match FROM matches WHERE id = NEW.match_id;
        IF v_new_match.status = 'APPROVED' THEN
            v_seasons := array_append(v_seasons, v_new_match.season_id);
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        SELECT * INTO v_old_match FROM matches WHERE id = OLD.match_id;
        IF v_old_match.status = 'APPROVED' THEN
            v_seasons := array_append(v_seasons, v_old_match.season_id);
        END IF;
    END IF;

    IF array_length(v_seasons, 1) IS NOT NULL THEN
        FOR i IN 1 .. array_length(v_seasons, 1) LOOP
            PERFORM recalculate_season_stats(v_seasons[i]);
        END LOOP;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER trg_recalculate_on_player_stats
  AFTER INSERT OR UPDATE OR DELETE ON match_player_stats
  FOR EACH ROW EXECUTE PROCEDURE public.trigger_recalculate_stats_from_player_stats();

-- 10. Transfer Flow Logic Trigger
CREATE OR REPLACE FUNCTION public.enforce_transfer_flow()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.from_team_id IS NOT DISTINCT FROM NEW.to_team_id THEN
            RAISE EXCEPTION 'Source and target teams cannot be the same.';
        END IF;

        IF NEW.from_team_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1
                FROM team_memberships
                WHERE player_id = NEW.player_id
                  AND season_id = NEW.season_id
                  AND team_id = NEW.from_team_id
                  AND left_at IS NULL
            ) THEN
                RAISE EXCEPTION
                  'Player must be an active member of from_team_id in this season.';
            END IF;
        END IF;

        IF NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
            IF auth.uid() IS NOT NULL
               AND NEW.requested_by != auth.uid() THEN
                RAISE EXCEPTION 'requested_by must be current user';
            END IF;

            IF NEW.status != 'PENDING_PLAYER' THEN
                RAISE EXCEPTION 'New transfers must be PENDING_PLAYER';
            END IF;

            IF NEW.admin_id IS NOT NULL OR NEW.admin_acted_at IS NOT NULL THEN
                RAISE EXCEPTION 'Cannot set admin fields on insert';
            END IF;

            IF NEW.player_responded_at IS NOT NULL OR NEW.player_note IS NOT NULL THEN
                RAISE EXCEPTION 'Cannot set player response fields on insert';
            END IF;

            IF NEW.effective_at IS NOT NULL THEN
                RAISE EXCEPTION 'Cannot set effective_at on insert';
            END IF;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'APPROVED' AND OLD.status != 'APPROVED' THEN
            IF NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
                RAISE EXCEPTION 'Only ADMIN can manually approve transfers.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_transfer_flow
  BEFORE INSERT OR UPDATE ON transfers
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_transfer_flow();

-- APPROVED transfer transitions are deliberately performed by approve_transfer().
-- The RLS UPDATE policy in 009 blocks direct client-side APPROVED writes.
-- 11. Player Respond to Transfer
CREATE OR REPLACE FUNCTION public.respond_to_transfer(
    p_transfer_id UUID,
    p_accept BOOLEAN,
    p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_transfer RECORD;
BEGIN
    SELECT * INTO v_transfer
    FROM transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
    IF v_transfer.player_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF v_transfer.status != 'PENDING_PLAYER' THEN
        RAISE EXCEPTION 'Transfer is not pending player response';
    END IF;

    UPDATE transfers
    SET status = CASE
                   WHEN p_accept THEN 'PENDING_ADMIN'::transfer_status_enum
                   ELSE 'REJECTED'::transfer_status_enum
                 END,
        player_responded_at = CURRENT_TIMESTAMP,
        player_note = p_note
    WHERE id = p_transfer_id;
END;
$$;

-- 12. Atomic Transfer Approval (Secure Source Integrity with Deterministic Locking)
CREATE OR REPLACE FUNCTION public.approve_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_transfer RECORD;
    v_season RECORD;
    v_league_id UUID;
    v_count INT;
    v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();

    IF NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
        RAISE EXCEPTION 'Unauthorized: ADMIN required.';
    END IF;

    SELECT * INTO v_transfer
    FROM transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF NOT FOUND OR v_transfer.status != 'PENDING_ADMIN' THEN
        RAISE EXCEPTION 'Invalid transfer status.';
    END IF;

    IF v_transfer.from_team_id IS NOT DISTINCT FROM v_transfer.to_team_id THEN
        RAISE EXCEPTION 'Source and target teams cannot be the same.';
    END IF;

    SELECT * INTO v_season FROM seasons WHERE id = v_transfer.season_id;

    IF NOT EXISTS (
        SELECT 1
        FROM transfer_windows
        WHERE id = v_transfer.transfer_window_id AND is_open = true
    ) THEN
        RAISE EXCEPTION 'Window closed.';
    END IF;

    IF v_transfer.from_team_id IS NOT NULL THEN
        IF v_transfer.from_team_id < v_transfer.to_team_id THEN
            PERFORM 1
            FROM league_teams
            WHERE team_id = v_transfer.from_team_id
              AND season_id = v_transfer.season_id
            FOR UPDATE;

            IF NOT FOUND THEN RAISE EXCEPTION 'Source team not active.'; END IF;

            SELECT league_id INTO v_league_id
            FROM league_teams
            WHERE team_id = v_transfer.to_team_id
              AND season_id = v_transfer.season_id
            FOR UPDATE;

            IF NOT FOUND THEN RAISE EXCEPTION 'Target team not active.'; END IF;
        ELSE
            SELECT league_id INTO v_league_id
            FROM league_teams
            WHERE team_id = v_transfer.to_team_id
              AND season_id = v_transfer.season_id
            FOR UPDATE;

            IF NOT FOUND THEN RAISE EXCEPTION 'Target team not active.'; END IF;

            PERFORM 1
            FROM league_teams
            WHERE team_id = v_transfer.from_team_id
              AND season_id = v_transfer.season_id
            FOR UPDATE;

            IF NOT FOUND THEN RAISE EXCEPTION 'Source team not active.'; END IF;
        END IF;
    ELSE
        SELECT league_id INTO v_league_id
        FROM league_teams
        WHERE team_id = v_transfer.to_team_id
          AND season_id = v_transfer.season_id
        FOR UPDATE;

        IF NOT FOUND THEN RAISE EXCEPTION 'Target team not active.'; END IF;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM team_memberships
    WHERE team_id = v_transfer.to_team_id
      AND season_id = v_transfer.season_id
      AND left_at IS NULL;

    IF v_count >= v_season.roster_max THEN
        RAISE EXCEPTION 'Target roster max reached.';
    END IF;

    IF v_transfer.from_team_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM team_memberships
            WHERE player_id = v_transfer.player_id
              AND season_id = v_transfer.season_id
              AND team_id = v_transfer.from_team_id
              AND left_at IS NULL
            FOR UPDATE
        ) THEN
            RAISE EXCEPTION
              'Player is not an active member of the source team in this season.';
        END IF;

        SELECT COUNT(*) INTO v_count
        FROM team_memberships
        WHERE team_id = v_transfer.from_team_id
          AND season_id = v_transfer.season_id
          AND left_at IS NULL;

        IF v_count <= v_season.roster_min THEN
            RAISE EXCEPTION 'Source roster min reached.';
        END IF;

        UPDATE team_memberships
        SET left_at = CURRENT_TIMESTAMP
        WHERE player_id = v_transfer.player_id
          AND season_id = v_transfer.season_id
          AND team_id = v_transfer.from_team_id
          AND left_at IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM team_memberships
        WHERE player_id = v_transfer.player_id
          AND season_id = v_transfer.season_id
          AND left_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Player active elsewhere.';
    END IF;

    INSERT INTO team_memberships (
        player_id, team_id, league_id, season_id, joined_at
    )
    VALUES (
        v_transfer.player_id,
        v_transfer.to_team_id,
        v_league_id,
        v_transfer.season_id,
        CURRENT_TIMESTAMP
    );

    UPDATE transfers
    SET status = 'APPROVED',
        admin_id = v_admin_id,
        admin_acted_at = CURRENT_TIMESTAMP,
        effective_at = CURRENT_TIMESTAMP
    WHERE id = p_transfer_id;
END;
$$;

-- 13. Audit Log Trigger
CREATE OR REPLACE FUNCTION public.audit_log_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_old JSONB := NULL;
    v_new JSONB := NULL;
    v_entity_id UUID;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        v_entity_id := (v_new->>'id')::uuid;
    ELSIF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);
        v_entity_id := (v_new->>'id')::uuid;
    ELSIF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_entity_id := (v_old->>'id')::uuid;
    END IF;

    INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id, old_data, new_data
    )
    VALUES (
        auth.uid(), TG_OP, TG_TABLE_NAME, v_entity_id, v_old, v_new
    );

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER trg_audit_matches
  AFTER INSERT OR UPDATE OR DELETE ON matches
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_action();

CREATE TRIGGER trg_audit_transfers
  AFTER INSERT OR UPDATE OR DELETE ON transfers
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_action();

CREATE TRIGGER trg_audit_team_memberships
  AFTER INSERT OR UPDATE OR DELETE ON team_memberships
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_action();

CREATE TRIGGER trg_audit_seasons
  AFTER INSERT OR UPDATE OR DELETE ON seasons
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_action();

CREATE TRIGGER trg_audit_leagues
  AFTER INSERT OR UPDATE OR DELETE ON leagues
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_action();

CREATE TRIGGER trg_audit_teams
  AFTER INSERT OR UPDATE OR DELETE ON teams
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_action();

CREATE TRIGGER trg_audit_fixtures
  AFTER INSERT OR UPDATE OR DELETE ON fixtures
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_action();

CREATE TRIGGER trg_audit_posts
  AFTER INSERT OR UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_action();

CREATE TRIGGER trg_audit_comments
  AFTER INSERT OR UPDATE OR DELETE ON comments
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_action();

-- 14. Revoke Execute Permissions on Internal Trigger Functions
REVOKE EXECUTE ON FUNCTION public.recalculate_season_stats(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_log_action() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recalculate_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recalculate_stats_from_player_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_match_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_transfer_flow() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_match_player_team_and_membership() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_social_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_social_author_immutability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_social_update_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_report_integrity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_role_management() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_ea_id_history() FROM PUBLIC, anon, authenticated;

-- These two functions are application-invoked RPCs, not internal trigger functions.
-- authenticated needs execute permission for them.
GRANT EXECUTE ON FUNCTION public.respond_to_transfer(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_transfer(UUID) TO authenticated;

-- ============================================================
-- SECURITY: Transfer RPC functions must not be executable by PUBLIC
-- Only authenticated users may call these functions.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.respond_to_transfer(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_transfer(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.respond_to_transfer(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_transfer(UUID) TO authenticated;
