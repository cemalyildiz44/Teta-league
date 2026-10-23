import { createClient } from '@supabase/supabase-js';
import { unstable_cache, revalidateTag, revalidatePath } from 'next/cache';
import { calculateMarketValue, MarketValueInput } from '@/app/utils/marketValueCalculator';
import { PlayerRanking } from './PlayerRankingsClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const publicSupabase = createClient(supabaseUrl, supabaseKey);

// Supabase/PostgREST returns at most 1000 rows per request; larger results are silently truncated.
const PAGE_SIZE = 1000;
// Keeps `.in(...)` request URLs short (hundreds of UUIDs in one URL are fragile).
const ID_CHUNK_SIZE = 100;

type PageResult = { data: any[] | null; error: { message: string } | null };

/**
 * Reads every page of a query (ordered deterministically by the caller) until a short page is returned.
 * Throws on any query error so partial data is never used for market value calculation.
 */
async function fetchAllPages(
  label: string,
  buildQuery: (from: number, to: number) => PromiseLike<PageResult>
): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`[player-rankings] "${label}" sorgusu başarısız oldu: ${error.message}`);
    }
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Same as fetchAllPages, but splits a large id list into chunks. */
async function fetchAllPagesByIds(
  label: string,
  ids: string[],
  buildQuery: (chunk: string[], from: number, to: number) => PromiseLike<PageResult>
): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ID_CHUNK_SIZE);
    rows.push(...(await fetchAllPages(label, (from, to) => buildQuery(chunk, from, to))));
  }
  return rows;
}

/**
 * Pure public data fetcher and calculation engine for player rankings.
 * Free of request-time APIs (no request cookies, headers, or session state).
 * Reads strictly public tables with anonymous access.
 * Throws if any required query fails, so incomplete data never produces wrong market values.
 */
export async function fetchRawPlayerRankings(): Promise<PlayerRanking[]> {
  // 1. Fetch profiles (only required columns, pre-filtering non-banned profiles)
  const profiles = await fetchAllPages('profiles', (from, to) =>
    publicSupabase
      .from('profiles')
      .select('id, username, avatar_url, platform, primary_position, alternative_positions, status')
      .or('status.neq.BANNED,status.is.null')
      .order('id')
      .range(from, to)
  );

  const validProfiles = (profiles || []).filter((p: any) => p.status !== 'BANNED');
  const profileIds = validProfiles.map((p: any) => p.id);

  // 2. Concurrently fetch memberships, stats, achievements, active teams
  const [ memData, bulkStats, bulkAchievements, activeTeamsData ] = await Promise.all([
    fetchAllPagesByIds('team_memberships', profileIds, (chunk, from, to) =>
      publicSupabase
        .from('team_memberships')
        .select('player_id, team_id')
        .in('player_id', chunk)
        .is('left_at', null)
        .order('player_id')
        .order('team_id')
        .range(from, to)
    ),
    fetchAllPagesByIds('match_player_stats', profileIds, (chunk, from, to) =>
      publicSupabase
        .from('match_player_stats')
        .select('id, player_id, team_id, goals, assists, rating, cleansheets_gk, cleansheets_def, red_cards, matches!inner(home_team_id, away_team_id, home_score, away_score, status, season_id)')
        .in('player_id', chunk)
        .eq('matches.status', 'APPROVED')
        .order('id')
        .range(from, to)
    ),
    fetchAllPagesByIds('player_achievements', profileIds, (chunk, from, to) =>
      publicSupabase
        .from('player_achievements')
        .select('id, player_id, achievement_type, season_id')
        .in('player_id', chunk)
        .order('id')
        .range(from, to)
    ),
    fetchAllPages('teams', (from, to) =>
      publicSupabase.from('teams').select('id, name').eq('is_active', true).order('id').range(from, to)
    ),
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
          // NULL (or non-numeric) ratings are skipped: they must not count as 0 in the season average.
          const ratingValue = parseFloat(s.rating);
          if (Number.isFinite(ratingValue)) {
            const sid = m.season_id;
            if (!sMap.has(sid)) {
              sMap.set(sid, { season_id: sid, rating_sum: 0, rating_count: 0 });
            }
            const item = sMap.get(sid)!;
            item.rating_sum += ratingValue;
            item.rating_count++;
          }
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
