-- 20261110120000_protect_profile_moderation_fields.sql
-- "Users update own profile" lets a player update every column of their own profiles row through the Data API.
-- Moderation and registration fields (status, is_active, beta_registered) must only change through admins or
-- trusted SECURITY DEFINER RPCs (e.g. self_delete_account), otherwise a BANNED/SUSPENDED player could lift
-- their own restriction with the public anon key.

CREATE OR REPLACE FUNCTION public.protect_profile_moderation_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Direct Data API writes run as "authenticated". SECURITY DEFINER RPCs run as their owner and
    -- service_role / postgres sessions are trusted, so only the authenticated role is restricted here.
    -- This function must stay SECURITY INVOKER, otherwise current_user would always be the owner.
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    IF has_role('ADMIN') OR has_role('SUPER_ADMIN') THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.beta_registered IS DISTINCT FROM OLD.beta_registered
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'PROFILE_PROTECTED_FIELD: Hesap durumu alanları yalnızca yöneticiler tarafından değiştirilebilir.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_profile_moderation_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_profile_moderation_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_moderation_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_moderation_fields();
