-- ==============================================================================
-- Migration: 20261117120000_first_timer_transfer_quota.sql
-- Description: Players who have never played for any team on TETA League (current or archived seasons)
--              do not use a team's transfer slot. Applies to offers sent after this migration; existing
--              transfers keep counting as before.
--
-- * transfers.quota_exempt marks such offers (set by send_team_invite, re-checked by accept_team_invite).
-- * send_team_invite / accept_team_invite / get_team_transfer_slots ignore quota_exempt rows when counting.
-- * enforce_transfer_flow stops direct inserts from claiming the exemption.
-- Definitions are the live ones with only these changes.
-- ==============================================================================

ALTER TABLE public.transfers
    ADD COLUMN IF NOT EXISTS quota_exempt BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_transfer_flow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- quota_exempt may only be set by send_team_invite (or an admin); direct inserts cannot claim it
        IF NEW.quota_exempt
           AND COALESCE(current_setting('app.quota_exempt_allowed', true), '') <> 'true'
           AND NOT (has_role('ADMIN') OR has_role('SUPER_ADMIN')) THEN
            NEW.quota_exempt := false;
        END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.send_team_invite(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_first_timer BOOLEAN := false;
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

    -- Check window (must be open and active in current timestamp)
    SELECT id, season_id, is_unlimited INTO v_window
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

    -- A player who has never played for any team on TETA League (current or archived seasons) does not use a
    -- transfer slot: the offer is marked quota_exempt and skips the quota check.
    v_first_timer := NOT EXISTS (SELECT 1 FROM public.team_memberships WHERE player_id = p_player_id)
        AND NOT EXISTS (SELECT 1 FROM public.player_legacy_career_stats WHERE player_id = p_player_id AND deleted_at IS NULL);

    -- Enforce 5-slot quota per transfer window ONLY IF window is NOT unlimited
    IF NOT v_window.is_unlimited AND NOT v_first_timer THEN
        SELECT COUNT(*) INTO v_approved_transfers
        FROM public.transfers
        WHERE to_team_id = v_captain_team_id
          AND transfer_window_id = v_window.id
          AND NOT quota_exempt
          AND status = 'APPROVED';

        SELECT COUNT(*) INTO v_pending_transfers
        FROM public.transfers
        WHERE to_team_id = v_captain_team_id
          AND transfer_window_id = v_window.id
          AND NOT quota_exempt
          AND status = 'PENDING_PLAYER';

        IF (v_approved_transfers + v_pending_transfers) >= 5 THEN
            RAISE EXCEPTION 'Takımınızın bu transfer dönemi için transfer slotu dolmuştur (Maksimum 5 transfer).';
        END IF;
    END IF;

    -- Check if player exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_player_id) THEN
        RAISE EXCEPTION 'Player not found.';
    END IF;

    -- Check player's current membership for this season
    SELECT id, team_id INTO v_existing_membership
    FROM public.team_memberships
    WHERE player_id = p_player_id
      AND season_id = v_window.season_id
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

    -- Insert Transfer (the flag is only honoured for inserts made by this function, see enforce_transfer_flow)
    PERFORM set_config('app.quota_exempt_allowed', 'true', true);
    INSERT INTO public.transfers (
        transfer_window_id, season_id, player_id, from_team_id, to_team_id, requested_by, status, quota_exempt
    ) VALUES (
        v_window.id, v_window.season_id, p_player_id, v_source_team_id, v_captain_team_id, auth.uid(), 'PENDING_PLAYER', v_first_timer
    ) RETURNING id INTO v_transfer_id;
    PERFORM set_config('app.quota_exempt_allowed', 'false', true);

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
$function$;

CREATE OR REPLACE FUNCTION public.accept_team_invite(p_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer RECORD;
    v_current_membership RECORD;
    v_league_id UUID;
    v_season_max INT;
    v_count INT;
    v_window RECORD;
    v_exempt BOOLEAN := false;
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

    -- SECURITY & WINDOW HARDENING: Ensure the transfer window attached to this transfer is STILL OPEN and ACTIVE!
    SELECT id, is_unlimited INTO v_window
    FROM public.transfer_windows
    WHERE id = v_transfer.transfer_window_id
      AND season_id = v_transfer.season_id
      AND is_open = true
      AND start_date <= CURRENT_TIMESTAMP
      AND end_date >= CURRENT_TIMESTAMP;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bu transfer teklifinin ait olduğu transfer penceresi kapalı veya süresi dolmuş.';
    END IF;

    -- The slot exemption only stands while the player is still a first-timer (they may have joined another
    -- team while this offer was pending).
    v_exempt := v_transfer.quota_exempt
        AND NOT EXISTS (SELECT 1 FROM public.team_memberships WHERE player_id = auth.uid())
        AND NOT EXISTS (SELECT 1 FROM public.player_legacy_career_stats WHERE player_id = auth.uid() AND deleted_at IS NULL);

    -- Check target league_team
    SELECT league_id INTO v_league_id
    FROM public.league_teams
    WHERE team_id = v_transfer.to_team_id
      AND season_id = v_transfer.season_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target team is not active in this season.';
    END IF;

    -- If target window is limited, verify target team quota has not been exceeded
    IF NOT v_window.is_unlimited AND NOT v_exempt THEN
        IF (
            SELECT COUNT(*)
            FROM public.transfers
            WHERE to_team_id = v_transfer.to_team_id
              AND transfer_window_id = v_transfer.transfer_window_id
              AND NOT quota_exempt
              AND status = 'APPROVED'
        ) >= 5 THEN
            RAISE EXCEPTION 'Hedef takımın transfer kotası (5) dolmuştur.';
        END IF;
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

    -- Lock player's current membership for this season
    SELECT id, team_id INTO v_current_membership
    FROM public.team_memberships
    WHERE player_id = auth.uid()
      AND season_id = v_transfer.season_id
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

        -- CAPTAIN ROLE CLEANUP: Revoke CAPTAIN role from source team
        UPDATE public.user_roles
        SET is_active = false,
            revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = auth.uid()
          AND role = 'CAPTAIN'
          AND team_id = v_current_membership.team_id
          AND is_active = true;

        -- LEAGUE_TEAMS CAPTAIN CLEANUP:
        -- Reset captain_id to NULL only if it matches the transferring player for this exact season
        UPDATE public.league_teams
        SET captain_id = NULL
        WHERE team_id = v_current_membership.team_id
          AND season_id = v_transfer.season_id
          AND captain_id = auth.uid();
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

    -- Update transfer to APPROVED
    UPDATE public.transfers
    SET status = 'APPROVED',
        player_responded_at = CURRENT_TIMESTAMP,
        effective_at = CURRENT_TIMESTAMP,
        quota_exempt = v_exempt
    WHERE id = p_transfer_id;

    -- AUTO-CANCEL OTHER PENDING INVITES FOR THIS PLAYER:
    -- Frees reserved transfer quota for other teams offering to this player
    UPDATE public.transfers
    SET status = 'CANCELLED',
        player_responded_at = CURRENT_TIMESTAMP
    WHERE player_id = auth.uid()
      AND season_id = v_transfer.season_id
      AND status = 'PENDING_PLAYER'
      AND id != p_transfer_id;

    -- Update notifications
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
$function$;

CREATE OR REPLACE FUNCTION public.get_team_transfer_slots(p_team_id uuid, p_season_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_slots integer, used_slots integer, remaining_slots integer, is_window_open boolean, window_id uuid, window_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_season_id UUID := p_season_id;
    v_window RECORD;
    v_used_count INT := 0;
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
    SELECT id, name, is_open, start_date, end_date, is_unlimited
    INTO v_window
    FROM public.transfer_windows
    WHERE season_id = v_season_id
      AND is_open = true
      AND start_date <= CURRENT_TIMESTAMP
      AND end_date >= CURRENT_TIMESTAMP
    ORDER BY start_date DESC, created_at DESC
    LIMIT 1;

    -- Rule 1: Transfer dönemi açıkken
    IF FOUND THEN
        IF v_window.is_unlimited THEN
            -- Sınırsız transfer döneminde kota sınırsızdır
            RETURN QUERY SELECT 999, 0, 999, true, v_window.id, v_window.name;
        ELSE
            -- Normal transfer döneminde: APPROVED ve PENDING_PLAYER transferler anlık olarak slot tüketir!
            SELECT COUNT(*)::INT INTO v_used_count
            FROM public.transfers
            WHERE to_team_id = p_team_id
              AND transfer_window_id = v_window.id
              AND NOT quota_exempt
              AND status IN ('APPROVED', 'PENDING_PLAYER');

            RETURN QUERY SELECT 
                5, 
                v_used_count, 
                GREATEST(0, 5 - v_used_count), 
                true, 
                v_window.id, 
                v_window.name;
        END IF;
        RETURN;
    END IF;

    -- Rule 2: Transfer dönemi kapalıyken en son penceredeki APPROVED transferler slot tüketir.
    SELECT id, name, is_open, start_date, end_date, is_unlimited
    INTO v_window
    FROM public.transfer_windows
    WHERE season_id = v_season_id
    ORDER BY start_date DESC, created_at DESC
    LIMIT 1;

    IF FOUND THEN
        IF v_window.is_unlimited THEN
            RETURN QUERY SELECT 999, 0, 999, false, v_window.id, v_window.name;
            RETURN;
        ELSE
            SELECT COUNT(*)::INT INTO v_used_count
            FROM public.transfers
            WHERE to_team_id = p_team_id
              AND transfer_window_id = v_window.id
              AND NOT quota_exempt
              AND status = 'APPROVED';

            RETURN QUERY SELECT 
                5, 
                v_used_count, 
                GREATEST(0, 5 - v_used_count), 
                false, 
                v_window.id, 
                v_window.name;
            RETURN;
        END IF;
    END IF;

    -- Varsayılan: Henüz pencere tanımlanmamışsa 5/5
    RETURN QUERY SELECT 5, 0, 5, false, NULL::UUID, 'Pencere Yok'::TEXT;
    RETURN;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.send_team_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_team_invite(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_team_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_team_transfer_slots(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_transfer_slots(UUID, UUID) TO anon, authenticated;
