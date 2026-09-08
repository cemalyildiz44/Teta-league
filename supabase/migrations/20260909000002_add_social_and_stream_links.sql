-- 20260909000002_add_social_and_stream_links.sql
-- Add discord_url and instagram_url to profiles
-- Add stream_url and instagram_url to teams
-- Add RLS policy and RPC for captain team social updates

-- 1. Profiles columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS discord_url TEXT;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS instagram_url TEXT;

COMMENT ON COLUMN public.profiles.discord_url IS 'Discord profile or server invite link';
COMMENT ON COLUMN public.profiles.instagram_url IS 'Instagram profile link';

-- Sync existing discord from social_links jsonb if available
UPDATE public.profiles
SET discord_url = social_links->>'discord'
WHERE discord_url IS NULL 
  AND social_links IS NOT NULL 
  AND social_links->>'discord' IS NOT NULL 
  AND social_links->>'discord' <> '';

-- 2. Teams columns
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS stream_url TEXT;

ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS instagram_url TEXT;

COMMENT ON COLUMN public.teams.stream_url IS 'Live stream URL for team matches (Kick, Twitch, YouTube, etc.)';
COMMENT ON COLUMN public.teams.instagram_url IS 'Team Instagram profile link';

-- 3. RLS policy for captains to update own team
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'teams' AND policyname = 'Captains update own team'
    ) THEN
        CREATE POLICY "Captains update own team"
          ON teams FOR UPDATE TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM user_roles
              WHERE user_roles.user_id = (select auth.uid())
                AND user_roles.team_id = teams.id
                AND user_roles.role = 'CAPTAIN'
                AND user_roles.is_active = true
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM user_roles
              WHERE user_roles.user_id = (select auth.uid())
                AND user_roles.team_id = teams.id
                AND user_roles.role = 'CAPTAIN'
                AND user_roles.is_active = true
            )
          );
    END IF;
END $$;

-- 4. RPC for captain / admin to safely update team social links
CREATE OR REPLACE FUNCTION public.update_team_socials(
    p_team_id UUID,
    p_stream_url TEXT,
    p_instagram_url TEXT
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
        updated_at = now()
    WHERE id = p_team_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_team_socials(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_team_socials(UUID, TEXT, TEXT) TO authenticated;
