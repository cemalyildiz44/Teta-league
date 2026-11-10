-- 20261110160000_validate_team_social_urls.sql
-- update_team_socials() stored whatever links it was given; only the site form checked them. A captain calling
-- the RPC directly could save non-http(s) or very long values. Same body as 20261109210000 plus URL checks.
-- Empty strings are stored as NULL, matching what the form sends for a cleared field.

CREATE OR REPLACE FUNCTION public.update_team_socials(
    p_team_id UUID,
    p_stream_url TEXT,
    p_instagram_url TEXT,
    p_goal_music_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_is_captain BOOLEAN;
    v_is_admin BOOLEAN;
    v_url TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = v_user_id
          AND team_id = p_team_id
          AND role = 'CAPTAIN'
          AND is_active = true
    ) INTO v_is_captain;

    v_is_admin := (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

    IF NOT (v_is_captain OR v_is_admin) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bu takımın bağlantılarını düzenleme yetkiniz yok.');
    END IF;

    p_stream_url := NULLIF(btrim(p_stream_url), '');
    p_instagram_url := NULLIF(btrim(p_instagram_url), '');
    p_goal_music_url := NULLIF(btrim(p_goal_music_url), '');

    FOREACH v_url IN ARRAY ARRAY[p_stream_url, p_instagram_url, p_goal_music_url] LOOP
        IF v_url IS NOT NULL AND (v_url !~* '^https?://[^\s/]+' OR length(v_url) > 500 OR v_url ~ '\s') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Bağlantılar http:// veya https:// ile başlayan, boşluk içermeyen ve en fazla 500 karakterlik adresler olmalıdır.');
        END IF;
    END LOOP;

    UPDATE public.teams
    SET stream_url = p_stream_url,
        instagram_url = p_instagram_url,
        goal_music_url = p_goal_music_url,
        updated_at = now()
    WHERE id = p_team_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_team_socials(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_team_socials(UUID, TEXT, TEXT, TEXT) TO authenticated;
