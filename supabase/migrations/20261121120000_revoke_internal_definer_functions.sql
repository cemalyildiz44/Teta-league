-- Internal SECURITY DEFINER functions were executable by anyone through the API (functions get EXECUTE for
-- PUBLIC by default). They are only meant to run from triggers, which do not need the caller's EXECUTE
-- privilege, and from trigger_recalculate_stats() (SECURITY DEFINER, owned by postgres).
-- get_team_captains and get_team_transfer_slots stay public: the team page calls them with the anon key.
REVOKE EXECUTE ON FUNCTION public.sync_match_player_defensive_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_fn_sync_mps_defensive_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_fn_sync_report_player_defensive_stats() FROM PUBLIC, anon, authenticated;

-- One-off copies taken before the 2026-11-01 data repair; not referenced anywhere and not readable through
-- the API, but they hold personal data that no longer needs to be kept.
DROP TABLE IF EXISTS public._snapshot_20261101_league_teams;
DROP TABLE IF EXISTS public._snapshot_20261101_team_memberships;
DROP TABLE IF EXISTS public._snapshot_20261101_transfers;
DROP TABLE IF EXISTS public._snapshot_20261101_user_roles;
