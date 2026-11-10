-- 20261110140300_validate_username_changes.sql
-- Registration enforces 3-30 characters of letters, digits, "_", "." and "-", but profile edits and direct
-- signUp calls did not. Enforce the same rule whenever a username is created or changed. Existing usernames
-- that predate the rule are left as they are and keep working until their owner changes them.

CREATE OR REPLACE FUNCTION public.validate_profile_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
        RETURN NEW;
    END IF;

    IF NEW.username IS NULL OR NEW.username !~ '^[a-zA-Z0-9_.-]{3,30}$' THEN
        RAISE EXCEPTION 'INVALID_USERNAME: Kullanıcı adı 3-30 karakter arasında olmalı ve yalnızca harf, rakam, alt çizgi, nokta ve tire içerebilir.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_profile_username() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_profile_username ON public.profiles;
CREATE TRIGGER trg_validate_profile_username
    BEFORE INSERT OR UPDATE OF username ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_profile_username();
