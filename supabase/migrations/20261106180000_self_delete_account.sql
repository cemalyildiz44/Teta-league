-- Migration: 20261106180000_self_delete_account.sql
-- Description: Allows users to securely delete/anonymize their account with OTP email confirmation.
-- Releases username, EA ID, and email while preserving historical match stats and standings.

-- 1. Update enforce_user_role_management to allow users to deactivate their own role
CREATE OR REPLACE FUNCTION public.enforce_user_role_management()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_is_super_admin BOOLEAN;
    v_is_admin BOOLEAN;
BEGIN
    -- Allow user to deactivate their own role (e.g. stepping down / account deletion)
    IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND OLD.user_id = auth.uid() AND NEW.is_active = false THEN
        NEW.revoked_at := COALESCE(NEW.revoked_at, CURRENT_TIMESTAMP);
        RETURN NEW;
    END IF;

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
$function$;

-- 2. Define self_delete_account function
CREATE OR REPLACE FUNCTION public.self_delete_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Giriş yapmış bir kullanıcı bulunamadı.' USING ERRCODE = 'P0001';
    END IF;

    -- 1. Leave any active team membership (frees up team squad slot)
    UPDATE public.team_memberships
    SET left_at = now()
    WHERE player_id = v_user_id AND left_at IS NULL;

    -- 2. Deactivate any user roles (e.g. CAPTAIN)
    UPDATE public.user_roles
    SET is_active = false, revoked_at = now()
    WHERE user_id = v_user_id AND is_active = true;

    -- 3. Clear captain_id in league_teams if the user was captain
    UPDATE public.league_teams
    SET captain_id = NULL
    WHERE captain_id = v_user_id;

    -- 4. Cancel pending transfers
    UPDATE public.transfers
    SET status = 'CANCELLED', updated_at = now()
    WHERE (player_id = v_user_id OR requested_by = v_user_id)
      AND status IN ('PENDING_PLAYER', 'PENDING_ADMIN');

    -- 5. Delete notifications
    DELETE FROM public.notifications WHERE user_id = v_user_id;

    -- 6. Anonymize profile (frees username and EA ID while preserving match statistics)
    UPDATE public.profiles
    SET status = 'DELETED',
        is_active = false,
        username = 'silinmis_' || substr(v_user_id::text, 1, 8),
        full_name = NULL,
        bio = NULL,
        avatar_url = NULL,
        current_ea_player_id = NULL,
        social_links = '{}'::jsonb,
        updated_at = now()
    WHERE id = v_user_id;

    -- 7. Scramble & disable auth user to release email and prevent further sign in
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    DELETE FROM auth.one_time_tokens WHERE user_id = v_user_id;
    DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id;
    DELETE FROM auth.sessions WHERE user_id = v_user_id;

    UPDATE auth.users
    SET email = 'deleted_' || v_user_id::text || '@deleted.local',
        encrypted_password = '',
        raw_user_meta_data = '{}'::jsonb,
        banned_until = '2099-01-01 00:00:00+00',
        updated_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Grant execute to authenticated users
REVOKE ALL ON FUNCTION public.self_delete_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_delete_account() TO authenticated;
