import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PlayersManager } from './PlayersManager';
import { getCachedUser } from '@/lib/fetchers';

export const metadata = {
  title: 'Oyuncu Yönetimi | TETA League Admin',
  description: 'TETA League oyuncu kayıtları, beta bilgileri ve başarımlar',
};

export default async function AdminPlayersPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Admin authentication & authorization check
  const user = await getCachedUser();
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
    { data: legacyStats, error: legacyStatsErr },
    { data: allSeasons },
    { data: leagueTeamsData },
    { data: matchPlayerStatsData, error: matchStatsErr }
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('team_memberships')
      .select('player_id, team_id, season_id, joined_at')
      .is('left_at', null)
      .order('joined_at', { ascending: false }),
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
      .order('created_at', { ascending: false }),
    supabase
      .from('seasons')
      .select('id, name, slug, status')
      .order('created_at', { ascending: false }),
    supabase
      .from('league_teams')
      .select('season_id, league_id, team_id, leagues(name)'),
    supabase
      .from('match_player_stats')
      .select('player_id, team_id, goals, assists, rating, matches!inner(id, season_id, league_id, status)')
      .eq('matches.status', 'APPROVED')
  ]);

  if (profilesErr) {
    console.error('Error fetching profiles in admin:', profilesErr);
  }
  if (membershipsErr) {
    console.error('Error fetching team memberships in admin:', membershipsErr);
  }
  if (teamsErr) {
    console.error('Error fetching teams in admin:', teamsErr);
  }
  if (legacyStatsErr) {
    // Graceful fallback if table is not yet migrated
    console.warn('Notice: player_legacy_career_stats table not yet created or error:', legacyStatsErr.message);
  }
  if (matchStatsErr) {
    console.error('Error fetching match player stats in admin:', matchStatsErr);
  }

  // Active season detection (Season 6)
  const activeSeason = (allSeasons || []).find((s: any) => s.status === 'ACTIVE') || null;

  // Build teams lookup
  const teamsById = new Map<string, { id: string; name: string; logo_url: string | null; is_active: boolean }>();
  if (allTeams) {
    for (const t of allTeams) {
      teamsById.set(t.id, { id: t.id, name: t.name, logo_url: t.logo_url, is_active: t.is_active });
    }
  }

  // Build lookup maps for O(1) correlation
  // Prioritize active season membership for current team
  const teamMap = new Map<string, { id: string; name: string; logo_url: string | null }>();
  if (memberships) {
    // Priority 1: Current membership in active season (Season 6)
    for (const m of memberships) {
      if (!m.player_id || !m.team_id) continue;
      if (activeSeason && m.season_id === activeSeason.id) {
        const teamObj = teamsById.get(m.team_id);
        if (teamObj) {
          teamMap.set(m.player_id, {
            id: teamObj.id,
            name: teamObj.name,
            logo_url: teamObj.logo_url
          });
        }
      }
    }
    // Priority 2: Fallback for players without active season membership (any other active membership where left_at is null)
    for (const m of memberships) {
      if (!m.player_id || !m.team_id) continue;
      if (!teamMap.has(m.player_id)) {
        const teamObj = teamsById.get(m.team_id);
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

  // Aggregate live match stats for active season (Season 6)
  const liveSeasonStatsMap = new Map<string, {
    season_id: string;
    season_name: string;
    league_id: string | null;
    league_name: string;
    team_id: string | null;
    team_name: string;
    team_logo_url: string | null;
    matches_played: number;
    goals: number;
    assists: number;
    rating_avg: number;
  }>();

  if (activeSeason && matchPlayerStatsData) {
    const leagueNameById = new Map<string, string>();
    (leagueTeamsData || []).forEach((lt: any) => {
      const lg = Array.isArray(lt.leagues) ? lt.leagues[0] : lt.leagues;
      if (lt.league_id && lg?.name) leagueNameById.set(lt.league_id, lg.name);
    });

    const playerAgg = new Map<string, {
      teamId: string | null;
      leagueId: string | null;
      matches: number;
      goals: number;
      assists: number;
      ratingSum: number;
    }>();

    for (const s of matchPlayerStatsData) {
      const match = Array.isArray(s.matches) ? s.matches[0] : s.matches;
      if (!match || match.season_id !== activeSeason.id) continue;
      if (!s.player_id) continue;

      const agg = playerAgg.get(s.player_id) || {
        teamId: s.team_id,
        leagueId: match.league_id,
        matches: 0,
        goals: 0,
        assists: 0,
        ratingSum: 0
      };
      agg.matches += 1;
      agg.goals += (s.goals || 0);
      agg.assists += (s.assists || 0);
      agg.ratingSum += (parseFloat(s.rating) || 0);
      if (s.team_id) agg.teamId = s.team_id;
      if (match.league_id) agg.leagueId = match.league_id;
      playerAgg.set(s.player_id, agg);
    }

    for (const [playerId, agg] of playerAgg.entries()) {
      const teamObj = agg.teamId ? teamsById.get(agg.teamId) : teamMap.get(playerId);
      const lName = agg.leagueId ? (leagueNameById.get(agg.leagueId) || 'TETA Süper Lig') : 'TETA Süper Lig';
      liveSeasonStatsMap.set(playerId, {
        season_id: activeSeason.id,
        season_name: activeSeason.name,
        league_id: agg.leagueId,
        league_name: lName,
        team_id: agg.teamId || teamObj?.id || null,
        team_name: teamObj?.name || 'Bilinmeyen Takım',
        team_logo_url: teamObj?.logo_url || null,
        matches_played: agg.matches,
        goals: agg.goals,
        assists: agg.assists,
        rating_avg: agg.matches > 0 ? Math.round((agg.ratingSum / agg.matches) * 100) / 100 : 0
      });
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
    status: (p.status as 'ACTIVE' | 'SUSPENDED' | 'BANNED') || (p.is_active !== false ? 'ACTIVE' : 'SUSPENDED'),
    current_ea_player_id: p.current_ea_player_id || null,
    beta_registered: p.beta_registered ?? false,
    created_at: p.created_at,
    active_team: teamMap.get(p.id) || null,
    achievements: achievementMap.get(p.id) || [],
    legacy_stats: legacyStatsMap.get(p.id) || [],
    live_season_stats: liveSeasonStatsMap.get(p.id) || null
  }));

  const serializedSeasons = (allSeasons || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    status: s.status || 'COMPLETED'
  }));

  const serializedLeagueTeams = (leagueTeamsData || []).map((lt: any) => {
    const lg = Array.isArray(lt.leagues) ? lt.leagues[0] : lt.leagues;
    return {
      season_id: lt.season_id,
      league_id: lt.league_id,
      team_id: lt.team_id,
      league_name: lg?.name || ''
    };
  });

  return (
    <PlayersManager
      players={serializedPlayers}
      teams={allTeams || []}
      seasons={serializedSeasons}
      leagueTeams={serializedLeagueTeams}
      activeSeason={activeSeason ? {
        id: activeSeason.id,
        name: activeSeason.name,
        slug: activeSeason.slug,
        status: activeSeason.status
      } : null}
    />
  );
}
