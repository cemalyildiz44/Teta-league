import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PlayersManager } from './PlayersManager';

export const metadata = {
  title: 'Oyuncu Yönetimi | TETA League Admin',
  description: 'TETA League oyuncu kayıtları, beta bilgileri ve başarımlar',
};

export default async function AdminPlayersPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Admin authentication & authorization check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();

  if (!adminRole) {
    redirect('/');
  }

  // Bulk queries (NO N+1)
  const [
    { data: profiles, error: profilesErr },
    { data: memberships, error: membershipsErr },
    { data: achievements, error: achievementsErr },
    { data: allTeams, error: teamsErr },
    { data: legacyStats, error: legacyStatsErr }
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, platform, primary_position, alternative_positions, is_active, beta_registered, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('team_memberships')
      .select('player_id, team_id, teams(id, name, logo_url)')
      .is('left_at', null),
    supabase
      .from('player_achievements')
      .select('id, player_id, achievement_type, awarded_at')
      .order('awarded_at', { ascending: false }),
    supabase
      .from('teams')
      .select('id, name, logo_url, is_active')
      .order('name', { ascending: true }),
    supabase
      .from('player_legacy_career_stats')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
  ]);

  if (profilesErr) {
    console.error('Error fetching profiles in admin:', profilesErr);
  }
  if (teamsErr) {
    console.error('Error fetching teams in admin:', teamsErr);
  }
  if (legacyStatsErr) {
    // Graceful fallback if table is not yet migrated
    console.warn('Notice: player_legacy_career_stats table not yet created or error:', legacyStatsErr.message);
  }

  // Build lookup maps for O(1) correlation
  const teamMap = new Map<string, { id: string; name: string; logo_url: string | null }>();
  if (memberships) {
    for (const m of memberships) {
      if (m.player_id && m.teams) {
        const teamObj = Array.isArray(m.teams) ? m.teams[0] : m.teams;
        if (teamObj) {
          teamMap.set(m.player_id, {
            id: teamObj.id,
            name: teamObj.name,
            logo_url: teamObj.logo_url
          });
        }
      }
    }
  }

  const achievementMap = new Map<string, Array<{ id: string; achievement_type: string; awarded_at: string }>>();
  if (achievements) {
    for (const a of achievements) {
      if (!a.player_id) continue;
      const list = achievementMap.get(a.player_id) || [];
      list.push({
        id: a.id,
        achievement_type: a.achievement_type,
        awarded_at: a.awarded_at
      });
      achievementMap.set(a.player_id, list);
    }
  }

  const legacyStatsMap = new Map<string, any[]>();
  if (legacyStats) {
    for (const ls of legacyStats) {
      if (!ls.player_id) continue;
      const list = legacyStatsMap.get(ls.player_id) || [];
      list.push(ls);
      legacyStatsMap.set(ls.player_id, list);
    }
  }

  // Normalize data for PlayersManager
  const serializedPlayers = (profiles || []).map((p: any) => ({
    id: p.id,
    username: p.username,
    full_name: p.full_name || null,
    avatar_url: p.avatar_url || null,
    platform: p.platform || null,
    primary_position: p.primary_position || null,
    alternative_positions: p.alternative_positions || [],
    is_active: p.is_active ?? true,
    beta_registered: p.beta_registered ?? false,
    created_at: p.created_at,
    active_team: teamMap.get(p.id) || null,
    achievements: achievementMap.get(p.id) || [],
    legacy_stats: legacyStatsMap.get(p.id) || []
  }));

  return <PlayersManager players={serializedPlayers} teams={allTeams || []} />;
}
