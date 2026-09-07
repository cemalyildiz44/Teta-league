-- 000012_team_creation.sql

-- 1. Patch the trigger function to allow bypass from trusted SECURITY DEFINER RPCs
CREATE OR REPLACE FUNCTION public.enforce_user_role_management()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_super_admin BOOLEAN;
    v_is_admin BOOLEAN;
BEGIN
    -- Allow trusted internal RPCs to bypass this trigger safely
    IF current_setting('app.bypass_role_trigger', true) = 'true' THEN
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
        IF NEW.role = 'CAPTAIN' AND NEW.team_id IS NULL THEN
            RAISE EXCEPTION 'CAPTAIN role requires team_id.';
        END IF;
        IF NEW.role <> 'CAPTAIN' AND NEW.team_id IS NOT NULL THEN
            RAISE EXCEPTION 'Only CAPTAIN may have team_id.';
        END IF;
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
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


-- 2. Create the Team Creation RPC
CREATE OR REPLACE FUNCTION public.create_user_team(
    p_name TEXT,
    p_slug TEXT,
    p_ea_club_id BIGINT,
    p_logo_url TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_team_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated users cannot create teams.';
    END IF;

    -- 1. Check if user is already an active CAPTAIN
    IF EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = v_user_id 
          AND role = 'CAPTAIN' 
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'User is already a captain of an active team.';
    END IF;

    -- 2. Insert team (slug and ea_club_id unique constraints will handle duplicates automatically)
    INSERT INTO teams (name, slug, ea_club_id, logo_url, is_active)
    VALUES (p_name, p_slug, p_ea_club_id, p_logo_url, true)
    RETURNING id INTO v_team_id;

    -- 3. Temporarily bypass the trigger and insert the CAPTAIN role
    PERFORM set_config('app.bypass_role_trigger', 'true', true);

    INSERT INTO user_roles (user_id, role, team_id, is_active, granted_by)
    VALUES (v_user_id, 'CAPTAIN', v_team_id, true, v_user_id);

    -- 4. Reset config (though it resets automatically at the end of the transaction due to the 3rd param 'true')
    PERFORM set_config('app.bypass_role_trigger', 'false', true);

    RETURN v_team_id;
END;
$$;

-- Do NOT grant to public, only to authenticated
REVOKE EXECUTE ON FUNCTION public.create_user_team(TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_user_team(TEXT, TEXT, BIGINT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_user_team(TEXT, TEXT, BIGINT, TEXT) TO authenticated;
