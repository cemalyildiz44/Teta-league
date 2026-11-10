-- 20261110140200_require_otp_for_self_delete.sql
-- The /profil delete flow verifies an email OTP before calling self_delete_account(), but the RPC itself did not,
-- so anyone holding a session (e.g. a stolen password login) could delete the account by calling it directly.
-- Same body as 20261106180000_self_delete_account.sql plus a check on the JWT's authentication methods (amr).

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

    -- The session must come from an email OTP verified in the last 15 minutes (the /profil delete flow calls
    -- verifyOtp right before this RPC). A stolen password session alone cannot delete the account.
    IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(auth.jwt() -> 'amr', '[]'::jsonb)) AS amr
        WHERE amr ->> 'method' IN ('otp', 'magiclink')
          AND (amr ->> 'timestamp')::bigint >= extract(epoch FROM now() - interval '15 minutes')
    ) THEN
        RAISE EXCEPTION 'Hesap silme için e-posta doğrulaması gerekiyor. Lütfen yeni bir doğrulama kodu isteyin.' USING ERRCODE = 'P0001';
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
    DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id::text;
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

REVOKE ALL ON FUNCTION public.self_delete_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_delete_account() TO authenticated;
