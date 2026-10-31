-- ============================================================================
-- TETA League - Dual-Sided Match Reporting & Player Statistics System
-- Migration: 20261031000000_dual_match_reporting_system.sql
--
-- Purpose:
--   1. Enable both home and away team captains to independently submit match
--      reports (score, screenshot proof, notes, and starting 11 player stats)
--      for the same fixture without blocking each other.
--   2. Track each team's report status independently (PENDING_REVIEW, APPROVED,
--      REJECTED) while keeping overall match status separate.
--   3. Allow admins to approve/reject each team's report independently and
--      atomically:
--      - 1st approved report sets official match score/result and writes 1st
--        team's player stats into match_player_stats.
--      - 2nd approved report preserves the 1st report's approved match score
--        and writes only the 2nd team's player stats into match_player_stats.
--      - Score mismatch between reports blocks automatic approval and requires
--        explicit admin confirmation.
--   4. Enforce strict idempotency, deterministic hierarchical row locking,
--      single active report per team per fixture, unique player selection per
--      report, and captain team membership checks.
-- ============================================================================

-- 0. HELPER FUNCTIONS & MOM PARTIAL UNIQUE INDEX ON match_player_stats
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (public.has_role('ADMIN') OR public.has_role('SUPER_ADMIN'));
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- Allow submit_match_team_report (SECURITY DEFINER) to reopen a REJECTED manual match to PENDING_REVIEW
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
        IF NOT v_is_admin AND COALESCE(current_setting('app.in_submit_match_team_report', true), '') != 'true' THEN
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
                NEW.approved_by := auth.uid();
                NEW.approved_at := CURRENT_TIMESTAMP;
            ELSIF NEW.status = 'APPROVED' AND OLD.status = 'APPROVED' THEN
                IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
                   OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
                    RAISE EXCEPTION 'approved_by and approved_at are immutable after approval.';
                END IF;
            ELSIF NEW.status != 'APPROVED' AND OLD.status = 'APPROVED' THEN
                NEW.approved_by := NULL;
                NEW.approved_at := NULL;
                NEW.is_stats_applied := false;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- In dual-sided reporting, both home and away captains may designate their team's MOM.
-- Scoping the partial unique index to (match_id, team_id) prevents unique constraint
-- collisions when the second team's report is approved.
DROP INDEX IF EXISTS public.uq_single_mom_per_match;
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_mom_per_match_team
    ON public.match_player_stats(match_id, team_id)
    WHERE is_mom = true;

-- 1. MATCH TEAM REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.match_team_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixture_id UUID NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
    match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
    season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
    league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE RESTRICT,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
    submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    home_score INTEGER NOT NULL CHECK (home_score >= 0 AND home_score <= 99),
    away_score INTEGER NOT NULL CHECK (away_score >= 0 AND away_score <= 99),
    played_at TIMESTAMPTZ NOT NULL,
    screenshot_url TEXT,
    notes TEXT,
    status public.match_status_enum NOT NULL DEFAULT 'PENDING_REVIEW',
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    is_stats_applied BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent the same team from having multiple active (PENDING_REVIEW or APPROVED)
-- reports for the same fixture. If a report is REJECTED, the captain can submit
-- a new report for their team.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_match_team_report
    ON public.match_team_reports(fixture_id, team_id)
    WHERE status IN ('PENDING_REVIEW', 'APPROVED');

CREATE INDEX IF NOT EXISTS idx_match_team_reports_fixture
    ON public.match_team_reports(fixture_id);

CREATE INDEX IF NOT EXISTS idx_match_team_reports_match
    ON public.match_team_reports(match_id);

CREATE INDEX IF NOT EXISTS idx_match_team_reports_team
    ON public.match_team_reports(team_id);

CREATE INDEX IF NOT EXISTS idx_match_team_reports_status
    ON public.match_team_reports(status);

DROP TRIGGER IF EXISTS set_updated_at_match_team_reports ON public.match_team_reports;
CREATE TRIGGER set_updated_at_match_team_reports
    BEFORE UPDATE ON public.match_team_reports
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. MATCH TEAM REPORT PLAYERS TABLE (Mirrors match_player_stats schema)
CREATE TABLE IF NOT EXISTS public.match_team_report_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.match_team_reports(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
    position TEXT NOT NULL DEFAULT 'MID' CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
    goals INTEGER NOT NULL DEFAULT 0,
    assists INTEGER NOT NULL DEFAULT 0,
    rating NUMERIC(4,2),
    shots INTEGER NOT NULL DEFAULT 0,
    passes_made INTEGER NOT NULL DEFAULT 0,
    pass_attempts INTEGER NOT NULL DEFAULT 0,
    tackles_made INTEGER NOT NULL DEFAULT 0,
    tackle_attempts INTEGER NOT NULL DEFAULT 0,
    saves INTEGER NOT NULL DEFAULT 0,
    goals_conceded INTEGER NOT NULL DEFAULT 0,
    cleansheets_gk INTEGER NOT NULL DEFAULT 0,
    cleansheets_def INTEGER NOT NULL DEFAULT 0,
    yellow_cards INTEGER NOT NULL DEFAULT 0,
    red_cards INTEGER NOT NULL DEFAULT 0,
    minutes_played INTEGER NOT NULL DEFAULT 90,
    is_mom BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_report_player UNIQUE (report_id, player_id),
    CONSTRAINT chk_report_stats_positive CHECK (
        goals >= 0 AND assists >= 0 AND yellow_cards >= 0 AND red_cards >= 0 AND
        saves >= 0 AND tackles_made >= 0 AND passes_made >= 0 AND shots >= 0 AND
        goals_conceded >= 0 AND cleansheets_gk >= 0 AND cleansheets_def >= 0 AND
        pass_attempts >= 0 AND tackle_attempts >= 0
    ),
    CONSTRAINT chk_report_rating CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10.00))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_single_mom_per_report
    ON public.match_team_report_players(report_id)
    WHERE is_mom = true;

CREATE INDEX IF NOT EXISTS idx_match_team_report_players_report
    ON public.match_team_report_players(report_id);

CREATE INDEX IF NOT EXISTS idx_match_team_report_players_player
    ON public.match_team_report_players(player_id);

DROP TRIGGER IF EXISTS set_updated_at_match_team_report_players ON public.match_team_report_players;
CREATE TRIGGER set_updated_at_match_team_report_players
    BEFORE UPDATE ON public.match_team_report_players
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. INTEGRITY TRIGGERS ON REPORT TABLES
CREATE OR REPLACE FUNCTION public.check_match_team_report_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_fixture RECORD;
    v_match RECORD;
BEGIN
    SELECT id, season_id, league_id, home_team_id, away_team_id, status
    INTO v_fixture
    FROM public.fixtures
    WHERE id = NEW.fixture_id;

    IF v_fixture.id IS NULL THEN
        RAISE EXCEPTION 'Fikstür bulunamadı.';
    END IF;

    IF NEW.team_id != v_fixture.home_team_id AND NEW.team_id != v_fixture.away_team_id THEN
        RAISE EXCEPTION 'Rapor gönderilen takım bu fikstürün ev sahibi veya deplasman takımı değil.';
    END IF;

    -- Strictly block captain reporting on COMPLETED / non-SCHEDULED fixtures and APPROVED / AUTO / FORFEIT matches.
    -- Admin approval/rejection updates (where TG_OP = 'UPDATE' and public.is_admin() = true) are permitted.
    IF TG_OP = 'INSERT' OR NOT public.is_admin() THEN
        IF v_fixture.status != 'SCHEDULED' THEN
            RAISE EXCEPTION 'Tamamlanmış, ertelenmiş veya iptal edilmiş fikstürler kaptan raporlamasına kapalıdır (Fikstür durumu: %).', v_fixture.status;
        END IF;

        SELECT id, status, source
        INTO v_match
        FROM public.matches
        WHERE fixture_id = NEW.fixture_id
        LIMIT 1;

        IF v_match.id IS NOT NULL THEN
            IF v_match.status::text IN ('APPROVED', 'CANCELLED') THEN
                RAISE EXCEPTION 'Onaylanmış veya iptal edilmiş maçlar kaptan raporlamasına kapalıdır.';
            END IF;

            IF v_match.source IN ('AUTO', 'FORFEIT') THEN
                RAISE EXCEPTION 'EA API üzerinden işlenmiş veya hükmen sonuçlanmış maçlar kaptan raporlamasına kapalıdır.';
            END IF;

            IF EXISTS (
                SELECT 1
                FROM public.match_player_stats mps
                WHERE mps.match_id = v_match.id
                  AND mps.team_id = NEW.team_id
            ) THEN
                RAISE EXCEPTION 'Bu maç için takımınızın oyuncu istatistikleri zaten işlenmiş.';
            END IF;
        END IF;
    END IF;

    NEW.season_id := v_fixture.season_id;
    NEW.league_id := v_fixture.league_id;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_match_team_report_integrity() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_check_match_team_report_integrity ON public.match_team_reports;
CREATE TRIGGER trg_check_match_team_report_integrity
    BEFORE INSERT OR UPDATE ON public.match_team_reports
    FOR EACH ROW EXECUTE FUNCTION public.check_match_team_report_integrity();

CREATE OR REPLACE FUNCTION public.check_match_team_report_player_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_report RECORD;
    v_valid_membership BOOLEAN;
    v_player_status TEXT;
    v_player_active BOOLEAN;
    v_current_count INTEGER;
BEGIN
    SELECT id, team_id, season_id, played_at, status
    INTO v_report
    FROM public.match_team_reports
    WHERE id = NEW.report_id;

    IF v_report.id IS NULL THEN
        RAISE EXCEPTION 'İlgili maç raporu bulunamadı.';
    END IF;

    IF NEW.team_id != v_report.team_id THEN
        RAISE EXCEPTION 'Oyuncu takımı rapor gönderen takımla eşleşmelidir.';
    END IF;

    IF NOT public.is_admin() AND v_report.status != 'PENDING_REVIEW' THEN
        RAISE EXCEPTION 'Onaylanmış veya reddedilmiş bir raporun oyuncu istatistikleri değiştirilemez.';
    END IF;

    SELECT status, is_active INTO v_player_status, v_player_active
    FROM public.profiles
    WHERE id = NEW.player_id;

    IF v_player_status IN ('BANNED', 'SUSPENDED') OR v_player_active = false THEN
        RAISE EXCEPTION 'Cezalı veya askıya alınmış oyuncular maç kadrosuna eklenemez.';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.team_memberships tm
        WHERE tm.player_id = NEW.player_id
          AND tm.team_id = NEW.team_id
          AND tm.season_id = v_report.season_id
          AND tm.joined_at <= COALESCE(v_report.played_at, now()) + INTERVAL '1 day'
          AND (tm.left_at IS NULL OR tm.left_at >= COALESCE(v_report.played_at, now()) - INTERVAL '1 day')
    ) INTO v_valid_membership;

    IF NOT v_valid_membership AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Seçilen oyuncu bu sezonda takım kadrosunda yer almıyor.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT COUNT(*) INTO v_current_count
        FROM public.match_team_report_players
        WHERE report_id = NEW.report_id;

        IF v_current_count >= 11 THEN
            RAISE EXCEPTION 'Bir maç raporunda en fazla 11 oyuncu seçilebilir.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_match_team_report_player_membership() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_check_match_team_report_player_membership ON public.match_team_report_players;
CREATE TRIGGER trg_check_match_team_report_player_membership
    BEFORE INSERT OR UPDATE ON public.match_team_report_players
    FOR EACH ROW EXECUTE FUNCTION public.check_match_team_report_player_membership();

-- 4. ROW LEVEL SECURITY (RLS) POLICIES & GRANTS
ALTER TABLE public.match_team_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_team_report_players ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.match_team_reports FROM PUBLIC, anon;
REVOKE ALL ON public.match_team_report_players FROM PUBLIC, anon;

GRANT SELECT ON public.match_team_reports TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.match_team_reports TO authenticated, service_role;

GRANT SELECT ON public.match_team_report_players TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.match_team_report_players TO authenticated, service_role;

DROP POLICY IF EXISTS "Public read match_team_reports" ON public.match_team_reports;
CREATE POLICY "Public read match_team_reports"
    ON public.match_team_reports FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Captain insert own team report" ON public.match_team_reports;
CREATE POLICY "Captain insert own team report"
    ON public.match_team_reports FOR INSERT TO authenticated
    WITH CHECK (
        submitted_by = auth.uid()
        AND status = 'PENDING_REVIEW'
        AND is_stats_applied = false
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.status = 'ACTIVE'
              AND p.is_active = true
        )
        AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = 'CAPTAIN'
              AND ur.is_active = true
              AND ur.revoked_at IS NULL
              AND ur.team_id = match_team_reports.team_id
        )
        AND EXISTS (
            SELECT 1 FROM public.fixtures f
            WHERE f.id = match_team_reports.fixture_id
              AND f.status = 'SCHEDULED'
              AND (f.home_team_id = match_team_reports.team_id OR f.away_team_id = match_team_reports.team_id)
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.matches m
            WHERE m.fixture_id = match_team_reports.fixture_id
              AND (
                  m.status::text IN ('APPROVED', 'CANCELLED')
                  OR m.source IN ('AUTO', 'FORFEIT')
              )
        )
    );

DROP POLICY IF EXISTS "Captain update own pending team report" ON public.match_team_reports;
CREATE POLICY "Captain update own pending team report"
    ON public.match_team_reports FOR UPDATE TO authenticated
    USING (
        status = 'PENDING_REVIEW'
        AND is_stats_applied = false
        AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = 'CAPTAIN'
              AND ur.is_active = true
              AND ur.revoked_at IS NULL
              AND ur.team_id = match_team_reports.team_id
        )
        AND EXISTS (
            SELECT 1 FROM public.fixtures f
            WHERE f.id = match_team_reports.fixture_id
              AND f.status = 'SCHEDULED'
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.matches m
            WHERE m.fixture_id = match_team_reports.fixture_id
              AND (
                  m.status::text IN ('APPROVED', 'CANCELLED')
                  OR m.source IN ('AUTO', 'FORFEIT')
              )
        )
    )
    WITH CHECK (
        status = 'PENDING_REVIEW'
        AND is_stats_applied = false
        AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = 'CAPTAIN'
              AND ur.is_active = true
              AND ur.revoked_at IS NULL
              AND ur.team_id = match_team_reports.team_id
        )
        AND EXISTS (
            SELECT 1 FROM public.fixtures f
            WHERE f.id = match_team_reports.fixture_id
              AND f.status = 'SCHEDULED'
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.matches m
            WHERE m.fixture_id = match_team_reports.fixture_id
              AND (
                  m.status::text IN ('APPROVED', 'CANCELLED')
                  OR m.source IN ('AUTO', 'FORFEIT')
              )
        )
    );

DROP POLICY IF EXISTS "Admin all match_team_reports" ON public.match_team_reports;
CREATE POLICY "Admin all match_team_reports"
    ON public.match_team_reports FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public read match_team_report_players" ON public.match_team_report_players;
CREATE POLICY "Public read match_team_report_players"
    ON public.match_team_report_players FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Captain manage own pending report players" ON public.match_team_report_players;
CREATE POLICY "Captain manage own pending report players"
    ON public.match_team_report_players FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.match_team_reports r
            JOIN public.user_roles ur ON ur.team_id = r.team_id
            WHERE r.id = match_team_report_players.report_id
              AND r.team_id = match_team_report_players.team_id
              AND r.status = 'PENDING_REVIEW'
              AND r.is_stats_applied = false
              AND ur.user_id = auth.uid()
              AND ur.role = 'CAPTAIN'
              AND ur.is_active = true
              AND ur.revoked_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.match_team_reports r
            JOIN public.user_roles ur ON ur.team_id = r.team_id
            WHERE r.id = match_team_report_players.report_id
              AND r.team_id = match_team_report_players.team_id
              AND r.status = 'PENDING_REVIEW'
              AND r.is_stats_applied = false
              AND ur.user_id = auth.uid()
              AND ur.role = 'CAPTAIN'
              AND ur.is_active = true
              AND ur.revoked_at IS NULL
        )
    );

DROP POLICY IF EXISTS "Admin all match_team_report_players" ON public.match_team_report_players;
CREATE POLICY "Admin all match_team_report_players"
    ON public.match_team_report_players FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5. ATOMIC RPC: SUBMIT TEAM MATCH REPORT
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
    v_expected_player_count INTEGER;
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
    -- Teams with >= 11 active players must select 11 players; teams with < 11 active players
    -- (e.g. roster_min = 7..10) must select all of their active eligible players.
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

    v_expected_player_count := LEAST(11, v_active_roster_count);

    -- Validate unique starting players
    v_player_count := COALESCE(jsonb_array_length(p_players), 0);
    IF v_player_count != v_expected_player_count THEN
        RAISE EXCEPTION 'Maç raporunda tam % ilk 11 oyuncusu seçilmelidir (Seçilen: %).', v_expected_player_count, v_player_count;
    END IF;

    SELECT COUNT(DISTINCT (elem->>'player_id')::UUID),
           COUNT(*) FILTER (WHERE COALESCE((elem->>'is_mom')::BOOLEAN, false) = true)
    INTO v_unique_player_count, v_mom_count
    FROM jsonb_array_elements(p_players) AS elem
    WHERE elem->>'player_id' IS NOT NULL;

    IF v_unique_player_count != v_expected_player_count THEN
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
        -- If the overall match was previously REJECTED, reopen it as PENDING_REVIEW
        -- Do NOT overwrite score or status if match is already PENDING_REVIEW (other team) or APPROVED!
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

-- 6. ATOMIC RPC: APPROVE TEAM MATCH REPORT
CREATE OR REPLACE FUNCTION public.approve_match_team_report(
    p_report_id UUID,
    p_allow_score_mismatch BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_fixture_id UUID;
    v_report RECORD;
    v_other_report RECORD;
    v_match RECORD;
    v_fixture RECORD;
    v_is_first_approval BOOLEAN := false;
    v_score_mismatch BOOLEAN := false;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Yetkisiz işlem: Yalnızca yöneticiler maç raporu onaylayabilir.';
    END IF;

    -- Lookup fixture_id first so we lock in strict hierarchical order: fixtures -> matches -> match_team_reports
    SELECT fixture_id INTO v_fixture_id
    FROM public.match_team_reports
    WHERE id = p_report_id;

    IF v_fixture_id IS NULL THEN
        RAISE EXCEPTION 'Onaylanacak takım raporu bulunamadı.';
    END IF;

    -- Lock 1: Fixture
    SELECT * INTO v_fixture
    FROM public.fixtures
    WHERE id = v_fixture_id
    FOR UPDATE;

    -- Lock 2: Parent Match
    SELECT * INTO v_match
    FROM public.matches
    WHERE fixture_id = v_fixture_id
    FOR UPDATE;

    -- Lock 3: Target Report
    SELECT * INTO v_report
    FROM public.match_team_reports
    WHERE id = p_report_id
    FOR UPDATE;

    -- Idempotency check: prevent processing the same report or stats twice
    IF v_report.status = 'APPROVED' OR v_report.is_stats_applied = true THEN
        RAISE EXCEPTION 'Bu rapor zaten onaylanmış ve oyuncu istatistikleri işlenmiş.';
    END IF;

    -- Check opponent's active report (PENDING_REVIEW or APPROVED)
    SELECT * INTO v_other_report
    FROM public.match_team_reports
    WHERE fixture_id = v_report.fixture_id
      AND team_id != v_report.team_id
      AND status IN ('PENDING_REVIEW', 'APPROVED')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Determine whether an approved score already exists
    IF v_match.id IS NOT NULL AND v_match.status = 'APPROVED' THEN
        v_is_first_approval := false;
        IF v_report.home_score != v_match.home_score OR v_report.away_score != v_match.away_score THEN
            v_score_mismatch := true;
        END IF;
    ELSIF v_other_report.id IS NOT NULL AND v_other_report.status = 'APPROVED' THEN
        v_is_first_approval := false;
        IF v_report.home_score != v_other_report.home_score OR v_report.away_score != v_other_report.away_score THEN
            v_score_mismatch := true;
        END IF;
    ELSE
        v_is_first_approval := true;
        IF v_other_report.id IS NOT NULL AND (
            v_report.home_score != v_other_report.home_score OR v_report.away_score != v_other_report.away_score
        ) THEN
            v_score_mismatch := true;
        END IF;
    END IF;

    -- Block automatic approval on score mismatch unless admin explicitly confirms
    IF v_score_mismatch AND NOT p_allow_score_mismatch THEN
        RAISE EXCEPTION 'SKOR_UYUSMAZLIGI: İki takım kaptanının bildirdiği skorlar uyuşmuyor (% - % vs % - %). Lütfen kanıtları inceleyip manuel karar verin.',
            v_report.home_score,
            v_report.away_score,
            COALESCE(v_other_report.home_score, v_match.home_score),
            COALESCE(v_other_report.away_score, v_match.away_score);
    END IF;

    -- Create or update parent match ONLY on first approval.
    -- On second approval, v_match is already APPROVED and its official score is strictly preserved!
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
            approved_by,
            approved_at,
            screenshot_url,
            notes
        ) VALUES (
            v_report.fixture_id,
            v_report.season_id,
            v_report.league_id,
            v_fixture.home_team_id,
            v_fixture.away_team_id,
            v_report.home_score,
            v_report.away_score,
            v_report.played_at,
            'MANUAL',
            'APPROVED',
            v_report.submitted_by,
            v_admin_id,
            now(),
            v_report.screenshot_url,
            v_report.notes
        )
        RETURNING * INTO v_match;
    ELSIF v_is_first_approval THEN
        -- First report approved: process match score and mark match APPROVED
        UPDATE public.matches
        SET home_score = v_report.home_score,
            away_score = v_report.away_score,
            played_at = v_report.played_at,
            status = 'APPROVED',
            approved_by = v_admin_id,
            approved_at = now(),
            rejection_reason = NULL,
            screenshot_url = COALESCE(v_match.screenshot_url, v_report.screenshot_url),
            notes = COALESCE(v_match.notes, v_report.notes),
            updated_at = now()
        WHERE id = v_match.id
        RETURNING * INTO v_match;
    END IF;

    -- Replace match_player_stats ONLY for this report's team (never overwrite the other team!)
    DELETE FROM public.match_player_stats
    WHERE match_id = v_match.id
      AND team_id = v_report.team_id;

    INSERT INTO public.match_player_stats (
        match_id,
        player_id,
        ea_player_id,
        ea_player_name,
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
        red_cards,
        is_mom,
        extra_stats
    )
    SELECT
        v_match.id,
        rp.player_id,
        p.current_ea_player_id,
        p.username,
        rp.team_id,
        rp.position,
        rp.goals,
        rp.assists,
        rp.rating,
        rp.shots,
        rp.passes_made,
        rp.pass_attempts,
        rp.tackles_made,
        rp.tackle_attempts,
        rp.saves,
        rp.goals_conceded,
        rp.cleansheets_gk,
        rp.cleansheets_def,
        rp.red_cards,
        rp.is_mom,
        jsonb_build_object(
            'roster_status', 'VALID',
            'match_team_id', rp.team_id,
            'source', 'CAPTAIN_REPORT',
            'yellow_cards', rp.yellow_cards,
            'minutes_played', rp.minutes_played
        )
    FROM public.match_team_report_players rp
    JOIN public.profiles p ON p.id = rp.player_id
    WHERE rp.report_id = v_report.id;

    -- Mark report as APPROVED and stats applied
    UPDATE public.match_team_reports
    SET status = 'APPROVED',
        is_stats_applied = true,
        match_id = v_match.id,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        rejection_reason = NULL,
        updated_at = now()
    WHERE id = v_report.id;

    -- Ensure fixture is marked COMPLETED and season stats are recalculated
    UPDATE public.fixtures
    SET status = 'COMPLETED',
        updated_at = now()
    WHERE id = v_report.fixture_id
      AND status != 'COMPLETED';

    PERFORM public.recalculate_season_stats(v_report.season_id);

    RETURN jsonb_build_object(
        'success', true,
        'report_id', v_report.id,
        'match_id', v_match.id,
        'is_first_approval', v_is_first_approval,
        'score_mismatch_resolved', v_score_mismatch,
        'official_home_score', v_match.home_score,
        'official_away_score', v_match.away_score
    );
END;
$$;

-- 7. ATOMIC RPC: REJECT TEAM MATCH REPORT
CREATE OR REPLACE FUNCTION public.reject_match_team_report(
    p_report_id UUID,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_fixture_id UUID;
    v_report RECORD;
    v_other_active_report RECORD;
    v_match RECORD;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Yetkisiz işlem: Yalnızca yöneticiler maç raporu reddedebilir.';
    END IF;

    SELECT fixture_id INTO v_fixture_id
    FROM public.match_team_reports
    WHERE id = p_report_id;

    IF v_fixture_id IS NULL THEN
        RAISE EXCEPTION 'Reddedilecek takım raporu bulunamadı.';
    END IF;

    -- Lock in deterministic order: fixtures -> matches -> match_team_reports
    PERFORM 1 FROM public.fixtures WHERE id = v_fixture_id FOR UPDATE;

    SELECT * INTO v_match
    FROM public.matches
    WHERE fixture_id = v_fixture_id
    FOR UPDATE;

    SELECT * INTO v_report
    FROM public.match_team_reports
    WHERE id = p_report_id
    FOR UPDATE;

    -- If this report's stats were previously applied, remove only this team's stats
    IF v_report.is_stats_applied = true AND v_match.id IS NOT NULL THEN
        DELETE FROM public.match_player_stats
        WHERE match_id = v_match.id
          AND team_id = v_report.team_id;
    END IF;

    -- Mark report REJECTED
    UPDATE public.match_team_reports
    SET status = 'REJECTED',
        is_stats_applied = false,
        rejection_reason = COALESCE(NULLIF(TRIM(p_rejection_reason), ''), 'Yönetici tarafından reddedildi.'),
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = v_report.id;

    -- Check if the other team has an APPROVED or PENDING_REVIEW report
    SELECT * INTO v_other_active_report
    FROM public.match_team_reports
    WHERE fixture_id = v_report.fixture_id
      AND team_id != v_report.team_id
      AND status IN ('PENDING_REVIEW', 'APPROVED')
    ORDER BY CASE WHEN status = 'APPROVED' THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_match.id IS NOT NULL AND v_match.source = 'MANUAL' THEN
        IF v_other_active_report.id IS NULL THEN
            UPDATE public.matches
            SET status = 'REJECTED',
                rejection_reason = COALESCE(NULLIF(TRIM(p_rejection_reason), ''), 'Yönetici tarafından reddedildi.'),
                updated_at = now()
            WHERE id = v_match.id;
        ELSIF v_other_active_report.status = 'PENDING_REVIEW' AND v_match.status = 'APPROVED' THEN
            UPDATE public.matches
            SET status = 'PENDING_REVIEW',
                home_score = v_other_active_report.home_score,
                away_score = v_other_active_report.away_score,
                updated_at = now()
            WHERE id = v_match.id;
        END IF;
    END IF;

    PERFORM public.recalculate_season_stats(v_report.season_id);

    RETURN jsonb_build_object(
        'success', true,
        'report_id', v_report.id,
        'match_id', v_match.id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_match_team_report(UUID, UUID, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_match_team_report(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_match_team_report(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_match_team_report(UUID, UUID, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_match_team_report(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_match_team_report(UUID, TEXT) TO authenticated, service_role;

-- 8. DATABASE-LEVEL GUARD: BLOCK EA AUTO-IMPORT OF DRAWS AND PROTECT CAPTAIN REPORTS
CREATE OR REPLACE FUNCTION public.guard_ea_draw_and_captain_reports()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Block new EA AUTO imports if the score is a draw (must be routed to captain reporting)
    IF TG_OP = 'INSERT' AND NEW.source = 'AUTO' AND NEW.home_score = NEW.away_score THEN
        RAISE EXCEPTION 'EA_DRAW_BLOCKED: Beraberlikle biten EA maçları otomatik içe aktarılamaz; kaptanların manuel raporlamasına bırakılmalıdır.';
    END IF;

    -- Never allow an EA AUTO import/update to overwrite a fixture that has an active or approved captain report
    IF NEW.source = 'AUTO' AND NEW.fixture_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.match_team_reports r
        WHERE r.fixture_id = NEW.fixture_id
          AND r.status IN ('PENDING_REVIEW', 'APPROVED')
    ) THEN
        RAISE EXCEPTION 'CAPTAIN_REPORT_PROTECTED: Kaptan raporu bulunan bir fikstür EA import tarafından ezilemez.';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ea_draw_and_captain_reports() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_ea_draw_and_captain_reports ON public.matches;
CREATE TRIGGER trg_guard_ea_draw_and_captain_reports
    BEFORE INSERT OR UPDATE ON public.matches
    FOR EACH ROW EXECUTE FUNCTION public.guard_ea_draw_and_captain_reports();
