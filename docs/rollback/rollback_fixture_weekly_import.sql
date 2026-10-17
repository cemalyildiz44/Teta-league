-- Rollback for 20261017120000_fixture_weekly_import.sql
-- Drops the RPC and the (append-only) import history table. Fixture rows already written are NOT reverted.
DROP FUNCTION IF EXISTS public.apply_fixture_week_imports(jsonb);
DROP TABLE IF EXISTS public.fixture_import_history;
