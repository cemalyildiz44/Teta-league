import { createClient } from '@supabase/supabase-js';
import { unstable_cache, revalidateTag, revalidatePath } from 'next/cache';
import { calculateMarketValue, MarketValueInput } from '@/app/utils/marketValueCalculator';
import { PlayerRanking } from './PlayerRankingsClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const publicSupabase = createClient(supabaseUrl, supabaseKey);

/**
 * Pure public data fetcher and calculation engine for player rankings.
 * Free of request-time APIs (no request cookies, headers, or session state).
 * Reads strictly public tables with anonymous access.
 */
export async function fetchRawPlayerRankings(): Promise<PlayerRanking[]> {
  // 1. Fetch profiles (only required columns, pre-filtering non-banned profiles)
  const { data: profiles } = await publicSupabase
    .from('profiles')
    .select('id, username, avatar_url, platform, primary_position, alternative_positions, status')
    .or('status.neq.BANNED,status.is.null');

  const validProfiles = (profiles || []).filter((p: any) => p.status !== 'BANNED');
  const profileIds = validProfiles.map((p: any) => p.id);

  // 2. Concurrently fetch memberships, stats, achievements, active teams
  const [ { data: memData }, { data: bulkStats }, { data: bulkAchievements }, { data: activeTeamsData } ] = await Promise.all([
    profileIds.length > 0
      ? publicSupabase.from('team_memberships').select('player_id, team_id').in('player_id', profileIds).is('left_at', null)
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? publicSupabase
          .from('match_player_stats')
          .select('player_id, team_id, goals, assists, rating, cleansheets_gk, cleansheets_def, red_cards, matches!inner(home_team_id, away_team_id, home_score, away_score, status, season_id)')
          .in('player_id', profileIds)
          .eq('matches.status', 'APPROVED')
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? publicSupabase
          .from('player_achievements')
          .select('player_id, achievement_type, season_id')
          .in('player_id', profileIds)
      : Promise.resolve({ data: [] }),
    publicSupabase.from('teams').select('id, name').eq('is_active', true)
  ]);

  const memberships = memData || [];
  const activeTeamsMap = new Map((activeTeamsData || []).map((t: any) => [t.id, t.name]));
  const activeMembershipByPlayer = new Map<string, string>(); // player_id -> team_id
  memberships.forEach((m: any) => {
    if (activeTeamsMap.has(m.team_id)) {
      activeMembershipByPlayer.set(m.player_id, m.team_id);
    }
  });

  // Index achievements by profile id
  const achByProfile = new Map<string, any[]>();
  if (bulkAchievements) {
    bulkAchievements.forEach((a: any) => {
      if (!achByProfile.has(a.player_id)) achByProfile.set(a.player_id, []);
      achByProfile.get(a.player_id)!.push(a);
    });
  }

  // Index match stats by player_id
  const statsByPlayerId = new Map<string, any[]>();
  if (bulkStats) {
    bulkStats.forEach((s: any) => {
      if (s.player_id) {
        if (!statsByPlayerId.has(s.player_id)) statsByPlayerId.set(s.player_id, []);
        statsByPlayerId.get(s.player_id)!.push(s);
      }
    });
  }

  // Calculate Market Value for each player
  const rankingsArray: PlayerRanking[] = validProfiles.map((p: any) => {
    const pStatsList = p.id ? statsByPlayerId.get(p.id) || [] : [];

    let tM = 0, tW = 0, tD = 0, tL = 0, tG = 0, tA = 0, tCGK = 0, tCDEF = 0, tRC = 0;
    const sMap = new Map<string, { season_id: string, rating_sum: number, rating_count: number }>();

    pStatsList.forEach((s: any) => {
      tM++;
      tG += s.goals || 0;
      tA += s.assists || 0;
      tRC += s.red_cards || 0;
      tCGK += s.cleansheets_gk || 0;
      tCDEF += s.cleansheets_def || 0;

      const m = s.matches;
      if (m) {
        const isHome = s.team_id === m.home_team_id;
        const my = isHome ? m.home_score : m.away_score;
        const opp = isHome ? m.away_score : m.home_score;
        if (my > opp) tW++;
        else if (my < opp) tL++;
        else tD++;

        if (m.season_id) {
          const sid = m.season_id;
          if (!sMap.has(sid)) {
            sMap.set(sid, { season_id: sid, rating_sum: 0, rating_count: 0 });
          }
          const item = sMap.get(sid)!;
          item.rating_sum += parseFloat(s.rating) || 0;
          item.rating_count++;
        }
      }
    });

    const mvInput: MarketValueInput = {
      profile: { primary_position: p.primary_position },
      careerStats: {
        matches_played: tM,
        wins: tW,
        draws: tD,
        losses: tL,
        goals: tG,
        assists: tA,
        cleansheets_gk: tCGK,
        cleansheets_def: tCDEF,
        red_cards: tRC
      },
      seasonStats: Array.from(sMap.values()),
      achievements: achByProfile.get(p.id) || []
    };

    const mvResult = calculateMarketValue(mvInput);

    const playerTeamId = activeMembershipByPlayer.get(p.id);
    const playerTeamName = playerTeamId ? activeTeamsMap.get(playerTeamId) : null;

    return {
      id: p.id,
      username: p.username,
      avatarUrl: p.avatar_url,
      platform: p.platform || 'Bilinmiyor',
      position: p.primary_position || 'Bilinmiyor',
      alternativePositions: p.alternative_positions || [],
      status: playerTeamId ? 'CONTRACTED' : 'FREE',
      teamName: playerTeamName,
      isSuspended: p.status === 'SUSPENDED',
      marketValue: mvResult.totalValue,
      wins: tW,
      draws: tD,
      losses: tL,
      played: tM,
    };
  });

  // Sort Rankings:
  // Primary: Market Value (DESC)
  // Secondary: Username (ASC, deterministic)
  rankingsArray.sort((a, b) => {
    if (b.marketValue !== a.marketValue) {
      return b.marketValue - a.marketValue;
    }
    return a.username.localeCompare(b.username, 'tr', { sensitivity: 'base' });
  });

  return rankingsArray;
}

/**
 * Cached player rankings with 60-second revalidation TTL.
 * Tagged with 'player-rankings' for instant invalidation on admin events.
 */
export const getCachedPlayerRankings = unstable_cache(
  async (): Promise<PlayerRanking[]> => {
    return fetchRawPlayerRankings();
  },
  ['player-rankings-leaderboard'],
  {
    tags: ['player-rankings'],
    revalidate: 60,
  }
);

/**
 * Revalidates player rankings cache tag and path.
 */
export function revalidatePlayerRankings() {
  try {
    revalidateTag('player-rankings', 'max');
  } catch {
    // fallback if called in non-action context
  }
  try {
    revalidatePath('/oyuncular');
  } catch {
    // fallback if called in non-request context
  }
}
