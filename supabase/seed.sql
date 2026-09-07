-- Teta League Test Data Seed (For Local Development)
-- DO NOT RUN IN PRODUCTION!

-- 1. Setup Seasons
INSERT INTO public.seasons (id, name, slug, status, roster_min, roster_max)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'Teta League 6. Sezon', 'teta-league-6-sezon', 'ACTIVE', 1, 30),
  ('a0000000-0000-0000-0000-000000000002', 'Teta League 5. Sezon', 'teta-league-5-sezon', 'COMPLETED', 1, 30);

-- 2. Setup Leagues
INSERT INTO public.leagues (id, season_id, name, level, status)
VALUES 
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Teta Süper Lig', 1, 'ACTIVE'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'ECL 1. Lig', 2, 'ACTIVE');

-- 3. Setup Teams
INSERT INTO public.teams (id, name, slug, ea_club_id, is_active, logo_url)
VALUES 
  ('c0000000-0000-0000-0000-000000000001', 'Galatasaray', 'galatasaray', 101010, true, NULL),
  ('c0000000-0000-0000-0000-000000000002', 'Fenerbahçe', 'fenerbahce', 101011, true, NULL),
  ('c0000000-0000-0000-0000-000000000003', 'Beşiktaş', 'besiktas', 101012, true, NULL);

-- 4. League Teams
INSERT INTO public.league_teams (league_id, season_id, team_id, is_active)
VALUES 
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', true),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', true),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', true);

