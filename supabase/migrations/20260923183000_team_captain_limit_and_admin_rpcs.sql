-- 20260923183000_team_captain_limit_and_admin_rpcs.sql
-- TETA LEAGUE: 3 Kaptan Sistemi - Atomik RPC'ler ve Maksimum 3 Kaptan Limiti

-- ============================================================================
-- 1. RPC: public.admin_assign_team_captain(p_team_id uuid, p_user_id uuid)
-- ============================================================================
-- Bir takıma en fazla 3 aktif kaptan atanmasını atomik olarak garanti eder.
-- Geçmişte pasifize edilmiş kaptanlık kaydı varsa re-activate (UPDATE) eder,
-- kayıt yoksa yeni INSERT yapar. Böylece UNIQUE constraint ihlali önlenir.
CREATE OR REPLACE FUNCTION public.admin_assign_team_captain(
    p_team_id uuid,
    p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_active_count integer;
BEGIN
    -- 1. Security Check: Yalnızca aktif ADMIN veya SUPER_ADMIN oturumu
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated: Giriş yapmalısınız.';
    END IF;

    IF NOT (has_role('SUPER_ADMIN') OR has_role('ADMIN')) THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Yalnızca ADMIN veya SUPER_ADMIN kaptan atayabilir.';
    END IF;

    -- 2. Concurrency Control: Takım kaydını kilitleyerek yarış durumlarını (race condition) önle
    PERFORM 1 FROM teams WHERE id = p_team_id FOR UPDATE;

    -- 3. Validation: Takım mevcut ve aktif olmalı
    IF NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id) THEN
        RAISE EXCEPTION 'Belirtilen takım bulunamadı.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id AND is_active = true) THEN
        RAISE EXCEPTION 'Pasif bir takıma kaptan atanamaz.';
    END IF;

    -- 4. Validation: Hedef kullanıcı mevcut ve hesabı aktif olmalı
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'Belirtilen kullanıcı profili bulunamadı.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = p_user_id 
          AND is_active = true 
          AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Kullanıcı hesabı aktif olmadığı için kaptan atanamaz.';
    END IF;

    -- 5. Validation: Hedef kullanıcı başka bir takımda aktif kaptan olmamalı
    IF EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_user_id 
          AND role = 'CAPTAIN' 
          AND team_id <> p_team_id 
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Kullanıcı zaten başka bir takımın aktif kaptanıdır.';
    END IF;

    -- 6. Validation: Hedef kullanıcı bu takımda zaten aktif kaptan olmamalı
    IF EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_user_id 
          AND role = 'CAPTAIN' 
          AND team_id = p_team_id 
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Kullanıcı zaten bu takımın aktif kaptanıdır.';
    END IF;

    -- 7. Validation: Takımda aktif kaptan sayısı sınırı kontrolü (MAX 3)
    SELECT COUNT(*) INTO v_active_count
    FROM user_roles
    WHERE team_id = p_team_id
      AND role = 'CAPTAIN'
      AND is_active = true;

    IF v_active_count >= 3 THEN
        RAISE EXCEPTION 'Bir takımın en fazla 3 aktif kaptanı olabilir.';
    END IF;

    -- 8. Re-activate / Upsert Logic:
    -- Eğer kullanıcının bu takımda eski pasif bir rolü varsa UPDATE et,
    -- yoksa yeni INSERT yap. Böylece UNIQUE (user_id, role, team_id) korunur.
    IF EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = p_user_id
          AND role = 'CAPTAIN'
          AND team_id = p_team_id
    ) THEN
        UPDATE user_roles
        SET is_active = true,
            revoked_at = NULL,
            granted_by = auth.uid(),
            granted_at = now()
        WHERE user_id = p_user_id
          AND role = 'CAPTAIN'
          AND team_id = p_team_id;
    ELSE
        INSERT INTO user_roles (
            user_id,
            role,
            team_id,
            is_active,
            granted_by,
            granted_at
        ) VALUES (
            p_user_id,
            'CAPTAIN',
            p_team_id,
            true,
            auth.uid(),
            now()
        );
    END IF;
END;
$$;

-- ============================================================================
-- 2. RPC: public.admin_remove_team_captain(p_team_id uuid, p_user_id uuid)
-- ============================================================================
-- Bir takımın belirli bir aktif kaptanının rolünü pasifize eder (slotu boşaltır).
-- Diğer kaptanların rolüne kesinlikle dokunmaz.
CREATE OR REPLACE FUNCTION public.admin_remove_team_captain(
    p_team_id uuid,
    p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    -- 1. Security Check: Yalnızca aktif ADMIN veya SUPER_ADMIN oturumu
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated: Giriş yapmalısınız.';
    END IF;

    IF NOT (has_role('SUPER_ADMIN') OR has_role('ADMIN')) THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Yalnızca ADMIN veya SUPER_ADMIN kaptanlık yetkisi kaldırabilir.';
    END IF;

    -- 2. Concurrency Control: Takım kaydını kilitleyerek yarış durumlarını önle
    PERFORM 1 FROM teams WHERE id = p_team_id FOR UPDATE;

    -- 3. Hedef kaptan kaydını pasife çek
    UPDATE user_roles
    SET is_active = false,
        revoked_at = now()
    WHERE user_id = p_user_id
      AND role = 'CAPTAIN'
      AND team_id = p_team_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bu kullanıcı belirtilen takımın aktif bir kaptanı değil.';
    END IF;
END;
$$;

-- ============================================================================
-- 3. PERMISSIONS & GRANTS
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.admin_assign_team_captain(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_team_captain(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_remove_team_captain(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_team_captain(uuid, uuid) TO authenticated;
