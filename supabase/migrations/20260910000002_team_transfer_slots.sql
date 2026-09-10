-- ==============================================================================
-- Migration: 20260910000002_team_transfer_slots.sql
-- Description: Team Transfer Slot System (5/5 quota, post-window accounting)
-- ==============================================================================

-- 1. Helper function: get_team_transfer_slots
-- Calculates team transfer slot balance:
-- - While window is OPEN: displays 5/5 (transfers do not decrease display)
-- - While window is CLOSED: displays 5 - (approved transfers in that window)
-- - When NEW window opens: resets automatically to 5/5
CREATE OR REPLACE FUNCTION public.get_team_transfer_slots(
    p_team_id UUID,
    p_season_id UUID DEFAULT NULL
)
RETURNS TABLE (
    total_slots INT,
    used_slots INT,
    remaining_slots INT,
    is_window_open BOOLEAN,
    window_id UUID,
    window_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_season_id UUID := p_season_id;
    v_window RECORD;
    v_approved_count INT := 0;
BEGIN
    -- 1. Resolve season if not provided
    IF v_season_id IS NULL THEN
        SELECT id INTO v_season_id
        FROM public.seasons
        WHERE status = 'ACTIVE'
        LIMIT 1;

        IF v_season_id IS NULL THEN
            SELECT id INTO v_season_id
            FROM public.seasons
            ORDER BY created_at DESC
            LIMIT 1;
        END IF;
    END IF;

    IF v_season_id IS NULL THEN
        RETURN QUERY SELECT 5, 0, 5, false, NULL::UUID, 'Sezon Bulunamadı'::TEXT;
        RETURN;
    END IF;

    -- 2. Check for currently open/active transfer window
    SELECT id, name, is_open, start_date, end_date
    INTO v_window
    FROM public.transfer_windows
    WHERE season_id = v_season_id
      AND is_open = true
      AND start_date <= CURRENT_TIMESTAMP
      AND end_date >= CURRENT_TIMESTAMP
    ORDER BY start_date DESC, created_at DESC
    LIMIT 1;

    -- Rule 1: Transfer dönemi açıkken slot 5/5 gösterilir.
    IF FOUND THEN
        RETURN QUERY SELECT 5, 0, 5, true, v_window.id, v_window.name;
        RETURN;
    END IF;

    -- Rule 2: Transfer dönemi kapalıyken en son penceredeki APPROVED transferler slot tüketir.
    SELECT id, name, is_open, start_date, end_date
    INTO v_window
    FROM public.transfer_windows
    WHERE season_id = v_season_id
    ORDER BY start_date DESC, created_at DESC
    LIMIT 1;

    IF FOUND THEN
        SELECT COUNT(*)::INT INTO v_approved_count
        FROM public.transfers
        WHERE to_team_id = p_team_id
          AND transfer_window_id = v_window.id
          AND status = 'APPROVED';

        RETURN QUERY SELECT 
            5, 
            v_approved_count, 
            GREATEST(0, 5 - v_approved_count), 
            false, 
            v_window.id, 
            v_window.name;
        RETURN;
    END IF;

    -- Varsayılan: Henüz pencere tanımlanmamışsa 5/5
    RETURN QUERY SELECT 5, 0, 5, false, NULL::UUID, 'Pencere Yok'::TEXT;
    RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_team_transfer_slots(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_transfer_slots(UUID, UUID) TO anon, authenticated;


-- 2. Update send_team_invite to enforce max 5 transfers per transfer window
-- and lock league_teams row FOR UPDATE to prevent concurrency race conditions.
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
