-- ============================================================================
-- TETA League: Shift TETA SEASON 6 | FC27 (teta-s6) Fixture Kick-Off Times +30m
-- ============================================================================
-- Shifts unplayed SCHEDULED fixtures in season 'teta-s6' forward by 30 minutes:
--   - Slot 1 weeks (1, 4, 7, 10, 13, 16, 19, 21): 22:00 TRT (19:00 UTC) -> 22:30 TRT (19:30 UTC)
--   - Slot 2 weeks (2, 5, 8, 11, 14, 17, 20, 22): 22:30 TRT (19:30 UTC) -> 23:00 TRT (20:00 UTC)
--   - Slot 3 weeks (3, 6, 9, 12, 15, 18):         23:00 TRT (20:00 UTC) -> 23:30 TRT (20:30 UTC)
--
-- Idempotency & Safety Guarantees:
--   1. Targets only season slug = 'teta-s6'.
--   2. Targets only fixtures with status = 'SCHEDULED'.
--   3. Excludes any fixture that has a linked row in public.matches.
--   4. Matches only rows whose current Europe/Istanbul kick-off time equals
--      the expected pre-shift time for their specific week_number.
--      Re-running this statement is a safe no-op (0 rows matched).
-- ============================================================================

UPDATE public.fixtures AS f
SET
  scheduled_at = f.scheduled_at + INTERVAL '30 minutes',
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
    (f.week_number IN (1, 4, 7, 10, 13, 16, 19, 21) AND (f.scheduled_at AT TIME ZONE 'Europe/Istanbul')::time = TIME '22:00:00')
    OR
    (f.week_number IN (2, 5, 8, 11, 14, 17, 20, 22) AND (f.scheduled_at AT TIME ZONE 'Europe/Istanbul')::time = TIME '22:30:00')
    OR
    (f.week_number IN (3, 6, 9, 12, 15, 18)         AND (f.scheduled_at AT TIME ZONE 'Europe/Istanbul')::time = TIME '23:00:00')
  );
