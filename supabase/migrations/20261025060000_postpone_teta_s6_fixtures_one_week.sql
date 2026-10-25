-- ============================================================================
-- TETA League: Postpone TETA SEASON 6 | FC27 (teta-s6) Fixtures by 1 Week (+7d)
-- ============================================================================
-- Postponement Calendar Change:
--   - Week 4, 5, 6 (originally 26.10.2026) -> Postponed to 02.11.2026 (+7 days)
--   - Week 7, 8, 9 (originally 02.11.2026) -> Postponed to 09.11.2026 (+7 days)
--   - Week 10, 11, 12 (originally 09.11.2026) -> Postponed to 16.11.2026 (+7 days)
--   - Mid-Season Break / Devre Arası (originally 16.11.2026) -> Shifted to 23.11.2026
--   - Week 13, 14, 15 (originally 23.11.2026) -> Postponed to 30.11.2026 (+7 days)
--   - Week 16, 17, 18 (originally 30.11.2026) -> Postponed to 07.12.2026 (+7 days)
--   - Week 19, 20 (originally 07.12.2026) -> Postponed to 14.12.2026 (+7 days)
--   - Week 21, 22 (originally 14.12.2026) -> Postponed to 21.12.2026 (+7 days)
--
-- Preserved Elements:
--   - Weeks 1, 2, 3 (played on 19.10.2026, status = 'COMPLETED') are UNTOUCHED.
--   - Kick-off times (hours and minutes: 22:30, 23:00, 23:30 TRT / 19:30, 20:00, 20:30 UTC) are preserved.
--   - Team pairings, scores, match statuses, notes, and other attributes remain unchanged.
--   - Affects both SÜPERLİG and ECL 1.LİG (114 fixtures each, 228 fixtures in total).
--   - Transfer window for Season 6 (was closing 25.10.2026 23:59 UTC before week 4)
--     is extended by 7 days to 01.11.2026 23:59 UTC to remain open until week 4.
--
-- Safety & Idempotency:
--   1. Creates safety backup tables:
--      public._backup_fixtures_postpone_20261025
--      public._backup_transfer_windows_postpone_20261025
--   2. Targets only season slug = 'teta-s6'.
--   3. Targets only fixtures with status = 'SCHEDULED'.
--   4. Excludes any fixture with a linked row in public.matches.
--   5. Checks current unshifted scheduled dates (e.g. week 4-6 must be on 2026-10-26).
--      Re-running this statement is a safe no-op (0 rows matched).
-- ============================================================================

-- 1. Create safety backup tables if not already present
CREATE TABLE IF NOT EXISTS public._backup_fixtures_postpone_20261025 AS
SELECT f.*, NOW() AS backed_up_at
FROM public.fixtures f
JOIN public.seasons s ON f.season_id = s.id
WHERE s.slug = 'teta-s6';

ALTER TABLE public._backup_fixtures_postpone_20261025 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_fixtures_postpone_20261025 FROM anon, authenticated, PUBLIC;

CREATE TABLE IF NOT EXISTS public._backup_transfer_windows_postpone_20261025 AS
SELECT tw.*, NOW() AS backed_up_at
FROM public.transfer_windows tw
JOIN public.seasons s ON tw.season_id = s.id
WHERE s.slug = 'teta-s6';

ALTER TABLE public._backup_transfer_windows_postpone_20261025 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_transfer_windows_postpone_20261025 FROM anon, authenticated, PUBLIC;

-- 2. Extend active transfer window by 7 days (closes eve of new week 4)
UPDATE public.transfer_windows AS tw
SET
  end_date = tw.end_date + INTERVAL '7 days',
  updated_at = NOW()
FROM public.seasons AS s
WHERE tw.season_id = s.id
  AND s.slug = 'teta-s6'
  AND tw.is_open = true
  AND tw.end_date = TIMESTAMPTZ '2026-10-25 23:59:00+00:00';

-- 3. Postpone unplayed SCHEDULED fixtures by 7 days
UPDATE public.fixtures AS f
SET
  scheduled_at = f.scheduled_at + INTERVAL '7 days',
  updated_at = NOW()
FROM public.seasons AS s
WHERE f.season_id = s.id
  AND s.slug = 'teta-s6'
  AND f.status = 'SCHEDULED'
  AND NOT EXISTS (
    SELECT 1
    FROM public.matches AS m
    WHERE m.fixture_id = f.id
  )
  AND (
    (f.week_number IN (4, 5, 6)    AND (f.scheduled_at AT TIME ZONE 'Europe/Istanbul')::date = DATE '2026-10-26')
    OR
    (f.week_number IN (7, 8, 9)    AND (f.scheduled_at AT TIME ZONE 'Europe/Istanbul')::date = DATE '2026-11-02')
    OR
    (f.week_number IN (10, 11, 12) AND (f.scheduled_at AT TIME ZONE 'Europe/Istanbul')::date = DATE '2026-11-09')
    OR
    (f.week_number IN (13, 14, 15) AND (f.scheduled_at AT TIME ZONE 'Europe/Istanbul')::date = DATE '2026-11-23')
    OR
    (f.week_number IN (16, 17, 18) AND (f.scheduled_at AT TIME ZONE 'Europe/Istanbul')::date = DATE '2026-11-30')
    OR
    (f.week_number IN (19, 20)     AND (f.scheduled_at AT TIME ZONE 'Europe/Istanbul')::date = DATE '2026-12-07')
    OR
    (f.week_number IN (21, 22)     AND (f.scheduled_at AT TIME ZONE 'Europe/Istanbul')::date = DATE '2026-12-14')
  );

-- 4. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
