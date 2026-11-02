-- ==============================================================================
-- Migration: 20261102230000_enhance_cancel_team_invite.sql
-- Description: Allow any active team captain (or admin) of to_team_id to cancel
--              a pending transfer invite, not just the original requester.
--              Sets updated_at = CURRENT_TIMESTAMP and marks player notification read.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.cancel_team_invite(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transfer RECORD;
    v_is_captain BOOLEAN := false;
    v_is_admin BOOLEAN := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- SECURITY HARDENING: Check caller profile status
    IF (SELECT status FROM public.profiles WHERE id = auth.uid()) != 'ACTIVE' THEN
        RAISE EXCEPTION 'Hesabınız aktif olmadığı için bu işlemi yapamazsınız.';
    END IF;

    -- Lock the transfer row to prevent concurrent acceptance / modification
    SELECT * INTO v_transfer
    FROM public.transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;

    -- Check if caller is the original requester, an active captain of the team, or an admin
    IF v_transfer.requested_by = auth.uid() THEN
        v_is_captain := true;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
              AND team_id = v_transfer.to_team_id
              AND role = 'CAPTAIN'
              AND is_active = true
        ) INTO v_is_captain;

        SELECT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
              AND role IN ('ADMIN', 'SUPER_ADMIN')
              AND is_active = true
        ) INTO v_is_admin;
    END IF;

    IF NOT v_is_captain AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: Not your invite';
    END IF;

    IF v_transfer.status != 'PENDING_PLAYER' THEN
        RAISE EXCEPTION 'Invite cannot be cancelled at this state.';
    END IF;

    -- Set status to CANCELLED and update timestamp
    UPDATE public.transfers
    SET status = 'CANCELLED',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_transfer_id;

    -- Mark player's TRANSFER_OFFER notification as read
    UPDATE public.notifications
    SET is_read = true
    WHERE reference_id = p_transfer_id
      AND type = 'TRANSFER_OFFER'
      AND user_id = v_transfer.player_id;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_team_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_team_invite(UUID) TO authenticated;
