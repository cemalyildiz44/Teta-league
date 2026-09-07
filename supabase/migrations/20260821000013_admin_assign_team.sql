-- 000013_admin_assign_team.sql

CREATE OR REPLACE FUNCTION public.admin_assign_team_to_league(
    p_team_id UUID,
    p_league_id UUID,
    p_season_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_captain_id UUID;
    v_roster_max INT;
    v_current_roster INT;
BEGIN
    -- 1. Security Check: Only Admin/Super Admin
    IF NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
        RAISE EXCEPTION 'Unauthorized: ADMIN required.';
    END IF;

    -- 2. Insert into league_teams (will throw 23505 if duplicate)
    INSERT INTO league_teams (league_id, season_id, team_id)
    VALUES (p_league_id, p_season_id, p_team_id);

    -- 3. Auto-roster the captain
    -- Find active captain
    SELECT user_id INTO v_captain_id
    FROM user_roles
    WHERE team_id = p_team_id
      AND role = 'CAPTAIN'
      AND is_active = true
    LIMIT 1;

    IF v_captain_id IS NOT NULL THEN
        -- Check if captain is already in ANY team this season
        IF NOT EXISTS (
            SELECT 1 FROM team_memberships 
            WHERE player_id = v_captain_id 
              AND season_id = p_season_id 
              AND left_at IS NULL
        ) THEN
            -- Check roster max
            SELECT roster_max INTO v_roster_max FROM seasons WHERE id = p_season_id;
            SELECT COUNT(*) INTO v_current_roster FROM team_memberships 
            WHERE team_id = p_team_id AND season_id = p_season_id AND left_at IS NULL;

            IF v_current_roster < COALESCE(v_roster_max, 30) THEN
                INSERT INTO team_memberships (player_id, team_id, league_id, season_id)
                VALUES (v_captain_id, p_team_id, p_league_id, p_season_id);
            END IF;
        END IF;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_assign_team_to_league(UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_assign_team_to_league(UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_team_to_league(UUID, UUID, UUID) TO authenticated;
