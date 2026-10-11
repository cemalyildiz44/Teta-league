-- ==============================================================================
-- Migration: 20261012000001_submit_official_match_score_rpc.sql
-- Description: Controlled, atomic official score submission by team captains
--              without weakening database triggers, RLS or role boundaries.
-- ==============================================================================

-- 1. ADIM: enforce_match_rules trigger güncellemesi
-- Mevcut tüm güvenlik kontrolleri (source='MANUAL', fixture_id zorunluluğu,
-- submitted_by doğrulaması, update kısıtları) %100 korunur.
-- Sadece resmi SECURITY DEFINER RPC fonksiyonunun kontrollü olarak
-- status='APPROVED' eklemesine güvenli bir iç context üzerinden izin verilir.
CREATE OR REPLACE FUNCTION public.enforce_match_rules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_is_trusted_rpc BOOLEAN;
BEGIN
    v_is_admin := (has_role('ADMIN') OR has_role('SUPER_ADMIN'));
    
    -- Sadece PostgreSQL SECURITY DEFINER RPC fonksiyonunun içinde set edilen dahili bayrak
    v_is_trusted_rpc := current_setting('teta.internal_rpc_context', true) = 'submit_official_match_score';

    IF TG_OP = 'INSERT' THEN
        IF NOT v_is_admin AND NOT v_is_trusted_rpc THEN
            IF NOT has_role('CAPTAIN') THEN
                RAISE EXCEPTION 'Only captains or admins can create matches.';
            END IF;

            IF NEW.source != 'MANUAL' THEN
                RAISE EXCEPTION 'Captains can only create MANUAL matches.';
            END IF;

            IF NEW.fixture_id IS NULL THEN
                RAISE EXCEPTION 'Captains must provide a valid fixture_id for manual matches.';
            END IF;

            IF NEW.status != 'PENDING_REVIEW' THEN
                RAISE EXCEPTION 'New matches created by captains must have status PENDING_REVIEW.';
            END IF;

            IF NEW.submitted_by IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'submitted_by must match the current authenticated user.';
            END IF;

            IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
                RAISE EXCEPTION 'New manual matches cannot have approved_by or approved_at set.';
            END IF;
        ELSE
            -- Admin veya Güvenli RPC tarafından oluşturulan APPROVED maçlar
            IF NEW.status = 'APPROVED' THEN
                IF NEW.approved_by IS NULL THEN
                    NEW.approved_by := COALESCE(auth.uid(), NEW.submitted_by);
                END IF;
                IF NEW.approved_at IS NULL THEN
                    NEW.approved_at := CURRENT_TIMESTAMP;
                END IF;
            END IF;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Mevcut UPDATE güvenlik kuralları kesinlikle aynıdır (Kaptanlar onaylı maçı değiştiremez)
        IF NOT v_is_admin THEN
            IF OLD.status != 'PENDING_REVIEW' THEN
                RAISE EXCEPTION 'Captains can only update PENDING_REVIEW matches.';
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
                RAISE EXCEPTION 'Captains can only update scores, played_at, screenshot_url, and notes.';
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


-- 2. ADIM: submit_official_match_score RPC Fonksiyonu
CREATE OR REPLACE FUNCTION public.submit_official_match_score(
    p_fixture_id UUID,
    p_home_score INT,
    p_away_score INT,
    p_confirmation_accepted BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_captain_team_id UUID;
    v_fixture RECORD;
    v_profile RECORD;
    v_existing_match_id UUID;
    v_new_match_id UUID;
BEGIN
    -- 1. Kimlik Doğrulama
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim. Oturum açılmamış.');
    END IF;

    -- 2. Zorunlu Onay Kontrolü
    IF p_confirmation_accepted IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Skor bildirimini onaylamak için taahhüt kutucuğunu işaretlemelisiniz.');
    END IF;

    -- 3. Skor Aralık ve Tip Kontrolü (0 - 50 tam sayı)
    IF p_home_score IS NULL OR p_away_score IS NULL OR
       p_home_score < 0 OR p_away_score < 0 OR
       p_home_score > 50 OR p_away_score > 50 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Skorlar 0 ile 50 arasında tam sayı olmalıdır.');
    END IF;

    -- 4. Profil Hesap Durumu (BANNED / SUSPENDED)
    SELECT status, is_active INTO v_profile FROM profiles WHERE id = v_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kullanıcı profili bulunamadı.');
    END IF;
    IF v_profile.status = 'BANNED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hesabınız yasaklanmıştır (BANLI).');
    END IF;
    IF v_profile.status = 'SUSPENDED' OR v_profile.is_active = false THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hesabınız askıya alınmıştır.');
    END IF;

    -- 5. Aktif Kaptanlık Rolü Kontrolü
    SELECT team_id INTO v_captain_team_id
    FROM user_roles
    WHERE user_id = v_user_id
      AND role = 'CAPTAIN'
      AND is_active = true
      AND revoked_at IS NULL
    LIMIT 1;

    IF v_captain_team_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bu işlemi gerçekleştirmek için aktif takım kaptanı olmalısınız.');
    END IF;

    -- 6. Fikstür Kilitleme ve Takım Kontrolü (Eşzamanlı yarışmaları önlemek için FOR UPDATE)
    SELECT id, season_id, league_id, home_team_id, away_team_id, status, scheduled_at
    INTO v_fixture
    FROM fixtures
    WHERE id = p_fixture_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fikstür bulunamadı.');
    END IF;

    IF v_fixture.status != 'SCHEDULED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bu maç zaten tamamlanmış veya iptal edilmiştir.');
    END IF;

    -- Kaptan bu maçın takımlarından birine mi ait?
    IF v_fixture.home_team_id != v_captain_team_id AND v_fixture.away_team_id != v_captain_team_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Yalnızca kendi takımınızın maçlarına skor girebilirsiniz.');
    END IF;

    -- 7. Önceden Eklenmiş Maç Kontrolü
    SELECT id INTO v_existing_match_id
    FROM matches
    WHERE fixture_id = p_fixture_id
    LIMIT 1;

    IF v_existing_match_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bu maç için skor zaten bildirilmiştir.');
    END IF;

    -- 8. Transaction İçi Güvenli Context (Sadece bu işlem süresince geçerli, transaction sonunda otomatik silinir)
    PERFORM set_config('teta.internal_rpc_context', 'submit_official_match_score', true);

    -- 9. Maçın APPROVED Olarak Eklenmesi (Tetikleyiciler anında çalışır)
    INSERT INTO matches (
        fixture_id,
        season_id,
        league_id,
        home_team_id,
        away_team_id,
        home_score,
        away_score,
        source,
        status,
        played_at,
        submitted_by,
        approved_by,
        approved_at,
        notes
    ) VALUES (
        v_fixture.id,
        v_fixture.season_id,
        v_fixture.league_id,
        v_fixture.home_team_id,
        v_fixture.away_team_id,
        p_home_score,
        p_away_score,
        'MANUAL',
        'APPROVED',
        COALESCE(v_fixture.scheduled_at, CURRENT_TIMESTAMP),
        v_user_id,
        v_user_id,
        CURRENT_TIMESTAMP,
        'Kaptan tarafından doğrulanmış resmi lig skoru.'
    )
    RETURNING id INTO v_new_match_id;

    RETURN jsonb_build_object(
        'success', true,
        'match_id', v_new_match_id,
        'message', 'Maç skoru başarıyla kaydedildi, puan durumu ve fikstür güncellendi.'
    );

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bu maç için skor başka bir işlem tarafından zaten kaydedildi.');
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'İşlem sırasında bir hata oluştu: ' || SQLERRM);
END;
$$;

-- 3. ADIM: Yetkilendirme Kısıtlaması (Public/Anon kesinlikle engellenir)
REVOKE ALL ON FUNCTION public.submit_official_match_score(UUID, INT, INT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_official_match_score(UUID, INT, INT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_official_match_score(UUID, INT, INT, BOOLEAN) TO authenticated;
