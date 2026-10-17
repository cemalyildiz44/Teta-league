-- Weekly match-results import (teta.weekly-matches v1): import history + atomic apply RPC.
-- NOT applied automatically. Review before running. Rollback: docs/rollback/rollback_weekly_match_import.sql
-- Depends on 20261017120000_fixture_weekly_import.sql only for the shared advisory-lock key (no table dependency).
--
-- Matches are created as source AUTO + status PENDING_REVIEW and are NEVER approved here: the existing admin review
-- flow (reviewMatchAction -> triggers -> recalculate_season_stats) stays the only way to approve.

CREATE TABLE IF NOT EXISTS public.match_import_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
    league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE RESTRICT,
    week_number INTEGER NOT NULL CHECK (week_number >= 1),
    export_id TEXT NOT NULL,
    checksum TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    file_name TEXT,
    file_generated_at TIMESTAMPTZ,
    source_fixtures_checksum TEXT,
    result TEXT NOT NULL CHECK (result IN ('APPLIED', 'REJECTED')),
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_match_import_history_scope
    ON public.match_import_history (league_id, week_number, created_at DESC);
-- The same content can be successfully applied to a league/week only once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_import_applied
    ON public.match_import_history (league_id, week_number, checksum) WHERE result = 'APPLIED';

ALTER TABLE public.match_import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read match_import_history"
  ON public.match_import_history FOR SELECT TO authenticated
  USING (public.has_role('ADMIN') OR public.has_role('SUPER_ADMIN'));

CREATE POLICY "Admin insert match_import_history"
  ON public.match_import_history FOR INSERT TO authenticated
  WITH CHECK ((public.has_role('ADMIN') OR public.has_role('SUPER_ADMIN')) AND actor_id = auth.uid());

-- History is append-only: no UPDATE / DELETE policies, and no table privileges either.
REVOKE ALL ON public.match_import_history FROM anon, PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON public.match_import_history FROM authenticated;
GRANT SELECT, INSERT ON public.match_import_history TO authenticated;

-- Atomic apply. SECURITY INVOKER: every statement runs under the caller's RLS ("Admin full matches",
-- "Admin full match_player_stats"), so this adds no privilege. One call = one transaction; any RAISE rolls back
-- every file in the batch. The server re-validates everything; this function re-checks the invariants that must
-- hold at write time (fixture state, teams, uniqueness, window) so a concurrent change cannot slip through.
CREATE OR REPLACE FUNCTION public.apply_weekly_match_imports(p_files jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    f JSONB;
    m JSONB;
    pl JSONB;
    v_season UUID;
    v_league UUID;
    v_week INTEGER;
    v_gen TIMESTAMPTZ;
    v_fix public.fixtures%ROWTYPE;
    v_match_id UUID;
    v_played TIMESTAMPTZ;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_player UUID;
    v_team UUID;
    v_files INTEGER := 0;
    v_matches INTEGER := 0;
BEGIN
    IF v_actor IS NULL OR NOT (public.has_role('ADMIN') OR public.has_role('SUPER_ADMIN')) THEN
        RAISE EXCEPTION 'FORBIDDEN: admin role required' USING ERRCODE = '42501';
    END IF;
    IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' OR jsonb_array_length(p_files) = 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: p_files must be a non-empty array';
    END IF;

    -- Same lock key as apply_fixture_week_imports: a fixture import and a match import of the same
    -- league/week serialise (deterministic order => no deadlocks).
    FOR f IN
        SELECT value FROM jsonb_array_elements(p_files)
        ORDER BY value->>'league_id', (value->>'week_number')::int
    LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended((f->>'league_id') || ':' || (f->>'week_number'), 0));
    END LOOP;

    FOR f IN SELECT value FROM jsonb_array_elements(p_files) LOOP
        v_season := (f->>'season_id')::uuid;
        v_league := (f->>'league_id')::uuid;
        v_week   := (f->>'week_number')::int;
        v_gen    := (f->>'generated_at')::timestamptz;

        IF NOT EXISTS (SELECT 1 FROM public.leagues WHERE id = v_league AND season_id = v_season) THEN
            RAISE EXCEPTION 'SCOPE_MISMATCH: league % does not belong to season %', v_league, v_season;
        END IF;
        IF EXISTS (SELECT 1 FROM public.match_import_history
                   WHERE league_id = v_league AND week_number = v_week
                     AND checksum = f->>'checksum' AND result = 'APPLIED') THEN
            RAISE EXCEPTION 'ALREADY_APPLIED: file % was already applied', f->>'file_name';
        END IF;
        IF EXISTS (SELECT 1 FROM public.match_import_history
                   WHERE league_id = v_league AND week_number = v_week
                     AND result = 'APPLIED' AND file_generated_at > v_gen) THEN
            RAISE EXCEPTION 'STALE_FILE: a newer export was already applied for week % (%)', v_week, f->>'file_name';
        END IF;
        IF jsonb_typeof(f->'matches') <> 'array' OR jsonb_array_length(f->'matches') = 0 THEN
            RAISE EXCEPTION 'INVALID_PAYLOAD: file % has no matches', f->>'file_name';
        END IF;

        FOR m IN SELECT value FROM jsonb_array_elements(f->'matches') LOOP
            SELECT * INTO v_fix FROM public.fixtures WHERE id = (m->>'fixture_id')::uuid FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'FIXTURE_NOT_FOUND: %', m->>'fixture_id';
            END IF;
            IF v_fix.season_id <> v_season OR v_fix.league_id <> v_league OR v_fix.week_number <> v_week THEN
                RAISE EXCEPTION 'SCOPE_MISMATCH: fixture % is outside file scope', v_fix.id;
            END IF;
            IF v_fix.status <> 'SCHEDULED' THEN
                RAISE EXCEPTION 'FIXTURE_NOT_SCHEDULED: fixture % is %', v_fix.id, v_fix.status;
            END IF;
            IF date_trunc('milliseconds', v_fix.updated_at)
               <> date_trunc('milliseconds', (m->>'expected_fixture_updated_at')::timestamptz) THEN
                RAISE EXCEPTION 'STALE_FIXTURE: fixture % changed after the plan was made', v_fix.id;
            END IF;
            IF v_fix.home_team_id <> (m->>'home_team_id')::uuid OR v_fix.away_team_id <> (m->>'away_team_id')::uuid THEN
                RAISE EXCEPTION 'TEAM_MISMATCH: fixture % teams differ from the file', v_fix.id;
            END IF;
            IF EXISTS (SELECT 1 FROM public.matches WHERE fixture_id = v_fix.id) THEN
                RAISE EXCEPTION 'FIXTURE_HAS_MATCH: fixture % already has a match', v_fix.id;
            END IF;
            IF m->>'ea_match_id' !~ '^[1-9][0-9]{0,23}$' THEN
                RAISE EXCEPTION 'INVALID_PAYLOAD: bad ea_match_id %', m->>'ea_match_id';
            END IF;
            IF EXISTS (SELECT 1 FROM public.matches WHERE ea_match_id = m->>'ea_match_id') THEN
                RAISE EXCEPTION 'EA_MATCH_ALREADY_USED: %', m->>'ea_match_id';
            END IF;
            IF (m->>'home_score')::int NOT BETWEEN 0 AND 99 OR (m->>'away_score')::int NOT BETWEEN 0 AND 99 THEN
                RAISE EXCEPTION 'INVALID_PAYLOAD: score out of range for fixture %', v_fix.id;
            END IF;

            -- EA match night window of the fixture's UTC day: [17:00, 23:00) UTC (same rule as lib/ea/matcher.ts)
            v_played := (m->>'played_at')::timestamptz;
            v_start := (date_trunc('day', v_fix.scheduled_at AT TIME ZONE 'UTC') + interval '17 hours') AT TIME ZONE 'UTC';
            v_end   := (date_trunc('day', v_fix.scheduled_at AT TIME ZONE 'UTC') + interval '23 hours') AT TIME ZONE 'UTC';
            IF NOT (v_played >= v_start AND v_played < v_end)
               AND NOT COALESCE((m->>'out_of_window_accepted')::boolean, false) THEN
                RAISE EXCEPTION 'OUT_OF_WINDOW: match % is outside the EA window of fixture %', m->>'ea_match_id', v_fix.id;
            END IF;

            INSERT INTO public.matches
                (fixture_id, season_id, league_id, home_team_id, away_team_id, home_score, away_score,
                 source, status, ea_match_id, played_at, submitted_by)
            VALUES
                (v_fix.id, v_season, v_league, v_fix.home_team_id, v_fix.away_team_id,
                 (m->>'home_score')::int, (m->>'away_score')::int,
                 'AUTO', 'PENDING_REVIEW', m->>'ea_match_id', v_played, v_actor)
            RETURNING id INTO v_match_id;

            FOR pl IN SELECT value FROM jsonb_array_elements(m->'players') LOOP
                v_team := (pl->>'team_id')::uuid;
                IF v_team <> v_fix.home_team_id AND v_team <> v_fix.away_team_id THEN
                    RAISE EXCEPTION 'TEAM_MISMATCH: player team % is not a team of fixture %', v_team, v_fix.id;
                END IF;
                v_player := NULLIF(pl->>'player_id', '')::uuid;
                IF v_player IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_player) THEN
                    RAISE EXCEPTION 'PLAYER_NOT_FOUND: %', v_player;
                END IF;
                INSERT INTO public.match_player_stats
                    (match_id, player_id, ea_player_id, ea_player_name, team_id, position,
                     goals, assists, rating, shots, passes_made, pass_attempts, tackles_made, tackle_attempts,
                     saves, goals_conceded, cleansheets_gk, cleansheets_def, red_cards, is_mom, extra_stats)
                VALUES
                    (v_match_id, v_player, pl->>'ea_player_id', pl->>'ea_player_name', v_team, pl->>'position',
                     (pl->>'goals')::int, (pl->>'assists')::int, NULLIF(pl->>'rating', '')::numeric,
                     (pl->>'shots')::int, (pl->>'passes_made')::int, (pl->>'pass_attempts')::int,
                     (pl->>'tackles_made')::int, (pl->>'tackle_attempts')::int, (pl->>'saves')::int,
                     (pl->>'goals_conceded')::int, (pl->>'cleansheets_gk')::int, (pl->>'cleansheets_def')::int,
                     (pl->>'red_cards')::int, COALESCE((pl->>'is_mom')::boolean, false),
                     COALESCE(pl->'extra_stats', '{}'::jsonb));
            END LOOP;
            v_matches := v_matches + 1;
        END LOOP;

        INSERT INTO public.match_import_history
            (actor_id, season_id, league_id, week_number, export_id, checksum, schema_version,
             file_name, file_generated_at, source_fixtures_checksum, result, summary, decisions)
        VALUES
            (v_actor, v_season, v_league, v_week, f->>'export_id', f->>'checksum', (f->>'schema_version')::int,
             f->>'file_name', v_gen, f->>'source_fixtures_checksum', 'APPLIED',
             COALESCE(f->'summary', '{}'::jsonb), COALESCE(f->'decisions', '[]'::jsonb));

        v_files := v_files + 1;
    END LOOP;

    RETURN jsonb_build_object('files', v_files, 'matches', v_matches);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_weekly_match_imports(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_weekly_match_imports(jsonb) TO authenticated;
