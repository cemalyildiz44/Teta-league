-- ==============================================================================
-- Migration: 20261112120000_team_replacement.sql
-- Description: Mid-season team replacement (Admin > Takımlar > Takım Değişimi)
--
-- A team that withdraws (X) is replaced by a team that joins (Y):
--   * X's league_teams row is deactivated and points to Y (replaced_by_team_id).
--   * Y gets its own league_teams row pointing back to X (replaces_team_id).
--   * X's unplayed fixtures move to Y; played matches stay under X.
--   * In the league table Y carries X's results: recalculate_season_stats counts
--     X's approved matches in that league for X and for Y. All-time rankings and
--     player careers read matches by team id, so they stay with X.
--   * X's active roster is released and its captain role is revoked.
-- Transfer slots/quotas are not touched.
-- ==============================================================================

-- 1. Replacement links on league_teams
ALTER TABLE public.league_teams
    ADD COLUMN IF NOT EXISTS replaces_team_id UUID REFERENCES public.teams(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS replaced_by_team_id UUID REFERENCES public.teams(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMPTZ;

-- 2. Stats rebuild: identical to the live definition except that a replaced team's
--    approved matches are also credited to its successor(s) in the same league/season.
CREATE OR REPLACE FUNCTION public.recalculate_season_stats(p_season_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    DELETE FROM team_season_stats WHERE season_id = p_season_id;
    DELETE FROM player_team_season_stats WHERE season_id = p_season_id;
    DELETE FROM player_season_stats WHERE season_id = p_season_id;

    INSERT INTO team_season_stats (
        team_id, league_id, season_id, matches_played, wins, draws, losses,
        goals_for, goals_against, points
    )
    WITH RECURSIVE sides AS (
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
    ),
    -- Each replaced team's successors (a successor that is itself replaced passes the results on)
    successors AS (
        SELECT team_id AS original_team_id, league_id, replaced_by_team_id AS successor_team_id
        FROM league_teams
        WHERE season_id = p_season_id AND replaced_by_team_id IS NOT NULL

        UNION

        SELECT s.original_team_id, s.league_id, lt.replaced_by_team_id
        FROM successors s
        JOIN league_teams lt
          ON lt.team_id = s.successor_team_id
         AND lt.league_id = s.league_id
         AND lt.season_id = p_season_id
        WHERE lt.replaced_by_team_id IS NOT NULL
    ),
    m AS (
        SELECT * FROM sides

        UNION ALL

        SELECT
            su.successor_team_id, sd.league_id, sd.season_id,
            sd.is_win, sd.is_draw, sd.is_loss, sd.goals_for, sd.goals_against
        FROM sides sd
        JOIN successors su
          ON su.original_team_id = sd.team_id
         AND su.league_id = sd.league_id
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
    FROM m
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
$function$;

-- 3. admin_replace_team: preview (p_apply = false) or perform the replacement in one transaction.
--    Returns a JSON summary; `blockers` lists reasons the replacement cannot run.
CREATE OR REPLACE FUNCTION public.admin_replace_team(
    p_league_id UUID,
    p_withdrawing_team_id UUID,
    p_entering_team_id UUID,
    p_apply BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_season_id UUID;
    v_out_row league_teams%ROWTYPE;
    v_blockers TEXT[] := '{}';
    v_fixture_ids UUID[];
    v_fixture_weeks INT[];
    v_released INT := 0;
    v_cancelled_transfers INT := 0;
    v_unlinked_matches INT := 0;
    v_pending INT;
    v_stats JSONB;
    v_entering_name TEXT;
BEGIN
    IF NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
        RAISE EXCEPTION 'Unauthorized: ADMIN required.';
    END IF;

    SELECT season_id INTO v_season_id FROM leagues WHERE id = p_league_id;
    IF v_season_id IS NULL THEN
        RAISE EXCEPTION 'Lig bulunamadı.';
    END IF;

    IF p_withdrawing_team_id = p_entering_team_id THEN
        RAISE EXCEPTION 'Çekilen ve giren takım aynı olamaz.';
    END IF;

    SELECT * INTO v_out_row
    FROM league_teams
    WHERE league_id = p_league_id AND season_id = v_season_id AND team_id = p_withdrawing_team_id
    FOR UPDATE;

    IF NOT FOUND OR NOT v_out_row.is_active THEN
        v_blockers := array_append(v_blockers, 'Çekilen takım bu ligde aktif değil.');
    END IF;

    SELECT name INTO v_entering_name FROM teams WHERE id = p_entering_team_id AND is_active = true;
    IF v_entering_name IS NULL THEN
        v_blockers := array_append(v_blockers, 'Giren takım bulunamadı veya pasif.');
    END IF;

    IF EXISTS (SELECT 1 FROM league_teams WHERE team_id = p_entering_team_id AND season_id = v_season_id) THEN
        v_blockers := array_append(v_blockers, 'Giren takım bu sezon zaten bir ligde kayıtlı.');
    END IF;

    SELECT COUNT(*) INTO v_pending
    FROM matches
    WHERE league_id = p_league_id AND season_id = v_season_id AND status = 'PENDING_REVIEW'
      AND (home_team_id = p_withdrawing_team_id OR away_team_id = p_withdrawing_team_id);
    IF v_pending > 0 THEN
        v_blockers := array_append(v_blockers, format('Çekilen takımın incelemede bekleyen %s maçı var.', v_pending));
    END IF;

    SELECT COUNT(*) INTO v_pending
    FROM match_team_reports r
    JOIN fixtures f ON f.id = r.fixture_id
    WHERE f.league_id = p_league_id AND f.season_id = v_season_id AND r.status = 'PENDING_REVIEW'
      AND (f.home_team_id = p_withdrawing_team_id OR f.away_team_id = p_withdrawing_team_id);
    IF v_pending > 0 THEN
        v_blockers := array_append(v_blockers, format('Çekilen takımın fikstürlerinde incelemede bekleyen %s skor bildirimi var.', v_pending));
    END IF;

    -- Fixtures that move: no approved or pending match linked to them
    SELECT COALESCE(array_agg(f.id ORDER BY f.week_number), '{}'), COALESCE(array_agg(f.week_number ORDER BY f.week_number), '{}')
    INTO v_fixture_ids, v_fixture_weeks
    FROM fixtures f
    WHERE f.league_id = p_league_id AND f.season_id = v_season_id
      AND (f.home_team_id = p_withdrawing_team_id OR f.away_team_id = p_withdrawing_team_id)
      AND NOT EXISTS (
          SELECT 1 FROM matches m WHERE m.fixture_id = f.id AND m.status IN ('APPROVED', 'PENDING_REVIEW')
      );

    SELECT COALESCE(jsonb_build_object(
        'matches_played', matches_played, 'wins', wins, 'draws', draws, 'losses', losses,
        'goals_for', goals_for, 'goals_against', goals_against, 'points', points
    ), '{}'::jsonb) INTO v_stats
    FROM team_season_stats
    WHERE team_id = p_withdrawing_team_id AND league_id = p_league_id AND season_id = v_season_id;

    SELECT COUNT(*) INTO v_released
    FROM team_memberships
    WHERE team_id = p_withdrawing_team_id AND season_id = v_season_id AND left_at IS NULL;

    IF NOT p_apply OR array_length(v_blockers, 1) IS NOT NULL THEN
        RETURN jsonb_build_object(
            'applied', false,
            'blockers', to_jsonb(v_blockers),
            'fixture_count', COALESCE(array_length(v_fixture_ids, 1), 0),
            'fixture_weeks', to_jsonb(v_fixture_weeks),
            'released_players', v_released,
            'carried_stats', COALESCE(v_stats, '{}'::jsonb)
        );
    END IF;

    -- Entering team joins the league in the withdrawing team's place (no max_teams check)
    INSERT INTO league_teams (league_id, season_id, team_id, is_active, replaces_team_id)
    VALUES (p_league_id, v_season_id, p_entering_team_id, true, p_withdrawing_team_id);

    -- Rejected matches keep their record but stop occupying a fixture that moves
    UPDATE matches
    SET fixture_id = NULL
    WHERE fixture_id = ANY(v_fixture_ids) AND status = 'REJECTED';
    GET DIAGNOSTICS v_unlinked_matches = ROW_COUNT;

    UPDATE fixtures
    SET home_team_id = CASE WHEN home_team_id = p_withdrawing_team_id THEN p_entering_team_id ELSE home_team_id END,
        away_team_id = CASE WHEN away_team_id = p_withdrawing_team_id THEN p_entering_team_id ELSE away_team_id END,
        status = CASE WHEN status = 'COMPLETED' THEN 'SCHEDULED'::fixture_status_enum ELSE status END,
        updated_at = now()
    WHERE id = ANY(v_fixture_ids);

    -- Release the withdrawing team's roster and close its open offers
    UPDATE team_memberships
    SET left_at = now()
    WHERE team_id = p_withdrawing_team_id AND season_id = v_season_id AND left_at IS NULL;

    UPDATE transfers
    SET status = 'CANCELLED', updated_at = now()
    WHERE season_id = v_season_id
      AND status IN ('PENDING_PLAYER', 'PENDING_ADMIN')
      AND (to_team_id = p_withdrawing_team_id OR from_team_id = p_withdrawing_team_id);
    GET DIAGNOSTICS v_cancelled_transfers = ROW_COUNT;

    UPDATE user_roles
    SET is_active = false, revoked_at = now()
    WHERE team_id = p_withdrawing_team_id AND role = 'CAPTAIN' AND is_active = true;

    UPDATE league_teams
    SET is_active = false, captain_id = NULL, replaced_by_team_id = p_entering_team_id, replaced_at = now()
    WHERE id = v_out_row.id;

    PERFORM recalculate_season_stats(v_season_id);

    RETURN jsonb_build_object(
        'applied', true,
        'blockers', '[]'::jsonb,
        'fixture_count', COALESCE(array_length(v_fixture_ids, 1), 0),
        'fixture_weeks', to_jsonb(v_fixture_weeks),
        'released_players', v_released,
        'cancelled_transfers', v_cancelled_transfers,
        'unlinked_rejected_matches', v_unlinked_matches,
        'carried_stats', COALESCE(v_stats, '{}'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_replace_team(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_replace_team(UUID, UUID, UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_replace_team(UUID, UUID, UUID, BOOLEAN) TO authenticated;
