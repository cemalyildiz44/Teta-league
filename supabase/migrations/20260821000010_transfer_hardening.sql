-- 000010_transfer_hardening.sql

-- 1. LEAVE TEAM
CREATE OR REPLACE FUNCTION public.leave_team(p_season_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_player_id UUID;
    v_team_id UUID;
    v_season RECORD;
    v_count INT;
BEGIN
    v_player_id := auth.uid();
    IF v_player_id IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

    SELECT team_id INTO v_team_id
    FROM team_memberships
    WHERE player_id = v_player_id
      AND season_id = p_season_id
      AND left_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active membership not found for this season.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = v_player_id
          AND role = 'CAPTAIN'
          AND team_id = v_team_id
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Captains cannot leave the team directly. Contact an Admin.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM transfer_windows
        WHERE season_id = p_season_id AND is_open = true
    ) THEN
        RAISE EXCEPTION 'Transfer window is closed.';
    END IF;

    SELECT * INTO v_season FROM seasons WHERE id = p_season_id;

    SELECT COUNT(*) INTO v_count
    FROM team_memberships
    WHERE team_id = v_team_id
      AND season_id = p_season_id
      AND left_at IS NULL;

    IF v_count <= v_season.roster_min THEN
        RAISE EXCEPTION 'Cannot leave. Team roster would fall below minimum (%).', v_season.roster_min;
    END IF;

    UPDATE team_memberships
    SET left_at = CURRENT_TIMESTAMP
    WHERE player_id = v_player_id
      AND season_id = p_season_id
      AND team_id = v_team_id
      AND left_at IS NULL;
END;
$$;

-- 2. KICK PLAYER
CREATE OR REPLACE FUNCTION public.kick_player(p_player_id UUID, p_season_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_admin_or_super boolean;
    v_caller_id UUID;
    v_team_id UUID;
    v_season RECORD;
    v_count INT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

    IF v_caller_id = p_player_id THEN
        RAISE EXCEPTION 'You cannot kick yourself. Use leave_team instead.';
    END IF;

    v_admin_or_super := (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

    SELECT team_id INTO v_team_id
    FROM team_memberships
    WHERE player_id = p_player_id
      AND season_id = p_season_id
      AND left_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target player does not have an active membership in this season.';
    END IF;

    IF NOT v_admin_or_super THEN
        IF NOT EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = v_caller_id
              AND role = 'CAPTAIN'
              AND team_id = v_team_id
              AND is_active = true
        ) THEN
            RAISE EXCEPTION 'Only the team captain or an admin can kick this player.';
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = p_player_id
          AND role = 'CAPTAIN'
          AND team_id = v_team_id
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Captains cannot be kicked. Contact an Admin.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM transfer_windows
        WHERE season_id = p_season_id AND is_open = true
    ) THEN
        RAISE EXCEPTION 'Transfer window is closed.';
    END IF;

    SELECT * INTO v_season FROM seasons WHERE id = p_season_id;
    SELECT COUNT(*) INTO v_count
    FROM team_memberships
    WHERE team_id = v_team_id
      AND season_id = p_season_id
      AND left_at IS NULL;

    IF v_count <= v_season.roster_min THEN
        RAISE EXCEPTION 'Cannot kick. Team roster would fall below minimum (%).', v_season.roster_min;
    END IF;

    UPDATE team_memberships
    SET left_at = CURRENT_TIMESTAMP
    WHERE player_id = p_player_id
      AND season_id = p_season_id
      AND team_id = v_team_id
      AND left_at IS NULL;
END;
$$;

-- 3. APPROVE_TRANSFER WITH ROLE SYNC
CREATE OR REPLACE FUNCTION public.approve_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_transfer RECORD;
    v_season RECORD;
    v_league_id UUID;
    v_count INT;
    v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();

    IF NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
        RAISE EXCEPTION 'Unauthorized: ADMIN required.';
    END IF;

    SELECT * INTO v_transfer
    FROM transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF NOT FOUND OR v_transfer.status != 'PENDING_ADMIN' THEN
        RAISE EXCEPTION 'Invalid transfer status.';
    END IF;

    IF v_transfer.from_team_id IS NOT DISTINCT FROM v_transfer.to_team_id THEN
        RAISE EXCEPTION 'Source and target teams cannot be the same.';
    END IF;

    SELECT * INTO v_season FROM seasons WHERE id = v_transfer.season_id;

    IF NOT EXISTS (
        SELECT 1
        FROM transfer_windows
        WHERE id = v_transfer.transfer_window_id AND is_open = true
    ) THEN
        RAISE EXCEPTION 'Window closed.';
    END IF;

    IF v_transfer.from_team_id IS NOT NULL THEN
        IF v_transfer.from_team_id < v_transfer.to_team_id THEN
            PERFORM 1
            FROM league_teams
            WHERE team_id = v_transfer.from_team_id
              AND season_id = v_transfer.season_id
            FOR UPDATE;

            IF NOT FOUND THEN RAISE EXCEPTION 'Source team not active.'; END IF;

            SELECT league_id INTO v_league_id
            FROM league_teams
            WHERE team_id = v_transfer.to_team_id
              AND season_id = v_transfer.season_id
            FOR UPDATE;

            IF NOT FOUND THEN RAISE EXCEPTION 'Target team not active.'; END IF;
        ELSE
            SELECT league_id INTO v_league_id
            FROM league_teams
            WHERE team_id = v_transfer.to_team_id
              AND season_id = v_transfer.season_id
            FOR UPDATE;

            IF NOT FOUND THEN RAISE EXCEPTION 'Target team not active.'; END IF;

            PERFORM 1
            FROM league_teams
            WHERE team_id = v_transfer.from_team_id
              AND season_id = v_transfer.season_id
            FOR UPDATE;

            IF NOT FOUND THEN RAISE EXCEPTION 'Source team not active.'; END IF;
        END IF;
    ELSE
        SELECT league_id INTO v_league_id
        FROM league_teams
        WHERE team_id = v_transfer.to_team_id
          AND season_id = v_transfer.season_id
        FOR UPDATE;

        IF NOT FOUND THEN RAISE EXCEPTION 'Target team not active.'; END IF;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM team_memberships
    WHERE team_id = v_transfer.to_team_id
      AND season_id = v_transfer.season_id
      AND left_at IS NULL;

    IF v_count >= v_season.roster_max THEN
        RAISE EXCEPTION 'Target roster max reached.';
    END IF;

    IF v_transfer.from_team_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM team_memberships
            WHERE player_id = v_transfer.player_id
              AND season_id = v_transfer.season_id
              AND team_id = v_transfer.from_team_id
              AND left_at IS NULL
            FOR UPDATE
        ) THEN
            RAISE EXCEPTION
              'Player is not an active member of the source team in this season.';
        END IF;

        SELECT COUNT(*) INTO v_count
        FROM team_memberships
        WHERE team_id = v_transfer.from_team_id
          AND season_id = v_transfer.season_id
          AND left_at IS NULL;

        IF v_count <= v_season.roster_min THEN
            RAISE EXCEPTION 'Source roster min reached.';
        END IF;

        UPDATE team_memberships
        SET left_at = CURRENT_TIMESTAMP
        WHERE player_id = v_transfer.player_id
          AND season_id = v_transfer.season_id
          AND team_id = v_transfer.from_team_id
          AND left_at IS NULL;

        -- NEW: Revoke CAPTAIN role from the source team
        DELETE FROM user_roles
        WHERE user_id = v_transfer.player_id
          AND role = 'CAPTAIN'
          AND team_id = v_transfer.from_team_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM team_memberships
        WHERE player_id = v_transfer.player_id
          AND season_id = v_transfer.season_id
          AND left_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Player active elsewhere.';
    END IF;

    INSERT INTO team_memberships (
        player_id, team_id, league_id, season_id, joined_at
    )
    VALUES (
        v_transfer.player_id,
        v_transfer.to_team_id,
        v_league_id,
        v_transfer.season_id,
        CURRENT_TIMESTAMP
    );

    UPDATE transfers
    SET status = 'APPROVED',
        admin_id = v_admin_id,
        admin_acted_at = CURRENT_TIMESTAMP,
        effective_at = CURRENT_TIMESTAMP
    WHERE id = p_transfer_id;
END;
$$;

-- Secure the new functions
REVOKE EXECUTE ON FUNCTION public.leave_team(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kick_player(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_team(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kick_player(UUID, UUID) TO authenticated;
