-- ============================================================================
-- Migration: 20261109130000_allow_min_8_players_in_captain_report.sql
-- Purpose:
--   Allow captains to report matches with 8 to 11 players (matching the league
--   rule of minimum 8 players per match) instead of strictly requiring all 11.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_match_team_report(
    p_fixture_id UUID,
    p_team_id UUID,
    p_home_score INTEGER,
    p_away_score INTEGER,
    p_played_at TIMESTAMPTZ,
    p_screenshot_url TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_players JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_fixture RECORD;
    v_existing_report RECORD;
    v_match RECORD;
    v_match_id UUID;
    v_report_id UUID;
    v_active_roster_count INTEGER;
    v_min_player_count INTEGER;
    v_max_player_count INTEGER;
    v_player_count INTEGER;
    v_unique_player_count INTEGER;
    v_mom_count INTEGER;
    v_item JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmanız gerekiyor.';
    END IF;

    -- Verify active user profile
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_user_id AND status = 'ACTIVE' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Hesabınız aktif değil.';
    END IF;

    -- Verify captain authorization for p_team_id (or admin)
    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_user_id
          AND role = 'CAPTAIN'
          AND team_id = p_team_id
          AND is_active = true
          AND revoked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Yalnızca kaptanı olduğunuz takım adına maç raporu gönderebilirsiniz.';
    END IF;

    -- Deterministic lock 1: Lock fixture first to serialize concurrent operations on the same fixture
    SELECT * INTO v_fixture
    FROM public.fixtures
    WHERE id = p_fixture_id
    FOR UPDATE;

    IF v_fixture.id IS NULL THEN
        RAISE EXCEPTION 'Fikstür bulunamadı.';
    END IF;

    IF v_fixture.home_team_id != p_team_id AND v_fixture.away_team_id != p_team_id THEN
        RAISE EXCEPTION 'Sadece kendi takımınızın maçlarını raporlayabilirsiniz.';
    END IF;

    -- Strictly block non-SCHEDULED (COMPLETED, POSTPONED, CANCELLED, FORFEITED) fixtures
    IF v_fixture.status != 'SCHEDULED' THEN
        RAISE EXCEPTION 'Tamamlanmış veya geçmişte oynanmış maçlar kaptan raporlamasına kapalıdır (Fikstür durumu: %).', v_fixture.status;
    END IF;

    IF p_home_score < 0 OR p_home_score > 99 OR p_away_score < 0 OR p_away_score > 99 THEN
        RAISE EXCEPTION 'Skor değerleri 0 ile 99 arasında olmalıdır.';
    END IF;

    -- Deterministic lock 2: Lock parent matches record if present
    SELECT * INTO v_match
    FROM public.matches
    WHERE fixture_id = p_fixture_id
    FOR UPDATE;

    -- Strictly block APPROVED / CANCELLED / AUTO / FORFEIT matches and already-processed team stats
    IF v_match.id IS NOT NULL THEN
        IF v_match.status::text IN ('APPROVED', 'CANCELLED') THEN
            RAISE EXCEPTION 'Onaylanmış veya tamamlanmış maçlar kaptan raporlamasına kapalıdır.';
        END IF;

        IF v_match.source IN ('AUTO', 'FORFEIT') THEN
            RAISE EXCEPTION 'EA API üzerinden işlenmiş veya hükmen sonuçlanmış maçlar kaptan raporlamasına kapalıdır.';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.match_player_stats mps
            WHERE mps.match_id = v_match.id
              AND mps.team_id = p_team_id
        ) THEN
            RAISE EXCEPTION 'Bu maç için takımınızın oyuncu istatistikleri zaten kaydedilmiş.';
        END IF;
    END IF;

    -- Check if this team already has an active (PENDING_REVIEW or APPROVED) report
    SELECT id, status INTO v_existing_report
    FROM public.match_team_reports
    WHERE fixture_id = p_fixture_id
      AND team_id = p_team_id
      AND status IN ('PENDING_REVIEW', 'APPROVED')
    FOR UPDATE
    LIMIT 1;

    IF v_existing_report.id IS NOT NULL THEN
        RAISE EXCEPTION 'Takımınız bu maç için zaten aktif veya onaylanmış bir rapor göndermiş.';
    END IF;

    -- Determine active eligible roster size for this team in this season.
    SELECT COUNT(*) INTO v_active_roster_count
    FROM public.team_memberships tm
    JOIN public.profiles p ON p.id = tm.player_id
    WHERE tm.team_id = p_team_id
      AND tm.season_id = v_fixture.season_id
      AND tm.left_at IS NULL
      AND p.status = 'ACTIVE'
      AND p.is_active = true;

    IF v_active_roster_count = 0 THEN
        RAISE EXCEPTION 'Takımınızın bu sezon için aktif kadrosunda uygun oyuncu bulunmuyor.';
    END IF;

    v_min_player_count := LEAST(8, v_active_roster_count);
    v_max_player_count := LEAST(11, v_active_roster_count);

    -- Validate unique starting players (between 8 and 11 players)
    v_player_count := COALESCE(jsonb_array_length(p_players), 0);
    IF v_player_count < v_min_player_count OR v_player_count > v_max_player_count THEN
        RAISE EXCEPTION 'Maç raporunda en az %, en fazla % oyuncu seçilmelidir (Seçilen: %).', v_min_player_count, v_max_player_count, v_player_count;
    END IF;

    SELECT COUNT(DISTINCT (elem->>'player_id')::UUID),
           COUNT(*) FILTER (WHERE COALESCE((elem->>'is_mom')::BOOLEAN, false) = true)
    INTO v_unique_player_count, v_mom_count
    FROM jsonb_array_elements(p_players) AS elem
    WHERE elem->>'player_id' IS NOT NULL;

    IF v_unique_player_count != v_player_count THEN
        RAISE EXCEPTION 'Aynı oyuncu kadroda birden fazla kez seçilemez.';
    END IF;

    IF v_mom_count > 1 THEN
        RAISE EXCEPTION 'Bir maçta en fazla 1 Maçın Oyuncusu (MOM) seçilebilir.';
    END IF;

    -- Ensure or link the parent matches record for admin visibility
    IF v_match.id IS NULL THEN
        INSERT INTO public.matches (
            fixture_id,
            season_id,
            league_id,
            home_team_id,
            away_team_id,
            home_score,
            away_score,
            played_at,
            source,
            status,
            submitted_by,
            screenshot_url,
            notes
        ) VALUES (
            p_fixture_id,
            v_fixture.season_id,
            v_fixture.league_id,
            v_fixture.home_team_id,
            v_fixture.away_team_id,
            p_home_score,
            p_away_score,
            p_played_at,
            'MANUAL',
            'PENDING_REVIEW',
            v_user_id,
            p_screenshot_url,
            p_notes
        )
        RETURNING id INTO v_match_id;
    ELSE
        v_match_id := v_match.id;
        IF v_match.status = 'REJECTED' THEN
            PERFORM set_config('app.in_submit_match_team_report', 'true', true);
            UPDATE public.matches
            SET status = 'PENDING_REVIEW',
                home_score = p_home_score,
                away_score = p_away_score,
                played_at = p_played_at,
                submitted_by = v_user_id,
                screenshot_url = COALESCE(p_screenshot_url, screenshot_url),
                notes = COALESCE(p_notes, notes),
                rejection_reason = NULL,
                updated_at = now()
            WHERE id = v_match_id;
        END IF;
    END IF;

    -- Insert the team report
    INSERT INTO public.match_team_reports (
        fixture_id,
        match_id,
        season_id,
        league_id,
        team_id,
        submitted_by,
        home_score,
        away_score,
        played_at,
        screenshot_url,
        notes,
        status,
        is_stats_applied
    ) VALUES (
        p_fixture_id,
        v_match_id,
        v_fixture.season_id,
        v_fixture.league_id,
        p_team_id,
        v_user_id,
        p_home_score,
        p_away_score,
        p_played_at,
        p_screenshot_url,
        p_notes,
        'PENDING_REVIEW',
        false
    )
    RETURNING id INTO v_report_id;

    -- Insert the starting players and their stats
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_players)
    LOOP
        INSERT INTO public.match_team_report_players (
            report_id,
            player_id,
            team_id,
            position,
            goals,
            assists,
            rating,
            shots,
            passes_made,
            pass_attempts,
            tackles_made,
            tackle_attempts,
            saves,
            goals_conceded,
            cleansheets_gk,
            cleansheets_def,
            yellow_cards,
            red_cards,
            minutes_played,
            is_mom
        ) VALUES (
            v_report_id,
            (v_item->>'player_id')::UUID,
            p_team_id,
            COALESCE(NULLIF(TRIM(v_item->>'position'), ''), 'MID'),
            COALESCE((v_item->>'goals')::INTEGER, 0),
            COALESCE((v_item->>'assists')::INTEGER, 0),
            CASE WHEN v_item->>'rating' IS NOT NULL AND v_item->>'rating' != ''
                 THEN (v_item->>'rating')::NUMERIC(4,2)
                 ELSE NULL
            END,
            COALESCE((v_item->>'shots')::INTEGER, 0),
            COALESCE((v_item->>'passes_made')::INTEGER, 0),
            COALESCE((v_item->>'pass_attempts')::INTEGER, 0),
            COALESCE((v_item->>'tackles_made')::INTEGER, 0),
            COALESCE((v_item->>'tackle_attempts')::INTEGER, 0),
            COALESCE((v_item->>'saves')::INTEGER, 0),
            COALESCE((v_item->>'goals_conceded')::INTEGER, 0),
            COALESCE((v_item->>'cleansheets_gk')::INTEGER, 0),
            COALESCE((v_item->>'cleansheets_def')::INTEGER, 0),
            COALESCE((v_item->>'yellow_cards')::INTEGER, 0),
            COALESCE((v_item->>'red_cards')::INTEGER, 0),
            COALESCE((v_item->>'minutes_played')::INTEGER, 90),
            COALESCE((v_item->>'is_mom')::BOOLEAN, false)
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'report_id', v_report_id,
        'match_id', v_match_id
    );
END;
$$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261109130000', 'allow_min_8_players_in_captain_report', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;
