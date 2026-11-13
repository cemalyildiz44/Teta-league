import { createClient } from '@supabase/supabase-js';
import { unstable_cache, revalidateTag, revalidatePath } from 'next/cache';
import { isGoalkeeperPosition } from '@/app/utils/positions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const publicSupabase = createClient(supabaseUrl, supabaseKey);

export interface PublicSeasonOption {
  id: string;
  name: string;
  status: string;
}

export interface PublicLeagueOption {
  id: string;
  name: string;
  season_id: string;
}

export interface StatisticsFilterOptions {
  seasons: PublicSeasonOption[];
  leagues: PublicLeagueOption[];
}

export interface PublicPlayerStatItem {
  profile_id: string;
  username: string;
  ea_player_id: string;
  team_id: string;
  position: string | null;
  matches_played: number;
  goals: number;
  assists: number;
  rating_sum: number;
  saves: number;
  goals_conceded: number;
  avg_rating: string;
  team: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  } | null;
}

export interface StatisticsDataResult {
  topScorers: PublicPlayerStatItem[];
  topAssisters: PublicPlayerStatItem[];
  topRatings: PublicPlayerStatItem[];
  mostMatches: PublicPlayerStatItem[];
  goalkeepers: PublicPlayerStatItem[];
}

/**
 * Pure public fetcher for statistics filter options (seasons & leagues).
 * Free of request-time cookies, headers, or visitor session state.
 */
export async function fetchRawFilterOptions(): Promise<StatisticsFilterOptions> {
  const [{ data: seasons }, { data: leagues }] = await Promise.all([
    publicSupabase.from('seasons').select('id, name, status').order('created_at', { ascending: false }),
    publicSupabase.from('leagues').select('id, name, season_id').order('name')
  ]);

  return {
    seasons: seasons || [],
    leagues: leagues || [],
  };
}

/**
 * Cached statistics filter options with 60-second TTL.
 * Tagged with 'public-statistics' for invalidation on season/league updates.
 */
export const getCachedFilterOptions = unstable_cache(
  async (): Promise<StatisticsFilterOptions> => {
    return fetchRawFilterOptions();
  },
  ['public-statistics-filters'],
  {
    tags: ['public-statistics'],
    revalidate: 300,
  }
);

/**
 * Pure public fetcher and aggregator for statistics leaderboard data.
 * Aggregates match_player_stats for approved matches in the selected season/league,
 * matched to registered profiles with EA accounts.
 */
export async function fetchRawStatsData(seasonId?: string, leagueId?: string): Promise<StatisticsDataResult> {
  const emptyResult: StatisticsDataResult = {
    topScorers: [],
    topAssisters: [],
    topRatings: [],
    mostMatches: [],
    goalkeepers: [],
  };

  if (!seasonId || !leagueId) {
    return emptyResult;
  }

  // 1. Fetch APPROVED matches in selected season and league
  const { data: matches } = await publicSupabase
    .from('matches')
    .select('id, played_at, created_at, fixtures(week_number)')
    .eq('season_id', seasonId)
    .eq('league_id', leagueId)
    .eq('status', 'APPROVED');

  const matchIds = (matches || []).map((m: any) => m.id);
  if (matchIds.length === 0) {
    return emptyResult;
  }

  const matchRankMap = new Map<string, number>();
  for (const m of matches || []) {
    const fix = Array.isArray((m as any).fixtures) ? (m as any).fixtures[0] : (m as any).fixtures;
    const weekNum = Number(fix?.week_number || 0);
    const timeMs = new Date((m as any).played_at || (m as any).created_at || 0).getTime() || 0;
    matchRankMap.set(m.id, weekNum * 1e13 + timeMs);
  }

  // 2. Fetch raw match_player_stats for those matches
  const { data: stats } = await publicSupabase
    .from('match_player_stats')
    .select('match_id, player_id, ea_player_id, team_id, position, goals, assists, rating, saves, goals_conceded')
    .in('match_id', matchIds);

  const rawStats = stats || [];
  if (rawStats.length === 0) {
    return emptyResult;
  }

  // 3. Filter only verified EA players with existing profiles
  const directPlayerIds = Array.from(new Set(rawStats.map((s: any) => s.player_id).filter(Boolean)));
  const eaPlayerIds = Array.from(new Set(rawStats.map((s: any) => s.ea_player_id).filter(Boolean)));
  const teamIds = Array.from(new Set(rawStats.map((s: any) => s.team_id).filter(Boolean)));

  const [directProfilesRes, profilesRes, teamsRes] = await Promise.all([
    directPlayerIds.length > 0
      ? publicSupabase
          .from('profiles')
          .select('id, username, current_ea_player_id')
          .in('id', directPlayerIds)
      : Promise.resolve({ data: [] }),
    eaPlayerIds.length > 0
      ? publicSupabase
          .from('profiles')
          .select('id, username, current_ea_player_id')
          .in('current_ea_player_id', eaPlayerIds)
          .not('current_ea_player_id', 'is', null)
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? publicSupabase
          .from('teams')
          .select('id, name, slug, logo_url')
          .in('id', teamIds)
      : Promise.resolve({ data: [] })
  ]);

  const validProfiles = [...(directProfilesRes.data || []), ...(profilesRes.data || [])];
  const idToProfileMap = new Map(validProfiles.map((p: any) => [p.id, p]));
  const eaToProfileMap = new Map(validProfiles.filter((p: any) => p.current_ea_player_id).map((p: any) => [p.current_ea_player_id, p]));
  const teamMap = new Map((teamsRes.data || []).map((t: any) => [t.id, t]));

  // 3b. Fetch active team_memberships so transferred players show their current team
  const validProfileIds = Array.from(idToProfileMap.keys());
  const activeTeamIdByProfile = new Map<string, string>();
  if (validProfileIds.length > 0) {
    const { data: activeMemberships } = await publicSupabase
      .from('team_memberships')
      .select('player_id, team_id, joined_at')
      .in('player_id', validProfileIds)
      .is('left_at', null)
      .order('joined_at', { ascending: false });

    const missingActiveTeamIds: string[] = [];
    for (const m of activeMemberships || []) {
      if (m.player_id && m.team_id && !activeTeamIdByProfile.has(m.player_id)) {
        activeTeamIdByProfile.set(m.player_id, m.team_id);
        if (!teamMap.has(m.team_id)) {
          missingActiveTeamIds.push(m.team_id);
        }
      }
    }

    if (missingActiveTeamIds.length > 0) {
      const { data: extraTeams } = await publicSupabase
        .from('teams')
        .select('id, name, slug, logo_url')
        .in('id', Array.from(new Set(missingActiveTeamIds)));
      for (const t of extraTeams || []) {
        teamMap.set(t.id, t);
      }
    }
  }

  const filteredStats = rawStats.filter((s: any) => (s.player_id && idToProfileMap.has(s.player_id)) || (s.ea_player_id && eaToProfileMap.has(s.ea_player_id)));

  // 4. Aggregate stats per profile
  const playerStatsMap = new Map<string, any>();
  for (const s of filteredStats) {
    const profile = (s.player_id && idToProfileMap.get(s.player_id)) || eaToProfileMap.get(s.ea_player_id);
    const key = profile.id;
    const matchRank = matchRankMap.get(s.match_id) ?? 0;
    const activeTeamId = activeTeamIdByProfile.get(key);

    if (!playerStatsMap.has(key)) {
      playerStatsMap.set(key, {
        profile_id: profile.id,
        username: profile.username,
        ea_player_id: s.ea_player_id,
        team_id: activeTeamId || s.team_id,
        position: s.position,
        last_match_rank: matchRank,
        matches_played: 0,
        goals: 0,
        assists: 0,
        rating_sum: 0,
        saves: 0,
        goals_conceded: 0,
      });
    }

    const ps = playerStatsMap.get(key);
    ps.matches_played += 1;
    ps.goals += (s.goals || 0);
    ps.assists += (s.assists || 0);
    ps.rating_sum += (parseFloat(s.rating) || 0);
    ps.saves += (s.saves || 0);
    ps.goals_conceded += (s.goals_conceded || 0);
    if (matchRank >= ps.last_match_rank) {
      ps.last_match_rank = matchRank;
      if (s.position) ps.position = s.position;
      if (!activeTeamId && s.team_id) ps.team_id = s.team_id;
    }
    if (activeTeamId) {
      ps.team_id = activeTeamId;
    }
  }

  const aggregated: PublicPlayerStatItem[] = Array.from(playerStatsMap.values()).map(ps => {
    const teamObj = teamMap.get(ps.team_id);
    return {
      profile_id: ps.profile_id,
      username: ps.username,
      ea_player_id: ps.ea_player_id,
      team_id: ps.team_id,
      position: ps.position || null,
      matches_played: ps.matches_played,
      goals: ps.goals,
      assists: ps.assists,
      rating_sum: ps.rating_sum,
      saves: ps.saves,
      goals_conceded: ps.goals_conceded,
      avg_rating: ps.matches_played > 0 ? (ps.rating_sum / ps.matches_played).toFixed(2) : '0.00',
      team: teamObj ? {
        id: teamObj.id,
        name: teamObj.name,
        slug: teamObj.slug,
        logo_url: teamObj.logo_url || null,
      } : null,
    };
  });

  const topScorers = [...aggregated].sort((a, b) => b.goals - a.goals || a.matches_played - b.matches_played).filter(p => p.goals > 0).slice(0, 10);
  const topAssisters = [...aggregated].sort((a, b) => b.assists - a.assists || a.matches_played - b.matches_played).filter(p => p.assists > 0).slice(0, 10);
  const topRatings = [...aggregated].sort((a, b) => parseFloat(b.avg_rating) - parseFloat(a.avg_rating) || b.matches_played - a.matches_played).filter(p => parseFloat(p.avg_rating) > 0).slice(0, 10);
  const mostMatches = [...aggregated].sort((a, b) => b.matches_played - a.matches_played).slice(0, 10);
  const goalkeepers = aggregated.filter(p => isGoalkeeperPosition(p.position) || p.saves > 0).sort((a, b) => b.saves - a.saves || a.goals_conceded - b.goals_conceded).slice(0, 10);

  return {
    topScorers,
    topAssisters,
    topRatings,
    mostMatches,
    goalkeepers,
  };
}

/**
 * Cached public statistics with 60-second TTL.
 * Tagged with 'public-statistics' and granular 'stats-[seasonId]-[leagueId]' tag.
 */
export async function getCachedStatsData(seasonId?: string, leagueId?: string): Promise<StatisticsDataResult> {
  if (!seasonId || !leagueId) {
    return {
      topScorers: [],
      topAssisters: [],
      topRatings: [],
      mostMatches: [],
      goalkeepers: [],
    };
  }

  const fetcher = unstable_cache(
    async () => fetchRawStatsData(seasonId, leagueId),
    ['public-statistics-data', seasonId, leagueId],
    {
      tags: ['public-statistics', `stats-${seasonId}-${leagueId}`],
      revalidate: 300,
    }
  );

  return fetcher();
}

/**
 * Revalidates public statistics cache tags and path.
 */
export function revalidatePublicStats(seasonId?: string, leagueId?: string) {
  try {
    revalidateTag('public-statistics', 'max');
    if (seasonId && leagueId) {
      revalidateTag(`stats-${seasonId}-${leagueId}`, 'max');
    }
  } catch {
    // fallback if called in non-action context
  }
  try {
    revalidatePath('/istatistikler');
  } catch {
    // fallback if called in non-request context
  }
}
