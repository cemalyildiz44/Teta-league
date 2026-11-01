-- ==============================================================================
-- TETA LEAGUE — LOCAL POSTGRESQL ISOLATED TRANSFER TEST SUITE
-- Bu SQL betiği SADECE yerel (local) PostgreSQL veya local Docker ortamında
-- çalıştırılmak üzere hazırlanmıştır. Production'a KESİNLİKLE bağlanmaz/uygulanmaz!
-- ==============================================================================

BEGIN;

-- 1. İzole Test Şeması Oluştur (Zero Production Risk)
CREATE SCHEMA IF NOT EXISTS test_transfer_hardening;
SET search_path = test_transfer_hardening, public;

-- Tablolar
CREATE TABLE seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    roster_min INT NOT NULL DEFAULT 7,
    roster_max INT NOT NULL DEFAULT 23,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE leagues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES seasons(id),
    name TEXT NOT NULL
);

CREATE TABLE league_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id),
    season_id UUID NOT NULL REFERENCES seasons(id),
    team_id UUID NOT NULL REFERENCES teams(id),
    captain_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    role TEXT NOT NULL,
    team_id UUID REFERENCES teams(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE team_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES profiles(id),
    team_id UUID NOT NULL REFERENCES teams(id),
    league_id UUID NOT NULL REFERENCES leagues(id),
    season_id UUID NOT NULL REFERENCES seasons(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at TIMESTAMPTZ
);

CREATE TABLE transfer_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES seasons(id),
    name TEXT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT false,
    is_unlimited BOOLEAN NOT NULL DEFAULT false,
    transfer_quota INT DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_window_id UUID NOT NULL REFERENCES transfer_windows(id),
    season_id UUID NOT NULL REFERENCES seasons(id),
    player_id UUID NOT NULL REFERENCES profiles(id),
    from_team_id UUID REFERENCES teams(id),
    to_team_id UUID NOT NULL REFERENCES teams(id),
    requested_by UUID NOT NULL REFERENCES profiles(id),
    status TEXT NOT NULL DEFAULT 'PENDING_PLAYER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    player_responded_at TIMESTAMPTZ,
    effective_at TIMESTAMPTZ
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    reference_type TEXT,
    reference_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RPC 1: get_team_transfer_slots
CREATE OR REPLACE FUNCTION test_transfer_hardening.get_team_transfer_slots(p_team_id UUID, p_season_id UUID)
RETURNS TABLE (
    total_slots INT,
    used_slots INT,
    remaining_slots INT,
    is_window_open BOOLEAN,
    window_id UUID,
    window_name TEXT
) LANGUAGE plpgsql AS $$
DECLARE
    v_window RECORD;
    v_used_count INT := 0;
BEGIN
    SELECT id, name, is_open, start_date, end_date, is_unlimited
    INTO v_window
    FROM test_transfer_hardening.transfer_windows
    WHERE season_id = p_season_id
      AND is_open = true
      AND start_date <= CURRENT_TIMESTAMP
      AND end_date >= CURRENT_TIMESTAMP
    ORDER BY start_date DESC, created_at DESC
    LIMIT 1;

    IF FOUND THEN
        IF v_window.is_unlimited THEN
            RETURN QUERY SELECT 999, 0, 999, true, v_window.id, v_window.name;
        ELSE
            SELECT COUNT(*)::INT INTO v_used_count
            FROM test_transfer_hardening.transfers
            WHERE to_team_id = p_team_id
              AND transfer_window_id = v_window.id
              AND status IN ('APPROVED', 'PENDING_PLAYER');

            RETURN QUERY SELECT 
                5, 
                v_used_count, 
                GREATEST(0, 5 - v_used_count), 
                true, 
                v_window.id, 
                v_window.name;
        END IF;
        RETURN;
    END IF;

    RETURN QUERY SELECT 5, 0, 5, false, NULL::UUID, 'Pencere Yok'::TEXT;
END;
$$;

-- RPC 2: send_team_invite
CREATE OR REPLACE FUNCTION test_transfer_hardening.send_team_invite(p_caller_id UUID, p_player_id UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_captain_team_id UUID;
    v_window RECORD;
    v_league_team RECORD;
    v_transfer_id UUID;
    v_approved_transfers INT := 0;
    v_pending_transfers INT := 0;
BEGIN
    SELECT team_id INTO v_captain_team_id
    FROM test_transfer_hardening.user_roles
    WHERE user_id = p_caller_id
      AND role = 'CAPTAIN'
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'You must be an active captain to send an invite.';
    END IF;

    SELECT id, season_id, is_unlimited INTO v_window
    FROM test_transfer_hardening.transfer_windows
    WHERE is_open = true
      AND start_date <= CURRENT_TIMESTAMP
      AND end_date >= CURRENT_TIMESTAMP
    ORDER BY start_date DESC, created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active transfer window.';
    END IF;

    SELECT league_id INTO v_league_team
    FROM test_transfer_hardening.league_teams
    WHERE team_id = v_captain_team_id
      AND season_id = v_window.season_id
    FOR UPDATE;

    IF NOT v_window.is_unlimited THEN
        SELECT COUNT(*) INTO v_approved_transfers
        FROM test_transfer_hardening.transfers
        WHERE to_team_id = v_captain_team_id
          AND transfer_window_id = v_window.id
          AND status = 'APPROVED';

        SELECT COUNT(*) INTO v_pending_transfers
        FROM test_transfer_hardening.transfers
        WHERE to_team_id = v_captain_team_id
          AND transfer_window_id = v_window.id
          AND status = 'PENDING_PLAYER';

        IF (v_approved_transfers + v_pending_transfers) >= 5 THEN
            RAISE EXCEPTION 'Takımınızın bu transfer dönemi için transfer slotu dolmuştur (Maksimum 5 transfer).';
        END IF;
    END IF;

    INSERT INTO test_transfer_hardening.transfers (
        transfer_window_id, season_id, player_id, from_team_id, to_team_id, requested_by, status
    ) VALUES (
        v_window.id, v_window.season_id, p_player_id, NULL, v_captain_team_id, p_caller_id, 'PENDING_PLAYER'
    ) RETURNING id INTO v_transfer_id;

    RETURN v_transfer_id;
END;
$$;

-- RPC 3: accept_team_invite
CREATE OR REPLACE FUNCTION test_transfer_hardening.accept_team_invite(p_caller_id UUID, p_transfer_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_transfer RECORD;
    v_current_membership RECORD;
    v_league_id UUID;
    v_window RECORD;
BEGIN
    SELECT * INTO v_transfer
    FROM test_transfer_hardening.transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
    IF v_transfer.player_id != p_caller_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF v_transfer.status != 'PENDING_PLAYER' THEN RAISE EXCEPTION 'Transfer is no longer valid.'; END IF;

    SELECT id, is_unlimited INTO v_window
    FROM test_transfer_hardening.transfer_windows
    WHERE id = v_transfer.transfer_window_id
      AND season_id = v_transfer.season_id
      AND is_open = true
      AND start_date <= CURRENT_TIMESTAMP
      AND end_date >= CURRENT_TIMESTAMP;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bu transfer teklifinin ait olduğu transfer penceresi kapalı veya süresi dolmuş.';
    END IF;

    SELECT league_id INTO v_league_id
    FROM test_transfer_hardening.league_teams
    WHERE team_id = v_transfer.to_team_id
      AND season_id = v_transfer.season_id
    FOR UPDATE;

    IF NOT v_window.is_unlimited THEN
        IF (
            SELECT COUNT(*)
            FROM test_transfer_hardening.transfers
            WHERE to_team_id = v_transfer.to_team_id
              AND transfer_window_id = v_transfer.transfer_window_id
              AND status = 'APPROVED'
        ) >= 5 THEN
            RAISE EXCEPTION 'Hedef takımın transfer kotası (5) dolmuştur.';
        END IF;
    END IF;

    SELECT id, team_id INTO v_current_membership
    FROM test_transfer_hardening.team_memberships
    WHERE player_id = p_caller_id
      AND season_id = v_transfer.season_id
      AND left_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
        UPDATE test_transfer_hardening.team_memberships
        SET left_at = CURRENT_TIMESTAMP
        WHERE id = v_current_membership.id;

        -- 1. user_roles cleanup
        UPDATE test_transfer_hardening.user_roles
        SET is_active = false,
            revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = p_caller_id
          AND role = 'CAPTAIN'
          AND team_id = v_current_membership.team_id
          AND is_active = true;

        -- 2. league_teams.captain_id cleanup
        UPDATE test_transfer_hardening.league_teams
        SET captain_id = NULL
        WHERE team_id = v_current_membership.team_id
          AND season_id = v_transfer.season_id
          AND captain_id = p_caller_id;
    END IF;

    INSERT INTO test_transfer_hardening.team_memberships (
        player_id, team_id, league_id, season_id, joined_at
    ) VALUES (
        p_caller_id, v_transfer.to_team_id, v_league_id, v_transfer.season_id, CURRENT_TIMESTAMP
    );

    UPDATE test_transfer_hardening.transfers
    SET status = 'APPROVED',
        player_responded_at = CURRENT_TIMESTAMP,
        effective_at = CURRENT_TIMESTAMP
    WHERE id = p_transfer_id;

    -- Cancel competitor offers
    UPDATE test_transfer_hardening.transfers
    SET status = 'CANCELLED',
        player_responded_at = CURRENT_TIMESTAMP
    WHERE player_id = p_caller_id
      AND season_id = v_transfer.season_id
      AND status = 'PENDING_PLAYER'
      AND id != p_transfer_id;
END;
$$;

-- SEED DATA
INSERT INTO seasons (id, name, status) VALUES ('11111111-1111-1111-1111-111111111111', 'Test Season 6', 'ACTIVE');
INSERT INTO teams (id, name) VALUES 
  ('22222222-2222-2222-2222-222222222222', 'Team Alpha'),
  ('33333333-3333-3333-3333-333333333333', 'Team Beta');

INSERT INTO leagues (id, season_id, name) VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Super League');

INSERT INTO league_teams (league_id, season_id, team_id, captain_id) VALUES 
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555'),
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '66666666-6666-6666-6666-666666666666');

INSERT INTO profiles (id, username, status) VALUES 
  ('55555555-5555-5555-5555-555555555555', 'captain_alpha', 'ACTIVE'),
  ('66666666-6666-6666-6666-666666666666', 'captain_beta', 'ACTIVE'),
  ('77777777-7777-7777-7777-777777777771', 'player_1', 'ACTIVE'),
  ('77777777-7777-7777-7777-777777777772', 'player_2', 'ACTIVE'),
  ('77777777-7777-7777-7777-777777777773', 'player_3', 'ACTIVE'),
  ('77777777-7777-7777-7777-777777777774', 'player_4', 'ACTIVE'),
  ('77777777-7777-7777-7777-777777777775', 'player_5', 'ACTIVE'),
  ('77777777-7777-7777-7777-777777777776', 'player_6', 'ACTIVE');

INSERT INTO user_roles (user_id, role, team_id) VALUES 
  ('55555555-5555-5555-5555-555555555555', 'CAPTAIN', '22222222-2222-2222-2222-222222222222'),
  ('66666666-6666-6666-6666-666666666666', 'CAPTAIN', '33333333-3333-3333-3333-333333333333');

INSERT INTO team_memberships (player_id, team_id, league_id, season_id) VALUES 
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111'),
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111');

INSERT INTO transfer_windows (id, season_id, name, start_date, end_date, is_open, is_unlimited, transfer_quota)
VALUES ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'Window Limited 5', now() - interval '1 hour', now() + interval '7 days', true, false, 5);

-- ==============================================================================
-- TEST SENARYOLARI (PL/pgSQL DO BLOKLARI)
-- ==============================================================================

-- Test 1: Başlangıç Kotası (5 Hak)
DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT * INTO r FROM test_transfer_hardening.get_team_transfer_slots('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
    ASSERT r.total_slots = 5 AND r.used_slots = 0 AND r.remaining_slots = 5, 'Test 1 Başarısız: Başlangıç kotası 5/0/5 olmalı';
    RAISE NOTICE '[PASS] Test 1: Başlangıç kotası 5/0/5 doğrulandı.';
END $$;

-- Test 2: 3 Davet Gönderme ve Slot Rezerve Etme (Kullanılan = 3, Kalan = 2)
DO $$
DECLARE
    t1 UUID; t2 UUID; t3 UUID;
    r RECORD;
BEGIN
    t1 := test_transfer_hardening.send_team_invite('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777771');
    t2 := test_transfer_hardening.send_team_invite('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777772');
    t3 := test_transfer_hardening.send_team_invite('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777773');

    SELECT * INTO r FROM test_transfer_hardening.get_team_transfer_slots('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
    ASSERT r.used_slots = 3 AND r.remaining_slots = 2, 'Test 2 Başarısız: 3 bekleyen varken kullanılan 3, kalan 2 olmalı';
    RAISE NOTICE '[PASS] Test 2: 3 davet gönderildi, slot rezerve edildi (used: 3, remaining: 2).';
END $$;

-- Test 3: İptal Durumunda Kotanın İadesi
DO $$
DECLARE
    r RECORD;
BEGIN
    UPDATE test_transfer_hardening.transfers
    SET status = 'CANCELLED'
    WHERE player_id = '77777777-7777-7777-7777-777777777771';

    SELECT * INTO r FROM test_transfer_hardening.get_team_transfer_slots('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
    ASSERT r.used_slots = 2 AND r.remaining_slots = 3, 'Test 3 Başarısız: 1 iptal sonrası kalan 3 olmalı';
    RAISE NOTICE '[PASS] Test 3: 1 davet iptal edildi, kota iade edildi (used: 2, remaining: 3).';
END $$;

-- Test 4: Kotanın Doldurulması (5/5) ve 6. Davetin Engellenmesi
DO $$
DECLARE
    t1 UUID; t4 UUID; t5 UUID;
    v_caught BOOLEAN := false;
BEGIN
    -- Kalan 3 hakkı doldur
    t1 := test_transfer_hardening.send_team_invite('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777771');
    t4 := test_transfer_hardening.send_team_invite('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777774');
    t5 := test_transfer_hardening.send_team_invite('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777775');

    -- 6. davet denenmeli ve EXCEPTION almalı
    BEGIN
        PERFORM test_transfer_hardening.send_team_invite('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777776');
    EXCEPTION WHEN OTHERS THEN
        v_caught := true;
    END;

    ASSERT v_caught = true, 'Test 4 Başarısız: 6. davet engellenmeliydi';
    RAISE NOTICE '[PASS] Test 4: 5 kota dolduğunda 6. davet RPC tarafından başarıyla engellendi.';
END $$;

-- Test 5: Kabul İşlemi ve Rakip Tekliflerin Otomatik İptali
DO $$
DECLARE
    v_t_alpha UUID; v_t_beta UUID;
    v_status_beta TEXT;
BEGIN
    -- Hem Alpha hem Beta player_6'yı davet ediyor (Beta kotasından 1 harcayarak)
    v_t_beta := test_transfer_hardening.send_team_invite('66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777776');

    -- Alpha'nın 1 transferini serbest bırakıp player_6'yı davet etmesini sağlayalım
    UPDATE test_transfer_hardening.transfers SET status = 'CANCELLED' WHERE player_id = '77777777-7777-7777-7777-777777777775';
    v_t_alpha := test_transfer_hardening.send_team_invite('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777776');

    -- Player 6 Team Alpha'nın davetini kabul ediyor
    PERFORM test_transfer_hardening.accept_team_invite('77777777-7777-7777-7777-777777777776', v_t_alpha);

    -- Team Beta'nın daveti otomatik CANCELLED olmalı
    SELECT status INTO v_status_beta FROM test_transfer_hardening.transfers WHERE id = v_t_beta;
    ASSERT v_status_beta = 'CANCELLED', 'Test 5 Başarısız: Rakip teklif CANCELLED olmalı';
    RAISE NOTICE '[PASS] Test 5: Oyuncu daveti kabul ettiğinde rakip teklif otomatik iptal edildi (status: %).', v_status_beta;
END $$;

-- Test 6: Kaptanlık Rolü Temizliği (league_teams.captain_id ve user_roles)
DO $$
DECLARE
    v_t_cap UUID;
    v_lt_cap UUID;
    v_ur_active BOOLEAN;
BEGIN
    -- Team Beta, Team Alpha'nın kaptanını transfer ediyor
    v_t_cap := test_transfer_hardening.send_team_invite('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555');
    PERFORM test_transfer_hardening.accept_team_invite('55555555-5555-5555-5555-555555555555', v_t_cap);

    -- Team Alpha'nın league_teams.captain_id alanı NULL olmalı
    SELECT captain_id INTO v_lt_cap FROM test_transfer_hardening.league_teams WHERE team_id = '22222222-2222-2222-2222-222222222222' AND season_id = '11111111-1111-1111-1111-111111111111';
    ASSERT v_lt_cap IS NULL, 'Test 6 Başarısız: Eski takım league_teams.captain_id NULL olmalı';

    -- Team Alpha'daki user_roles CAPTAIN kaydı is_active = false olmalı
    SELECT is_active INTO v_ur_active FROM test_transfer_hardening.user_roles WHERE user_id = '55555555-5555-5555-5555-555555555555' AND team_id = '22222222-2222-2222-2222-222222222222';
    ASSERT v_ur_active = false, 'Test 6 Başarısız: user_roles CAPTAIN pasifleştirilmeli';

    RAISE NOTICE '[PASS] Test 6: Transfer olan kaptanın eski takımındaki rol ve league_teams.captain_id kaydı sıfırlandı.';
END $$;

-- ==============================================================================
-- TEMİZLİK: İşlem Test Ortamında Otomatik Geri Alınır (Rollback)
-- ==============================================================================
ROLLBACK;
DROP SCHEMA IF EXISTS test_transfer_hardening CASCADE;
