-- 20260924163000_add_teta_season_5.sql
-- Add TETA SEASON 5 to public.seasons
-- Note: public.seasons table uses the status enum ('ACTIVE', 'COMPLETED', etc.) rather than an is_active column.
-- Idempotent: ON CONFLICT (slug) DO NOTHING ensures no duplicate or error if already executed.

INSERT INTO public.seasons (
    id,
    name,
    slug,
    status,
    start_date,
    end_date
)
VALUES (
    gen_random_uuid(),
    'TETA SEASON 5',
    'teta-s5',
    'COMPLETED',
    NULL,
    NULL
)
ON CONFLICT (slug) DO NOTHING;
