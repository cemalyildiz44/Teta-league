-- 000011_match_hardening.sql

-- 1. UPDATE enforce_match_rules
-- Modifies the match rules to revert is_stats_applied when a match is no longer approved.
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
                NEW.is_stats_applied := false; -- NEW: Reset stats applied flag
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


-- 2. UPDATE trigger_recalculate_stats
-- Modifies the trigger to also sync fixture status when a match is approved or reverted.
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
            
            -- NEW: Sync Fixture Status
            IF OLD.fixture_id IS NOT NULL THEN
                UPDATE fixtures SET status = 'SCHEDULED' WHERE id = OLD.fixture_id;
            END IF;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'APPROVED' THEN
            v_seasons := array_append(v_seasons, OLD.season_id);
        END IF;

        IF NEW.status = 'APPROVED'
           AND NOT (NEW.season_id = ANY(v_seasons)) THEN
            v_seasons := array_append(v_seasons, NEW.season_id);
        END IF;
        
        -- NEW: Sync Fixture Status
        IF NEW.status = 'APPROVED' AND OLD.status != 'APPROVED' THEN
            IF NEW.fixture_id IS NOT NULL THEN
                UPDATE fixtures SET status = 'COMPLETED' WHERE id = NEW.fixture_id;
            END IF;
        ELSIF NEW.status != 'APPROVED' AND OLD.status = 'APPROVED' THEN
            IF NEW.fixture_id IS NOT NULL THEN
                UPDATE fixtures SET status = 'SCHEDULED' WHERE id = NEW.fixture_id;
            END IF;
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.status = 'APPROVED' THEN
            v_seasons := array_append(v_seasons, NEW.season_id);
            
            -- NEW: Sync Fixture Status
            IF NEW.fixture_id IS NOT NULL THEN
                UPDATE fixtures SET status = 'COMPLETED' WHERE id = NEW.fixture_id;
            END IF;
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


-- 3. UPDATE recalculate_season_stats
-- Modifies the recalculation logic to set matches.is_stats_applied to true upon successful completion.
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

    -- NEW: Mark matches as stats applied
    UPDATE matches
    SET is_stats_applied = true
    WHERE season_id = p_season_id
      AND status = 'APPROVED'
      AND is_stats_applied = false;
END;
$$;
