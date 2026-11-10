-- 20261110120100_restrict_captain_team_updates.sql
-- "Captains update own team" allowed a captain to update every column of their team through the Data API,
-- including name, slug, logo_url, is_active and ea_club_id (which drives EA match import matching).
-- Captains only need to edit the social / goal music links, and update_team_socials() (SECURITY DEFINER)
-- already performs that with its own captain/admin authorization. Admins keep "Admin full teams".

DROP POLICY IF EXISTS "Captains update own team" ON public.teams;
