-- Rollback for 20261018120000_weekly_match_import.sql
-- Drops the RPC and the (append-only) match import history table.
-- Matches and player stats already written by an import are NOT removed (review/delete them from the admin match screen).
DROP FUNCTION IF EXISTS public.apply_weekly_match_imports(jsonb);
DROP TABLE IF EXISTS public.match_import_history;
