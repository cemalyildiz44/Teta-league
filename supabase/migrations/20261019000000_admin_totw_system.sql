-- 20261019000000_admin_totw_system.sql
-- TETA League: Admin TOTW (Team of the Week) System
-- Creates totw_weeks, totw_selections, links trophy_winners to totw_weeks, and provides atomic submit_and_lock_totw RPC.

-- 1. TOTW Weeks table (One locked record per Season + League + Week)
CREATE TABLE IF NOT EXISTS public.totw_weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
    league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL CHECK (week_number >= 1),
    formation TEXT NOT NULL CHECK (formation IN ('4-3-3', '4-4-2', '4-2-3-1', '3-5-2')),
    trophy_id UUID NOT NULL REFERENCES public.trophies(id) ON DELETE RESTRICT,
    is_locked BOOLEAN NOT NULL DEFAULT true,
    submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_totw_season_league_week UNIQUE (season_id, league_id, week_number)
);

-- 2. TOTW Selections table (11 slots per TOTW week)
CREATE TABLE IF NOT EXISTS public.totw_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    totw_week_id UUID NOT NULL REFERENCES public.totw_weeks(id) ON DELETE CASCADE,
    slot_key TEXT NOT NULL,
    slot_index INTEGER NOT NULL CHECK (slot_index BETWEEN 0 AND 10),
    role_group TEXT NOT NULL CHECK (role_group IN ('GK', 'DEF', 'MID', 'FWD')),
    position_label TEXT NOT NULL,
    player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    rating NUMERIC(4,2),
    score NUMERIC(6,2),
    stats_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_totw_selection_slot UNIQUE (totw_week_id, slot_key),
    CONSTRAINT uq_totw_selection_player UNIQUE (totw_week_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_totw_weeks_lookup ON public.totw_weeks (season_id, league_id, week_number);
CREATE INDEX IF NOT EXISTS idx_totw_selections_week_id ON public.totw_selections (totw_week_id, slot_index);
CREATE INDEX IF NOT EXISTS idx_totw_selections_player_id ON public.totw_selections (player_id);

-- 3. Link trophy_winners to totw_weeks so a reusable TOTW trophy can be awarded across different weeks
ALTER TABLE public.trophy_winners
ADD COLUMN IF NOT EXISTS totw_week_id UUID REFERENCES public.totw_weeks(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.unique_trophy_player_winner;

-- Manual (non-TOTW) trophy assignments remain unique per (trophy_id, player_id)
CREATE UNIQUE INDEX IF NOT EXISTS unique_trophy_player_winner
ON public.trophy_winners (trophy_id, player_id)
WHERE player_id IS NOT NULL AND totw_week_id IS NULL;

-- TOTW trophy assignments are unique per (totw_week_id, player_id)
CREATE UNIQUE INDEX IF NOT EXISTS unique_totw_week_player_winner
ON public.trophy_winners (totw_week_id, player_id)
WHERE totw_week_id IS NOT NULL;

-- 4. RLS Policies (Admin-only for TOTW management tables)
ALTER TABLE public.totw_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.totw_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage totw_weeks" ON public.totw_weeks;
CREATE POLICY "Admins can manage totw_weeks"
ON public.totw_weeks
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
        AND ur.revoked_at IS NULL
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
        AND ur.revoked_at IS NULL
    )
);

DROP POLICY IF EXISTS "Admins can manage totw_selections" ON public.totw_selections;
CREATE POLICY "Admins can manage totw_selections"
ON public.totw_selections
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
        AND ur.revoked_at IS NULL
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
        AND ur.revoked_at IS NULL
    )
);

REVOKE ALL ON TABLE public.totw_weeks FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.totw_selections FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.totw_weeks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.totw_selections TO authenticated;

-- 5. Atomic Submit & Lock RPC
-- Runs in a single transaction: creates totw_weeks, inserts 11 totw_selections,
-- awards the selected trophy in trophy_winners (and records TOTW in player_achievements), and locks the week.
-- If any step fails, the entire transaction rolls back cleanly.
CREATE OR REPLACE FUNCTION public.submit_and_lock_totw(
    p_season_id UUID,
    p_league_id UUID,
    p_week_number INTEGER,
    p_formation TEXT,
    p_trophy_id UUID,
    p_selections JSONB,
    p_notes_prefix TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_totw_week_id UUID;
    v_trophy RECORD;
    v_season_name TEXT;
    v_league_name TEXT;
    v_item JSONB;
    v_player_id UUID;
    v_team_id UUID;
    v_slot_key TEXT;
    v_slot_index INTEGER;
    v_role_group TEXT;
    v_pos_label TEXT;
    v_rating NUMERIC(4,2);
    v_score NUMERIC(6,2);
    v_note TEXT;
    v_count INTEGER := 0;
BEGIN
    -- 1. Admin authorization check
    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = v_actor
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
        AND ur.revoked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Bu işlemi yalnızca yetkili adminler gerçekleştirebilir.' USING ERRCODE = '42501';
    END IF;

    -- 2. Serialize concurrent submissions for the same league + week
    PERFORM pg_advisory_xact_lock(hashtextextended('totw:' || COALESCE(p_league_id::text, '') || ':' || COALESCE(p_week_number::text, ''), 0));

    -- 3. Validate season & league relationship
    SELECT s.name, l.name INTO v_season_name, v_league_name
    FROM public.leagues l
    JOIN public.seasons s ON s.id = l.season_id
    WHERE l.id = p_league_id AND l.season_id = p_season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_SCOPE: Seçilen lig, seçilen sezona ait değil.';
    END IF;

    IF p_week_number IS NULL OR p_week_number < 1 THEN
        RAISE EXCEPTION 'INVALID_WEEK: Geçersiz hafta numarası.';
    END IF;

    IF p_formation NOT IN ('4-3-3', '4-4-2', '4-2-3-1', '3-5-2') THEN
        RAISE EXCEPTION 'INVALID_FORMATION: Desteklenmeyen formasyon (%).', p_formation;
    END IF;

    -- 4. Ensure week is not already submitted/locked
    IF EXISTS (
        SELECT 1 FROM public.totw_weeks
        WHERE season_id = p_season_id AND league_id = p_league_id AND week_number = p_week_number
    ) THEN
        RAISE EXCEPTION 'ALREADY_LOCKED: Bu sezon, lig ve hafta için TOTW zaten gönderilmiş ve kilitlenmiş.' USING ERRCODE = '23505';
    END IF;

    -- 5. Validate trophy eligibility
    SELECT id, title, target_type, season_id, season_name INTO v_trophy
    FROM public.trophies
    WHERE id = p_trophy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TROPHY_NOT_FOUND: Seçilen ödül veritabanında bulunamadı.';
    END IF;

    IF v_trophy.target_type NOT IN ('PLAYER', 'BOTH') THEN
        RAISE EXCEPTION 'INVALID_TROPHY_TARGET: Seçilen ödül yalnızca takımlar içindir; oyuncu TOTW ödülü olarak kullanılamaz.';
    END IF;

    IF v_trophy.season_id IS NOT NULL AND v_trophy.season_id <> p_season_id THEN
        RAISE EXCEPTION 'TROPHY_SEASON_MISMATCH: Seçilen ödül başka bir sezona tanımlanmış.';
    END IF;

    -- 6. Validate selections payload
    IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' OR jsonb_array_length(p_selections) <> 11 THEN
        RAISE EXCEPTION 'INCOMPLETE_SQUAD: TOTW göndermek için 11 pozisyonun tamamı dolu olmalıdır.';
    END IF;

    -- 7. Insert locked TOTW week header
    INSERT INTO public.totw_weeks (
        season_id, league_id, week_number, formation, trophy_id, is_locked, submitted_by, submitted_at
    ) VALUES (
        p_season_id, p_league_id, p_week_number, p_formation, p_trophy_id, true, v_actor, now()
    )
    RETURNING id INTO v_totw_week_id;

    -- 8. Insert each selection and award the trophy atomically
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_selections) LOOP
        v_player_id  := (v_item->>'player_id')::uuid;
        v_team_id    := NULLIF(v_item->>'team_id', '')::uuid;
        v_slot_key   := v_item->>'slot_key';
        v_slot_index := (v_item->>'slot_index')::int;
        v_role_group := v_item->>'role_group';
        v_pos_label  := v_item->>'position_label';
        v_rating     := NULLIF(v_item->>'rating', '')::numeric(4,2);
        v_score      := NULLIF(v_item->>'score', '')::numeric(6,2);

        IF v_player_id IS NULL THEN
            RAISE EXCEPTION 'MISSING_PLAYER: % pozisyonunda oyuncu seçilmemiş.', COALESCE(v_slot_key, '?');
        END IF;

        INSERT INTO public.totw_selections (
            totw_week_id, slot_key, slot_index, role_group, position_label,
            player_id, team_id, rating, score, stats_snapshot
        ) VALUES (
            v_totw_week_id, v_slot_key, v_slot_index, v_role_group, v_pos_label,
            v_player_id, v_team_id, v_rating, v_score, COALESCE(v_item->'stats_snapshot', '{}'::jsonb)
        );

        v_note := COALESCE(
            NULLIF(trim(p_notes_prefix), ''),
            v_season_name || ' • ' || v_league_name || ' • ' || p_week_number || '. Hafta TOTW'
        ) || ' (' || v_pos_label || ')';

        INSERT INTO public.trophy_winners (
            trophy_id, winner_type, player_id, team_id, totw_week_id, notes, awarded_by, awarded_at
        ) VALUES (
            p_trophy_id, 'PLAYER', v_player_id, NULL, v_totw_week_id, v_note, v_actor, now()
        );

        -- Keep player_achievements TOTW badge in sync as well
        INSERT INTO public.player_achievements (
            player_id, achievement_type, season_id, week_number, awarded_by
        ) VALUES (
            v_player_id, 'TOTW', p_season_id, p_week_number, v_actor
        )
        ON CONFLICT (player_id, season_id, week_number) WHERE achievement_type = 'TOTW' DO NOTHING;

        v_count := v_count + 1;
    END LOOP;

    IF v_count <> 11 THEN
        RAISE EXCEPTION 'INCOMPLETE_AWARD_COUNT: Beklenen 11 oyuncu yerine % oyuncu işlendi.', v_count;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'totw_week_id', v_totw_week_id,
        'awarded_count', v_count,
        'trophy_title', v_trophy.title
    );
END;
$$;
