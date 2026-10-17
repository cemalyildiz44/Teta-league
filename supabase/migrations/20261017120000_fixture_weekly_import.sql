-- Weekly fixture import (teta.fixtures v2): transfer history + atomic apply RPC.
-- NOT applied automatically. Review before running. Rollback: docs/rollback/rollback_fixture_weekly_import.sql

CREATE TABLE IF NOT EXISTS public.fixture_import_history (
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
    source_revision TIMESTAMPTZ,
    result TEXT NOT NULL CHECK (result IN ('APPLIED', 'REJECTED')),
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_fixture_import_history_scope
    ON public.fixture_import_history (league_id, week_number, created_at DESC);
-- The same content can be successfully applied to a scope only once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixture_import_applied
    ON public.fixture_import_history (league_id, week_number, checksum) WHERE result = 'APPLIED';

ALTER TABLE public.fixture_import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read fixture_import_history"
  ON public.fixture_import_history FOR SELECT TO authenticated
  USING (public.has_role('ADMIN') OR public.has_role('SUPER_ADMIN'));

CREATE POLICY "Admin insert fixture_import_history"
  ON public.fixture_import_history FOR INSERT TO authenticated
  WITH CHECK ((public.has_role('ADMIN') OR public.has_role('SUPER_ADMIN')) AND actor_id = auth.uid());

-- History is append-only: no UPDATE / DELETE policies, and no table privileges either.
REVOKE ALL ON public.fixture_import_history FROM anon, PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON public.fixture_import_history FROM authenticated;
GRANT SELECT, INSERT ON public.fixture_import_history TO authenticated;

-- Atomic apply. SECURITY INVOKER: every statement runs under the caller's RLS
-- ("Admin full fixtures"), so this adds no privilege. One call = one transaction;
-- any RAISE rolls back every file in the batch.
CREATE OR REPLACE FUNCTION public.apply_fixture_week_imports(p_files jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    f JSONB;
    o JSONB;
    v_season UUID;
    v_league UUID;
    v_week INTEGER;
    v_gen TIMESTAMPTZ;
    v_fix public.fixtures%ROWTYPE;
    v_played BOOLEAN;
    v_vals JSONB;
    v_applied INTEGER := 0;
BEGIN
    IF v_actor IS NULL OR NOT (public.has_role('ADMIN') OR public.has_role('SUPER_ADMIN')) THEN
        RAISE EXCEPTION 'FORBIDDEN: admin role required' USING ERRCODE = '42501';
    END IF;
    IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' OR jsonb_array_length(p_files) = 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: p_files must be a non-empty array';
    END IF;

    -- Serialise concurrent imports of the same league/week (deterministic order => no deadlocks).
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

        IF EXISTS (SELECT 1 FROM public.fixture_import_history
                   WHERE league_id = v_league AND week_number = v_week
                     AND checksum = f->>'checksum' AND result = 'APPLIED') THEN
            RAISE EXCEPTION 'ALREADY_APPLIED: file % was already applied', f->>'file_name';
        END IF;
        IF EXISTS (SELECT 1 FROM public.fixture_import_history
                   WHERE league_id = v_league AND week_number = v_week
                     AND result = 'APPLIED' AND file_generated_at > v_gen) THEN
            RAISE EXCEPTION 'STALE_FILE: a newer export was already applied for week % (%)', v_week, f->>'file_name';
        END IF;

        FOR o IN SELECT value FROM jsonb_array_elements(f->'ops') LOOP
            v_vals := o->'values';

            IF o->>'op' = 'insert' THEN
                IF (v_vals->>'season_id')::uuid <> v_season OR (v_vals->>'league_id')::uuid <> v_league
                   OR (v_vals->>'week_number')::int <> v_week THEN
                    RAISE EXCEPTION 'SCOPE_MISMATCH: insert % outside file scope', o->>'id';
                END IF;
                IF v_vals->>'status' IN ('COMPLETED', 'FORFEITED') THEN
                    RAISE EXCEPTION 'INVALID_STATUS: new fixture % cannot be %', o->>'id', v_vals->>'status';
                END IF;
                INSERT INTO public.fixtures
                    (id, season_id, league_id, week_number, home_team_id, away_team_id, scheduled_at, status, notes, created_by)
                VALUES
                    ((o->>'id')::uuid, v_season, v_league, v_week,
                     (v_vals->>'home_team_id')::uuid, (v_vals->>'away_team_id')::uuid,
                     (v_vals->>'scheduled_at')::timestamptz, (v_vals->>'status')::public.fixture_status_enum,
                     v_vals->>'notes', v_actor);

            ELSIF o->>'op' IN ('update', 'cancel') THEN
                SELECT * INTO v_fix FROM public.fixtures WHERE id = (o->>'id')::uuid FOR UPDATE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'FIXTURE_NOT_FOUND: %', o->>'id';
                END IF;
                IF v_fix.season_id <> v_season OR v_fix.league_id <> v_league OR v_fix.week_number <> v_week THEN
                    RAISE EXCEPTION 'SCOPE_MISMATCH: fixture % is outside file scope', o->>'id';
                END IF;
                IF date_trunc('milliseconds', v_fix.updated_at)
                   <> date_trunc('milliseconds', (o->>'expectedUpdatedAt')::timestamptz) THEN
                    RAISE EXCEPTION 'STALE_FIXTURE: fixture % changed after preview', o->>'id';
                END IF;

                v_played := v_fix.status IN ('COMPLETED', 'FORFEITED')
                            OR EXISTS (SELECT 1 FROM public.matches WHERE fixture_id = v_fix.id);

                IF o->>'op' = 'cancel' THEN
                    IF v_played THEN
                        RAISE EXCEPTION 'PLAYED_FIXTURE: fixture % has a result and cannot be cancelled', o->>'id';
                    END IF;
                    UPDATE public.fixtures
                       SET status = 'CANCELLED', notes = v_vals->>'notes', updated_at = now()
                     WHERE id = v_fix.id;
                ELSE
                    IF v_played AND NOT COALESCE((o->>'allowPlayed')::boolean, false) THEN
                        RAISE EXCEPTION 'PLAYED_FIXTURE: fixture % requires an explicit decision', o->>'id';
                    END IF;
                    IF v_played AND (v_vals ? 'home_team_id' OR v_vals ? 'away_team_id' OR v_vals ? 'status') THEN
                        RAISE EXCEPTION 'PLAYED_FIXTURE: teams/status of played fixture % cannot change', o->>'id';
                    END IF;
                    IF v_vals->>'status' IN ('COMPLETED', 'FORFEITED') THEN
                        RAISE EXCEPTION 'INVALID_STATUS: fixture % cannot be set to %', o->>'id', v_vals->>'status';
                    END IF;
                    UPDATE public.fixtures SET
                        scheduled_at = COALESCE((v_vals->>'scheduled_at')::timestamptz, scheduled_at),
                        status       = COALESCE((v_vals->>'status')::public.fixture_status_enum, status),
                        home_team_id = COALESCE((v_vals->>'home_team_id')::uuid, home_team_id),
                        away_team_id = COALESCE((v_vals->>'away_team_id')::uuid, away_team_id),
                        notes        = CASE WHEN v_vals ? 'notes' THEN v_vals->>'notes' ELSE notes END,
                        updated_at   = now()
                     WHERE id = v_fix.id;
                END IF;
            ELSE
                RAISE EXCEPTION 'INVALID_OP: %', o->>'op';
            END IF;
        END LOOP;

        INSERT INTO public.fixture_import_history
            (actor_id, season_id, league_id, week_number, export_id, checksum, schema_version,
             file_name, file_generated_at, source_revision, result, summary, decisions)
        VALUES
            (v_actor, v_season, v_league, v_week, f->>'export_id', f->>'checksum', (f->>'schema_version')::int,
             f->>'file_name', v_gen, NULLIF(f->>'source_revision', '')::timestamptz, 'APPLIED',
             COALESCE(f->'summary', '{}'::jsonb), COALESCE(f->'decisions', '[]'::jsonb));

        v_applied := v_applied + 1;
    END LOOP;

    RETURN jsonb_build_object('applied', v_applied);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_fixture_week_imports(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_fixture_week_imports(jsonb) TO authenticated;
