-- Creates a partial unique index to prevent a race condition where
-- multiple 'PENDING_PLAYER' transfers could be concurrently created for the same player and team.

CREATE UNIQUE INDEX uq_pending_transfer_per_player
ON public.transfers (player_id, to_team_id)
WHERE status = 'PENDING_PLAYER';
