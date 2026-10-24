-- Harden the two one-off backup tables created by the 2026-10-21 achievement cleanups
-- (20261021000000_fix_totw_duplicate_achievement.sql, 20261021010000_cleanup_legacy_duplicate_achievements.sql).
--
-- The application never reads or writes them. They are created in `public` with RLS off and with the project's default
-- ACL, which leaves anon/authenticated with TRUNCATE, REFERENCES, TRIGGER and MAINTAIN (no SELECT/INSERT/UPDATE/DELETE,
-- so the data is not reachable through the API, but RLS-off tables in an exposed schema are still a standing risk).
--
-- This migration only changes access: it enables RLS (no policies = deny for every role that is subject to RLS) and
-- revokes ALL table privileges from anon, authenticated and PUBLIC. The tables and their rows are NOT touched;
-- postgres (owner) and service_role keep their grants / RLS bypass for later restore or inspection.
-- Idempotent: ENABLE ROW LEVEL SECURITY and REVOKE are no-ops when already applied; missing tables are skipped.
-- Rollback (if ever needed): ALTER TABLE ... DISABLE ROW LEVEL SECURITY; the previous default grants are not required by anything.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        '_backup_totw_player_achievements_20261021',
        '_backup_legacy_player_achievements_20261021'
    ] LOOP
        IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            -- ALL = SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER (and MAINTAIN on PostgreSQL 17)
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', t);
        END IF;
    END LOOP;
END
$$;
