-- Migration: 20261103030000_get_team_captains.sql
-- Description: Adds a public-safe RPC to retrieve active team captains for team profile pages.

CREATE OR REPLACE FUNCTION public.get_team_captains(p_team_id uuid)
RETURNS TABLE (
    user_id uuid,
    username text,
    full_name text,
    avatar_url text,
    granted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        ur.user_id,
        p.username,
        p.full_name,
        p.avatar_url,
        ur.granted_at
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.team_id = p_team_id
      AND ur.role = 'CAPTAIN'
      AND ur.is_active = true
      AND ur.revoked_at IS NULL
      AND p.is_active = true
      AND p.status = 'ACTIVE'
    ORDER BY ur.granted_at ASC;
$$;

-- Allow public and authenticated callers to execute get_team_captains
REVOKE ALL ON FUNCTION public.get_team_captains(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_captains(uuid) TO anon, authenticated, service_role;
