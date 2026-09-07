-- ==============================================================================
-- Migration: 20260821000011_team_invite_rpcs.sql
-- Description: Implement secure 2-step transfer flow (RPC-based, ACID)
-- ==============================================================================

-- 1. Update enforce_transfer_flow() to allow RPCs to bypass ADMIN restriction
-- if the actor matches the appropriate transfer field.
CREATE OR REPLACE FUNCTION public.enforce_transfer_flow()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.from_team_id IS NOT DISTINCT FROM NEW.to_team_id THEN
            RAISE EXCEPTION 'Source and target teams cannot be the same.';
        END IF;

        IF NEW.from_team_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1
                FROM team_memberships
                WHERE player_id = NEW.player_id
                  AND season_id = NEW.season_id
                  AND team_id = NEW.from_team_id
                  AND left_at IS NULL
            ) THEN
                RAISE EXCEPTION
                  'Player must be an active member of from_team_id in this season.';
            END IF;
        END IF;

        IF NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
            IF auth.uid() IS NOT NULL
               AND NEW.requested_by != auth.uid() THEN
                RAISE EXCEPTION 'requested_by must be current user';
            END IF;

            IF NEW.status != 'PENDING_PLAYER' THEN
                RAISE EXCEPTION 'New transfers must be PENDING_PLAYER';
            END IF;

            IF NEW.admin_id IS NOT NULL OR NEW.admin_acted_at IS NOT NULL THEN
                RAISE EXCEPTION 'Cannot set admin fields on insert';
            END IF;

            IF NEW.player_responded_at IS NOT NULL OR NEW.player_note IS NOT NULL THEN
                RAISE EXCEPTION 'Cannot set player response fields on insert';
            END IF;

            IF NEW.effective_at IS NOT NULL THEN
                RAISE EXCEPTION 'Cannot set effective_at on insert';
            END IF;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'APPROVED' AND OLD.status != 'APPROVED' THEN
            -- Allow if it is the player accepting their own transfer, OR an admin.
            IF NOT ( (auth.uid() IS NOT NULL AND auth.uid() = NEW.player_id) OR has_role('ADMIN') OR has_role('SUPER_ADMIN') ) THEN
                RAISE EXCEPTION 'Only the player or ADMIN can approve this transfer.';
            END IF;
        END IF;
        
        IF NEW.status = 'REJECTED' AND OLD.status != 'REJECTED' THEN
            IF NOT ( (auth.uid() IS NOT NULL AND auth.uid() = NEW.player_id) OR has_role('ADMIN') OR has_role('SUPER_ADMIN') ) THEN
                RAISE EXCEPTION 'Only the player or ADMIN can reject this transfer.';
            END IF;
        END IF;
        
        IF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN
            IF NOT ( (auth.uid() IS NOT NULL AND auth.uid() = NEW.requested_by) OR has_role('ADMIN') OR has_role('SUPER_ADMIN') ) THEN
                RAISE EXCEPTION 'Only the sender (Captain) or ADMIN can cancel this transfer.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


-- 2. accept_team_invite (SECURITY DEFINER)
-- ACID Transaction for Accept
CREATE OR REPLACE FUNCTION public.accept_team_invite(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_transfer RECORD;
    v_current_membership RECORD;
    v_league_id UUID;
    v_season_max INT;
    v_count INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Lock the transfer
    SELECT * INTO v_transfer
    FROM public.transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Transfer not found'; 
    END IF;

    IF v_transfer.player_id != auth.uid() THEN 
        RAISE EXCEPTION 'Unauthorized: Not your transfer'; 
    END IF;

    IF v_transfer.status != 'PENDING_PLAYER' THEN
        RAISE EXCEPTION 'Transfer is no longer valid or has already been responded to.';
    END IF;

    -- Check target league_team
    SELECT league_id INTO v_league_id
    FROM public.league_teams
    WHERE team_id = v_transfer.to_team_id
      AND season_id = v_transfer.season_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target team is not active in this season.';
    END IF;

    -- Check target roster limits
    SELECT roster_max INTO v_season_max
    FROM public.seasons
    WHERE id = v_transfer.season_id;
    
    SELECT COUNT(*) INTO v_count
    FROM public.team_memberships
    WHERE team_id = v_transfer.to_team_id
      AND season_id = v_transfer.season_id
      AND left_at IS NULL;
      
    IF v_count >= v_season_max THEN
        RAISE EXCEPTION 'Target roster max reached.';
    END IF;

    -- Lock current membership if any
    SELECT id, team_id INTO v_current_membership
    FROM public.team_memberships
    WHERE player_id = auth.uid()
      AND left_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
        IF v_current_membership.team_id = v_transfer.to_team_id THEN
            RAISE EXCEPTION 'You are already in this team.';
        END IF;
        
        -- Close the specific old membership
        UPDATE public.team_memberships
        SET left_at = CURRENT_TIMESTAMP
        WHERE id = v_current_membership.id;
    END IF;

    -- Insert new membership
    INSERT INTO public.team_memberships (
        player_id, team_id, league_id, season_id, joined_at
    ) VALUES (
        auth.uid(),
        v_transfer.to_team_id,
        v_league_id,
        v_transfer.season_id,
        CURRENT_TIMESTAMP
    );

    -- Update transfer
    UPDATE public.transfers
    SET status = 'APPROVED',
        player_responded_at = CURRENT_TIMESTAMP,
        effective_at = CURRENT_TIMESTAMP
    WHERE id = p_transfer_id;

    -- Update existing TRANSFER_OFFER notification
    UPDATE public.notifications
    SET is_read = true
    WHERE reference_id = p_transfer_id
      AND type = 'TRANSFER_OFFER'
      AND user_id = auth.uid();

    -- Create TRANSFER_ACCEPTED notification for captain
    INSERT INTO public.notifications (
        user_id, type, title, body, reference_type, reference_id, is_read
    ) VALUES (
        v_transfer.requested_by,
        'TRANSFER_ACCEPTED',
        'Davet Kabul Edildi',
        'Bir oyuncu takım davetinizi kabul etti.',
        'TRANSFER',
        p_transfer_id,
        false
    );

END;
$$;


-- 3. reject_team_invite (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.reject_team_invite(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_transfer RECORD;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_transfer
    FROM public.transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
    IF v_transfer.player_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF v_transfer.status != 'PENDING_PLAYER' THEN
        RAISE EXCEPTION 'Transfer is no longer valid.';
    END IF;

    UPDATE public.transfers
    SET status = 'REJECTED',
        player_responded_at = CURRENT_TIMESTAMP
    WHERE id = p_transfer_id;

    UPDATE public.notifications
    SET is_read = true
    WHERE reference_id = p_transfer_id
      AND type = 'TRANSFER_OFFER'
      AND user_id = auth.uid();

    INSERT INTO public.notifications (
        user_id, type, title, body, reference_type, reference_id, is_read
    ) VALUES (
        v_transfer.requested_by,
        'TRANSFER_REJECTED',
        'Davet Reddedildi',
        'Bir oyuncu takım davetinizi reddetti.',
        'TRANSFER',
        p_transfer_id,
        false
    );
END;
$$;


-- 4. cancel_team_invite (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.cancel_team_invite(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_transfer RECORD;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_transfer
    FROM public.transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
    IF v_transfer.requested_by != auth.uid() THEN RAISE EXCEPTION 'Unauthorized: Not your invite'; END IF;
    IF v_transfer.status != 'PENDING_PLAYER' THEN
        RAISE EXCEPTION 'Invite cannot be cancelled at this state.';
    END IF;

    UPDATE public.transfers
    SET status = 'CANCELLED'
    WHERE id = p_transfer_id;

    UPDATE public.notifications
    SET is_read = true
    WHERE reference_id = p_transfer_id
      AND type = 'TRANSFER_OFFER'
      AND user_id = v_transfer.player_id;
END;
$$;


-- 5. send_team_invite (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.send_team_invite(p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_captain_team_id UUID;
    v_window RECORD;
    v_league_team RECORD;
    v_existing_membership RECORD;
    v_source_team_id UUID := NULL;
    v_team_name TEXT;
    v_transfer_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF auth.uid() = p_player_id THEN RAISE EXCEPTION 'You cannot invite yourself.'; END IF;

    -- Validate Captain
    SELECT team_id INTO v_captain_team_id
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'CAPTAIN'
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'You must be an active captain to send an invite.';
    END IF;

    -- Check window
    SELECT id, season_id INTO v_window
    FROM public.transfer_windows
    WHERE is_open = true
      AND start_date <= CURRENT_TIMESTAMP
      AND end_date >= CURRENT_TIMESTAMP
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active transfer window.';
    END IF;

    -- Validate team in season
    SELECT league_id INTO v_league_team
    FROM public.league_teams
    WHERE team_id = v_captain_team_id
      AND season_id = v_window.season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Your team is not registered in a league for the current season.';
    END IF;

    -- Check if player exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_player_id) THEN
        RAISE EXCEPTION 'Player not found.';
    END IF;

    -- Lock player's current membership to check and get source team
    -- We don't necessarily need to lock FOR UPDATE just to check, but let's be safe.
    SELECT id, team_id INTO v_existing_membership
    FROM public.team_memberships
    WHERE player_id = p_player_id
      AND left_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_membership.team_id = v_captain_team_id THEN
            RAISE EXCEPTION 'Player is already in your team.';
        END IF;
        v_source_team_id := v_existing_membership.team_id;
    END IF;

    -- Check duplicate pending invite lock
    IF EXISTS (
        SELECT 1
        FROM public.transfers
        WHERE player_id = p_player_id
          AND to_team_id = v_captain_team_id
          AND status = 'PENDING_PLAYER'
        FOR UPDATE
    ) THEN
        RAISE EXCEPTION 'A pending invite to this player already exists.';
    END IF;

    -- Insert Transfer
    INSERT INTO public.transfers (
        transfer_window_id, season_id, player_id, from_team_id, to_team_id, requested_by, status
    ) VALUES (
        v_window.id, v_window.season_id, p_player_id, v_source_team_id, v_captain_team_id, auth.uid(), 'PENDING_PLAYER'
    ) RETURNING id INTO v_transfer_id;

    -- Get team name for notification
    SELECT name INTO v_team_name FROM public.teams WHERE id = v_captain_team_id;

    -- Insert Notification
    INSERT INTO public.notifications (
        user_id, type, title, body, reference_type, reference_id, is_read
    ) VALUES (
        p_player_id,
        'TRANSFER_OFFER',
        'Takım Daveti',
        COALESCE(v_team_name, 'Bir takım') || ' seni kadrosuna davet etti.',
        'TRANSFER',
        v_transfer_id,
        false
    );

END;
$$;


-- 6. Permissions Revoke/Grant
REVOKE EXECUTE ON FUNCTION public.accept_team_invite(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_team_invite(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_team_invite(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_team_invite(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.accept_team_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_team_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_team_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_team_invite(UUID) TO authenticated;
