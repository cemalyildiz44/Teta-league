-- 20260924164500_grant_player_achievements_permissions.sql
-- Grant table-level permissions on public.player_achievements to anon and authenticated roles.
-- Note: Row Level Security (RLS) remains fully enabled on player_achievements:
--   - "Anyone can view player achievements" policy regulates SELECT.
--   - "Admins can manage player achievements" policy regulates INSERT, UPDATE, DELETE strictly to ADMIN / SUPER_ADMIN.

GRANT SELECT ON TABLE public.player_achievements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.player_achievements TO authenticated;
