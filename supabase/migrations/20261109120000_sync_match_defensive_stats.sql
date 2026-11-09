-- ============================================================================
-- Migration: 20261109120000_sync_match_defensive_stats.sql
-- Purpose:
--   1. Automatically derive and sync cleansheets_gk, cleansheets_def, and
--      goals_conceded in match_player_stats (and match_team_report_players)
--      from the official match score (matches.home_score / away_score).
--   2. When a match score is updated (e.g. via Admin score edit), automatically
--      resync all player stats for that match before recalculating season stats.
--   3. Backfill all existing match_player_stats and match_team_report_players
--      rows and recalculate season stats.
-- ============================================================================

-- 1. Position helper functions
CREATE OR REPLACE FUNCTION public.is_gk_position(p_pos TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT UPPER(TRIM(SPLIT_PART(COALESCE(p_pos, ''), '(', 1))) IN (
    'GOALKEEPER', 'GK', 'KL', 'KALECI', 'KALECİ'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_def_position(p_pos TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT UPPER(TRIM(SPLIT_PART(COALESCE(p_pos, ''), '(', 1))) IN (
    'DEFENDER', 'DEF', 'DEFANS', 'CB', 'LB', 'RB', 'LWB', 'RWB',
    'STP', 'STOPER', 'SGB', 'SĞB', 'SAG BEK', 'SAĞ BEK',
    'SLB', 'SOL BEK', 'SGKB', 'SĞKB', 'SAG KANAT BEK', 'SAĞ KANAT BEK',
    'SLKB', 'SOL KANAT BEK'
  );
$$;

-- 1b. Allow internal defensive stats sync in check_match_player_team_and_membership
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

    v_is_admin := (
        has_role('ADMIN')
        OR has_role('SUPER_ADMIN')
        OR COALESCE(current_setting('app.in_sync_defensive_stats', true), '') = 'true'
    );

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

-- 2. Sync all match_player_stats rows for a given match_id with matches.home_score / away_score
CREATE OR REPLACE FUNCTION public.sync_match_player_defensive_stats(p_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
BEGIN
  SELECT id, home_team_id, away_team_id, home_score, away_score
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF v_match.id IS NULL OR v_match.home_score IS NULL OR v_match.away_score IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.in_sync_defensive_stats', 'true', true);

  UPDATE public.match_player_stats mps
  SET
    cleansheets_gk = CASE
      WHEN public.is_gk_position(mps.position) THEN
        CASE
          WHEN mps.team_id = v_match.home_team_id AND v_match.away_score = 0 THEN 1
          WHEN mps.team_id = v_match.away_team_id AND v_match.home_score = 0 THEN 1
          ELSE 0
        END
      ELSE 0
    END,
    cleansheets_def = CASE
      WHEN public.is_def_position(mps.position) THEN
        CASE
          WHEN mps.team_id = v_match.home_team_id AND v_match.away_score = 0 THEN 1
          WHEN mps.team_id = v_match.away_team_id AND v_match.home_score = 0 THEN 1
          ELSE 0
        END
      ELSE 0
    END,
    goals_conceded = CASE
      WHEN public.is_gk_position(mps.position) OR public.is_def_position(mps.position) OR mps.goals_conceded > 0 THEN
        CASE
          WHEN mps.team_id = v_match.home_team_id THEN v_match.away_score
          WHEN mps.team_id = v_match.away_team_id THEN v_match.home_score
          ELSE mps.goals_conceded
        END
      ELSE 0
    END,
    updated_at = now()
  WHERE mps.match_id = p_match_id
    AND mps.team_id IN (v_match.home_team_id, v_match.away_team_id)
    AND (
      mps.cleansheets_gk IS DISTINCT FROM (
        CASE
          WHEN public.is_gk_position(mps.position) THEN
            CASE
              WHEN mps.team_id = v_match.home_team_id AND v_match.away_score = 0 THEN 1
              WHEN mps.team_id = v_match.away_team_id AND v_match.home_score = 0 THEN 1
              ELSE 0
            END
          ELSE 0
        END
      )
      OR mps.cleansheets_def IS DISTINCT FROM (
        CASE
          WHEN public.is_def_position(mps.position) THEN
            CASE
              WHEN mps.team_id = v_match.home_team_id AND v_match.away_score = 0 THEN 1
              WHEN mps.team_id = v_match.away_team_id AND v_match.home_score = 0 THEN 1
              ELSE 0
            END
          ELSE 0
        END
      )
      OR mps.goals_conceded IS DISTINCT FROM (
        CASE
          WHEN public.is_gk_position(mps.position) OR public.is_def_position(mps.position) OR mps.goals_conceded > 0 THEN
            CASE
              WHEN mps.team_id = v_match.home_team_id THEN v_match.away_score
              WHEN mps.team_id = v_match.away_team_id THEN v_match.home_score
              ELSE mps.goals_conceded
            END
          ELSE 0
        END
      )
    );

  PERFORM set_config('app.in_sync_defensive_stats', 'false', true);
END;
$$;

-- 3. BEFORE INSERT OR UPDATE trigger on match_player_stats to enforce score-consistent defensive stats
CREATE OR REPLACE FUNCTION public.trg_fn_sync_mps_defensive_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_opp_score INT;
BEGIN
  SELECT id, home_team_id, away_team_id, home_score, away_score
  INTO v_match
  FROM public.matches
  WHERE id = NEW.match_id;

  IF v_match.id IS NOT NULL AND v_match.home_score IS NOT NULL AND v_match.away_score IS NOT NULL THEN
    IF NEW.team_id = v_match.home_team_id THEN
      v_opp_score := v_match.away_score;
    ELSIF NEW.team_id = v_match.away_team_id THEN
      v_opp_score := v_match.home_score;
    END IF;

    IF v_opp_score IS NOT NULL THEN
      IF public.is_gk_position(NEW.position) THEN
        NEW.cleansheets_gk := CASE WHEN v_opp_score = 0 THEN 1 ELSE 0 END;
        NEW.cleansheets_def := 0;
        NEW.goals_conceded := v_opp_score;
      ELSIF public.is_def_position(NEW.position) THEN
        NEW.cleansheets_gk := 0;
        NEW.cleansheets_def := CASE WHEN v_opp_score = 0 THEN 1 ELSE 0 END;
        NEW.goals_conceded := v_opp_score;
      ELSE
        NEW.cleansheets_gk := 0;
        NEW.cleansheets_def := 0;
        IF COALESCE(NEW.goals_conceded, 0) > 0 THEN
          NEW.goals_conceded := v_opp_score;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mps_defensive_stats ON public.match_player_stats;
CREATE TRIGGER trg_sync_mps_defensive_stats
  BEFORE INSERT OR UPDATE OF match_id, team_id, position, goals_conceded, cleansheets_gk, cleansheets_def
  ON public.match_player_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_mps_defensive_stats();

-- 4. BEFORE INSERT OR UPDATE trigger on match_team_report_players so captain reports also get consistent defensive stats
CREATE OR REPLACE FUNCTION public.trg_fn_sync_report_player_defensive_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report RECORD;
  v_fixture RECORD;
  v_opp_score INT;
BEGIN
  SELECT id, fixture_id, home_score, away_score
  INTO v_report
  FROM public.match_team_reports
  WHERE id = NEW.report_id;

  IF v_report.id IS NOT NULL AND v_report.fixture_id IS NOT NULL THEN
    SELECT id, home_team_id, away_team_id
    INTO v_fixture
    FROM public.fixtures
    WHERE id = v_report.fixture_id;

    IF v_fixture.id IS NOT NULL THEN
      IF NEW.team_id = v_fixture.home_team_id THEN
        v_opp_score := v_report.away_score;
      ELSIF NEW.team_id = v_fixture.away_team_id THEN
        v_opp_score := v_report.home_score;
      END IF;

      IF v_opp_score IS NOT NULL THEN
        IF public.is_gk_position(NEW.position) THEN
          NEW.cleansheets_gk := CASE WHEN v_opp_score = 0 THEN 1 ELSE 0 END;
          NEW.cleansheets_def := 0;
          NEW.goals_conceded := v_opp_score;
        ELSIF public.is_def_position(NEW.position) THEN
          NEW.cleansheets_gk := 0;
          NEW.cleansheets_def := CASE WHEN v_opp_score = 0 THEN 1 ELSE 0 END;
          NEW.goals_conceded := v_opp_score;
        ELSE
          NEW.cleansheets_gk := 0;
          NEW.cleansheets_def := 0;
          IF COALESCE(NEW.goals_conceded, 0) > 0 THEN
            NEW.goals_conceded := v_opp_score;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_report_player_defensive_stats ON public.match_team_report_players;
CREATE TRIGGER trg_sync_report_player_defensive_stats
  BEFORE INSERT OR UPDATE OF report_id, team_id, position, goals_conceded, cleansheets_gk, cleansheets_def
  ON public.match_team_report_players
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_report_player_defensive_stats();

-- 5. Update trigger_recalculate_stats on matches so score updates automatically sync match_player_stats
CREATE OR REPLACE FUNCTION public.trigger_recalculate_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seasons UUID[] := '{}';
    i INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'APPROVED' THEN
            v_seasons := array_append(v_seasons, OLD.season_id);
            
            IF OLD.fixture_id IS NOT NULL THEN
                UPDATE fixtures SET status = 'SCHEDULED' WHERE id = OLD.fixture_id;
            END IF;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Whenever score or status changes on a match, sync its player defensive stats first
        IF OLD.home_score IS DISTINCT FROM NEW.home_score
           OR OLD.away_score IS DISTINCT FROM NEW.away_score
           OR OLD.status IS DISTINCT FROM NEW.status THEN
            PERFORM public.sync_match_player_defensive_stats(NEW.id);
        END IF;

        IF OLD.status = 'APPROVED' THEN
            v_seasons := array_append(v_seasons, OLD.season_id);
        END IF;

        IF NEW.status = 'APPROVED'
           AND NOT (NEW.season_id = ANY(v_seasons)) THEN
            v_seasons := array_append(v_seasons, NEW.season_id);
        END IF;
        
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

-- 6. Backfill all existing matches, report players, and recalculate season stats
DO $$
DECLARE
  r_match RECORD;
  r_season RECORD;
BEGIN
  -- Sync all existing match_player_stats rows against their parent match scores
  FOR r_match IN SELECT id FROM public.matches LOOP
    PERFORM public.sync_match_player_defensive_stats(r_match.id);
  END LOOP;

  -- Touch pending match_team_report_players so the BEFORE UPDATE trigger normalizes any pending report players
  UPDATE public.match_team_report_players rp
  SET position = rp.position
  FROM public.match_team_reports r
  WHERE r.id = rp.report_id
    AND r.status = 'PENDING_REVIEW';

  -- Recalculate season stats for all seasons
  FOR r_season IN SELECT id FROM public.seasons LOOP
    PERFORM public.recalculate_season_stats(r_season.id);
  END LOOP;
END;
$$;
