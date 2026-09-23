-- 20260923153000_fix_super_admin_role_delete_and_atomic_force_delete.sql
-- TETA LEAGUE: Fix SUPER_ADMIN role delete trigger bug & add atomic test team force delete RPC

-- ============================================================================
-- 1. PATCH TRIGGER: enforce_user_role_management()
-- ============================================================================
-- Fixes PostgreSQL runtime error "record 'new' is not assigned yet" by evaluating
-- TG_OP = 'DELETE' at the top of the SUPER_ADMIN block before accessing NEW.role.
CREATE OR REPLACE FUNCTION public.enforce_user_role_management()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_super_admin BOOLEAN;
    v_is_admin BOOLEAN;
BEGIN
    -- Only the auth signup trigger runs without an authenticated actor.
    IF auth.uid() IS NULL THEN
        IF TG_OP = 'INSERT' AND NEW.role = 'PLAYER' THEN
            NEW.is_active := true;
            NEW.revoked_at := NULL;
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Unauthenticated role mutation is not allowed.';
    END IF;

    v_is_super_admin := has_role('SUPER_ADMIN');
    v_is_admin := has_role('ADMIN');

    IF v_is_super_admin THEN
        -- CRITICAL BUG FIX: TG_OP = 'DELETE' must be evaluated before accessing NEW fields.
        -- In PostgreSQL row-level DELETE triggers, NEW is unassigned (indeterminate).
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;

        IF NEW.role = 'CAPTAIN' AND NEW.team_id IS NULL THEN
            RAISE EXCEPTION 'CAPTAIN role requires team_id.';
        END IF;
        IF NEW.role <> 'CAPTAIN' AND NEW.team_id IS NOT NULL THEN
            RAISE EXCEPTION 'Only CAPTAIN may have team_id.';
        END IF;
        IF NEW.is_active = false THEN
            NEW.revoked_at := COALESCE(NEW.revoked_at, CURRENT_TIMESTAMP);
        ELSIF NEW.is_active = true THEN
            NEW.revoked_at := NULL;
        END IF;
        RETURN NEW;
    END IF;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only ADMIN or SUPER_ADMIN may manage user roles.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'SUPER_ADMIN' THEN
            RAISE EXCEPTION 'ADMIN cannot grant SUPER_ADMIN.';
        END IF;
        IF NEW.role = 'CAPTAIN' AND NEW.team_id IS NULL THEN
            RAISE EXCEPTION 'CAPTAIN role requires team_id.';
        END IF;
        IF NEW.role <> 'CAPTAIN' AND NEW.team_id IS NOT NULL THEN
            RAISE EXCEPTION 'Only CAPTAIN may have team_id.';
        END IF;
        NEW.granted_by := auth.uid();
        IF NEW.is_active = false THEN
            NEW.revoked_at := COALESCE(NEW.revoked_at, CURRENT_TIMESTAMP);
        ELSE
            NEW.revoked_at := NULL;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.role = 'SUPER_ADMIN' OR NEW.role = 'SUPER_ADMIN' THEN
            RAISE EXCEPTION 'ADMIN cannot modify or create SUPER_ADMIN roles.';
        END IF;
        IF NEW.role = 'CAPTAIN' AND NEW.team_id IS NULL THEN
            RAISE EXCEPTION 'CAPTAIN role requires team_id.';
        END IF;
        IF NEW.role <> 'CAPTAIN' AND NEW.team_id IS NOT NULL THEN
            RAISE EXCEPTION 'Only CAPTAIN may have team_id.';
        END IF;
        NEW.granted_by := auth.uid();
        IF NEW.is_active = false THEN
            NEW.revoked_at := COALESCE(NEW.revoked_at, CURRENT_TIMESTAMP);
        ELSE
            NEW.revoked_at := NULL;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.role = 'SUPER_ADMIN' THEN
            RAISE EXCEPTION 'ADMIN cannot delete SUPER_ADMIN roles.';
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_user_role_management() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. ATOMIC RPC: force_delete_test_team(p_team_id uuid)
-- ============================================================================
-- Executes all safety guards and physical cascade deletion inside a single
-- atomic PostgreSQL transaction with caller's security context (SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.force_delete_test_team(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_caller_id uuid;
    v_is_super_admin boolean;
    v_team record;
    v_match_count integer;
    v_fixture_count integer;
    v_stat_count integer;
    v_team_season_stat_count integer;
    v_player_season_stat_count integer;
    v_tour_winner_count integer;
    v_legacy_count integer;
    v_deleted_transfers integer := 0;
    v_deleted_memberships integer := 0;
    v_deleted_penalties integer := 0;
    v_deleted_roles integer := 0;
    v_deleted_leagues integer := 0;
BEGIN
    -- 1. Authentication check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Only active SUPER_ADMIN can permanently delete a test team.';
    END IF;

    -- 2. Caller active SUPER_ADMIN check (Strict role and revocation verification)
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_caller_id
          AND role = 'SUPER_ADMIN'
          AND is_active = true
          AND revoked_at IS NULL
    ) INTO v_is_super_admin;

    IF NOT v_is_super_admin THEN
        RAISE EXCEPTION 'Only active SUPER_ADMIN can permanently delete a test team.';
    END IF;

    -- 3. Input validation & Strict Test Team Allowlist Guard
    IF p_team_id IS NULL THEN
        RAISE EXCEPTION 'Takım ID zorunludur.';
    END IF;

    IF p_team_id NOT IN (
        'e9415213-c11c-497e-836f-f6354539ad4a'::uuid, -- Teta FC
        'd0f69110-5fff-4e83-bfdb-c0fbe0f5ae9f'::uuid  -- Teta Test FC
    ) THEN
        RAISE EXCEPTION 'Bu RPC yalnızca onaylanmış TETA test takımları için kullanılabilir.';
    END IF;

    -- 4. Target team existence check
    SELECT id, name, slug, logo_url, is_active
    INTO v_team
    FROM public.teams
    WHERE id = p_team_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hedef takım bulunamadı.';
    END IF;

    -- Guard B: Team must be explicitly inactive (archived)
    IF v_team.is_active IS NOT FALSE THEN
        RAISE EXCEPTION 'Yalnızca pasife alınmış (is_active = false) test takımları silinebilir. Lütfen önce takımı arşivleyin.';
    END IF;

    -- Guard C: Official competitive history check (Must be strictly 0)
    SELECT count(*) INTO v_match_count
    FROM public.matches
    WHERE home_team_id = p_team_id OR away_team_id = p_team_id;

    SELECT count(*) INTO v_fixture_count
    FROM public.fixtures
    WHERE home_team_id = p_team_id OR away_team_id = p_team_id;

    SELECT count(*) INTO v_stat_count
    FROM public.match_player_stats
    WHERE team_id = p_team_id;

    SELECT count(*) INTO v_team_season_stat_count
    FROM public.team_season_stats
    WHERE team_id = p_team_id;

    SELECT count(*) INTO v_player_season_stat_count
    FROM public.player_team_season_stats
    WHERE team_id = p_team_id;

    IF v_match_count > 0 OR v_fixture_count > 0 OR v_stat_count > 0 
       OR v_team_season_stat_count > 0 OR v_player_season_stat_count > 0 THEN
        RAISE EXCEPTION 'Bu takımın resmi geçmişi bulunduğu için fiziksel olarak silinemez.';
    END IF;

    -- Guard D: Tournament winner and legacy career checks
    SELECT count(*) INTO v_tour_winner_count
    FROM public.tournament_winners
    WHERE team_id = p_team_id;

    SELECT count(*) INTO v_legacy_count
    FROM public.player_legacy_career_stats
    WHERE team_id = p_team_id;

    IF v_tour_winner_count > 0 OR v_legacy_count > 0 THEN
        RAISE EXCEPTION 'Bu takımın turnuva veya kariyer geçmişi bulunduğu için fiziksel olarak silinemez.';
    END IF;

    -- 5. Execution of physical deletion in FK-safe order
    -- Step 1: Transfers (only involving target test team; other teams untouched)
    WITH deleted AS (
        DELETE FROM public.transfers
        WHERE from_team_id = p_team_id OR to_team_id = p_team_id
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_transfers FROM deleted;

    -- Step 2: Team Memberships (only for target team; player profiles untouched)
    WITH deleted AS (
        DELETE FROM public.team_memberships
        WHERE team_id = p_team_id
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_memberships FROM deleted;

    -- Step 3: Team Penalties
    WITH deleted AS (
        DELETE FROM public.team_penalties
        WHERE team_id = p_team_id
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_penalties FROM deleted;

    -- Step 4: User Roles (only CAPTAIN roles associated with this team)
    WITH deleted AS (
        DELETE FROM public.user_roles
        WHERE team_id = p_team_id
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_roles FROM deleted;

    -- Step 5: League Teams
    WITH deleted AS (
        DELETE FROM public.league_teams
        WHERE team_id = p_team_id
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_leagues FROM deleted;

    -- Step 6: Teams (The team record itself)
    DELETE FROM public.teams
    WHERE id = p_team_id;

    RETURN jsonb_build_object(
        'success', true,
        'team_id', p_team_id,
        'team_name', v_team.name,
        'team_slug', v_team.slug,
        'logo_url', v_team.logo_url,
        'deleted_transfers', v_deleted_transfers,
        'deleted_memberships', v_deleted_memberships,
        'deleted_penalties', v_deleted_penalties,
        'deleted_roles', v_deleted_roles,
        'deleted_leagues', v_deleted_leagues
    );
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_test_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_delete_test_team(uuid) TO authenticated;
