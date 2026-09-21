-- ==============================================================================
-- Migration: 20260921000000_banned_suspended_security.sql
-- Description: Enforce BANNED/SUSPENDED status checks on mutation RPCs and RLS
-- ==============================================================================

-- 1. send_team_invite (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.send_team_invite(p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_captain_team_id UUID;
    v_window RECORD;
    v_league_team RECORD;
    v_existing_membership RECORD;
    v_source_team_id UUID := NULL;
    v_team_name TEXT;
    v_transfer_id UUID;
    v_approved_transfers INT := 0;
    v_pending_transfers INT := 0;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    -- SECURITY HARDENING: Check caller profile status
    IF (SELECT status FROM public.profiles WHERE id = auth.uid()) != 'ACTIVE' THEN
        RAISE EXCEPTION 'Hesabınız aktif olmadığı için bu işlemi yapamazsınız.';
    END IF;

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

    -- Check window (must be open and active)
    SELECT id, season_id INTO v_window
    FROM public.transfer_windows
    WHERE is_open = true
      AND start_date <= CURRENT_TIMESTAMP
      AND end_date >= CURRENT_TIMESTAMP
    ORDER BY start_date DESC, created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active transfer window.';
    END IF;

    -- Validate team in season and acquire row lock to prevent race condition on slots
    SELECT league_id INTO v_league_team
    FROM public.league_teams
    WHERE team_id = v_captain_team_id
      AND season_id = v_window.season_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Your team is not registered in a league for the current season.';
    END IF;

    -- Enforce 5-slot quota per transfer window
    SELECT COUNT(*) INTO v_approved_transfers
    FROM public.transfers
    WHERE to_team_id = v_captain_team_id
      AND transfer_window_id = v_window.id
      AND status = 'APPROVED';

    SELECT COUNT(*) INTO v_pending_transfers
    FROM public.transfers
    WHERE to_team_id = v_captain_team_id
      AND transfer_window_id = v_window.id
      AND status = 'PENDING_PLAYER';

    IF (v_approved_transfers + v_pending_transfers) >= 5 THEN
        RAISE EXCEPTION 'Takımınızın bu transfer dönemi için transfer slotu dolmuştur (Maksimum 5 transfer).';
    END IF;

    -- Check if player exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_player_id) THEN
        RAISE EXCEPTION 'Player not found.';
    END IF;

    -- Check player's current membership to check and get source team
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

    -- Check duplicate pending invite
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


-- 2. accept_team_invite (SECURITY DEFINER)
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

    -- SECURITY HARDENING: Check caller profile status
    IF (SELECT status FROM public.profiles WHERE id = auth.uid()) != 'ACTIVE' THEN
        RAISE EXCEPTION 'Hesabınız aktif olmadığı için bu işlemi yapamazsınız.';
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

    -- Roster Max Check
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

    -- Lock player's current membership
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

    -- SECURITY HARDENING: Check caller profile status
    IF (SELECT status FROM public.profiles WHERE id = auth.uid()) != 'ACTIVE' THEN
        RAISE EXCEPTION 'Hesabınız aktif olmadığı için bu işlemi yapamazsınız.';
    END IF;

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

    -- SECURITY HARDENING: Check caller profile status
    IF (SELECT status FROM public.profiles WHERE id = auth.uid()) != 'ACTIVE' THEN
        RAISE EXCEPTION 'Hesabınız aktif olmadığı için bu işlemi yapamazsınız.';
    END IF;

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


-- 5. KICK PLAYER
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

    -- SECURITY HARDENING: Check caller profile status
    IF (SELECT status FROM public.profiles WHERE id = v_caller_id) != 'ACTIVE' THEN
        RAISE EXCEPTION 'Hesabınız aktif olmadığı için bu işlemi yapamazsınız.';
    END IF;

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


-- 6. SOCIAL RLS HARDENING

DROP POLICY IF EXISTS "Users insert posts" ON public.posts;
CREATE POLICY "Users insert posts"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = author_id 
    AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
  );

DROP POLICY IF EXISTS "Users update own posts" ON public.posts;
CREATE POLICY "Users update own posts"
  ON public.posts FOR UPDATE TO authenticated
  USING ((select auth.uid()) = author_id)
  WITH CHECK (
    (select auth.uid()) = author_id
    AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
  );

DROP POLICY IF EXISTS "Users insert comments" ON public.comments;
CREATE POLICY "Users insert comments"
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = author_id
    AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
  );

DROP POLICY IF EXISTS "Users update own comments" ON public.comments;
CREATE POLICY "Users update own comments"
  ON public.comments FOR UPDATE TO authenticated
  USING ((select auth.uid()) = author_id)
  WITH CHECK (
    (select auth.uid()) = author_id
    AND (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ACTIVE'
  );

-- Revoke and Grant execution rights just in case
REVOKE EXECUTE ON FUNCTION public.send_team_invite(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_team_invite(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_team_invite(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_team_invite(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kick_player(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.send_team_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_team_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_team_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kick_player(UUID, UUID) TO authenticated;
