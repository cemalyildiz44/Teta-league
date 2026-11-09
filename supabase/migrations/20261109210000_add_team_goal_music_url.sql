-- 20261109210000_add_team_goal_music_url.sql
-- Add goal_music_url column to public.teams and update update_team_socials RPC

-- 1. Add goal_music_url to teams
ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS goal_music_url TEXT;

COMMENT ON COLUMN public.teams.goal_music_url IS 'Team goal celebration music URL (YouTube, Spotify, SoundCloud, etc.)';

-- 2. Drop old 3-arg signature to prevent overload ambiguity
DROP FUNCTION IF EXISTS public.update_team_socials(UUID, TEXT, TEXT);

-- 3. Create updated RPC for captain / admin to update team social & goal music links
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

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109210000', 'add_team_goal_music_url')
ON CONFLICT (version) DO NOTHING;
