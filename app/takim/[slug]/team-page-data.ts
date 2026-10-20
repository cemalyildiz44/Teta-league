import { createClient } from '@supabase/supabase-js';
import { unstable_cache, revalidateTag, revalidatePath } from 'next/cache';
import { calculateMarketValue, MarketValueInput } from '@/app/utils/marketValueCalculator';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const publicSupabase = createClient(supabaseUrl, supabaseKey);

export interface PublicTeamDetail {
  id: string;
  name: string;
  slug: string;
  ea_club_id: string | null;
  ea_club_name: string | null;
  logo_url: string | null;
  is_active: boolean;
  stream_url: string | null;
  instagram_url: string | null;
}

export interface TeamOpponentSummary {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

export interface TeamRecentMatchItem {
  id: string;
  fixture_id: string;
  date: string | null;
  isHome: boolean;
  opponent: TeamOpponentSummary | null;
  myScore: number;
  oppScore: number;
  status: string;
  week_number: number;
}

export interface TeamUpcomingMatchItem {
  id: string;
  fixture_id: string;
  date: string | null;
  isHome: boolean;
  opponent: TeamOpponentSummary | null;
  status: string;
  week_number: number;
}

export interface TeamTrophyItem {
  id: string;
  awarded_at: string;
  notes: string | null;
  trophy: {
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    category: string | null;
    season_name: string | null;
    season: { name: string } | null;
  };
}

export interface RosterPlayerItem {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  alternative_positions: string[];
  current_ea_player_id: string | null;
  joined_at: string;
  role: string;
  marketValue: number;
  stats: {
    matches: number;
    goals: number;
    assists: number;
    avgRating: string;
  };
}

export interface TeamStatsItem {
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
}

export interface TeamTransferSlotsItem {
  remaining: number;
  total: number;
  isUnlimited: boolean;
}

export interface TeamPageData {
  team: PublicTeamDetail;
  activeLeague: { name: string; level: number } | null;
  activeSeason: { id: string; name: string; status: string } | null;
  teamTrophies: TeamTrophyItem[];
  allTimeWins: number;
  allTimeDraws: number;
  allTimeLosses: number;
  roster: RosterPlayerItem[];
  recentMatches: TeamRecentMatchItem[];
  upcomingMatches: TeamUpcomingMatchItem[];
  transferSlots: TeamTransferSlotsItem;
  totalTeamValue: number;
  stats: TeamStatsItem | null;
}

/**
 * Pure public fetcher for team page data by team slug.
 * Free of request-time cookies, headers, or visitor session state.
 */
export async function fetchRawTeamPageData(slug: string): Promise<TeamPageData | null> {
  if (!slug) return null;

  // 1. Fetch team by slug
  const { data: team } = await publicSupabase
    .from('teams')
    .select('id, name, slug, ea_club_id, ea_club_name, logo_url, is_active, stream_url, instagram_url')
    .eq('slug', slug)
    .maybeSingle();

  if (!team) return null;

  // 2. Parallel fetch: active league/season, all-time matches, all teams (opponent lookup), trophies
  const [
    { data: leagueTeamData },
    { data: allTimeMatches },
    { data: allTeamsData },
    { data: teamTrophiesData }
  ] = await Promise.all([
    publicSupabase
      .from('league_teams')
      .select(`
        season_id,
        league_id,
        leagues!inner (
          name,
          level,
          seasons!inner ( id, name, status )
        )
      `)
      .eq('team_id', team.id)
      .in('leagues.seasons.status', ['UPCOMING', 'ACTIVE'])
      .limit(1)
      .maybeSingle(),
    publicSupabase
      .from('matches')
      .select('id, home_team_id, away_team_id, home_score, away_score')
      .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
      .eq('status', 'APPROVED'),
    publicSupabase
      .from('teams')
      .select('id, name, slug, logo_url, is_active'),
    publicSupabase
      .from('trophy_winners')
      .select(`
        id,
        awarded_at,
        notes,
        trophy:trophies (
          id,
          title,
          description,
          image_url,
          category,
          season_name,
          season:seasons ( name )
        )
      `)
      .eq('team_id', team.id)
      .order('awarded_at', { ascending: false })
  ]);

  const teamTrophies: TeamTrophyItem[] = ((teamTrophiesData || []) as any[]).filter((t: any) => t && t.trophy);
  const activeLeagueObj: any = Array.isArray(leagueTeamData?.leagues) ? leagueTeamData.leagues[0] : leagueTeamData?.leagues;
  const activeSeasonObj: any = Array.isArray(activeLeagueObj?.seasons) ? activeLeagueObj.seasons[0] : activeLeagueObj?.seasons;
  const teamMap = new Map((allTeamsData || []).map((t: any) => [t.id, t]));

  // 3. Compute All-Time match record
  let allTimeWins = 0;
  let allTimeDraws = 0;
  let allTimeLosses = 0;

  if (allTimeMatches) {
    for (const m of allTimeMatches) {
      const isHome = m.home_team_id === team.id;
      const teamScore = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
      const oppScore = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0);

      if (teamScore > oppScore) {
        allTimeWins++;
      } else if (teamScore === oppScore) {
        allTimeDraws++;
      } else {
        allTimeLosses++;
      }
    }
  }

  // 4. Active Season-dependent queries
  let roster: RosterPlayerItem[] = [];
  let recentMatches: TeamRecentMatchItem[] = [];
  let upcomingMatches: TeamUpcomingMatchItem[] = [];
  let stats: TeamStatsItem | null = null;
  let slotRows: any = null;
  let approvedMatchIds: string[] = [];

  if (activeSeasonObj?.id) {
    const [
      { data: slotRowsData },
      { data: memberships },
      { data: seasonStats },
      { data: teamFixtures },
      { data: seasonApprovedMatches }
    ] = await Promise.all([
      publicSupabase.rpc('get_team_transfer_slots', {
        p_team_id: team.id,
        p_season_id: activeSeasonObj.id
      }),
      publicSupabase
        .from('team_memberships')
        .select(`
          joined_at,
          profiles ( id, username, full_name, avatar_url, primary_position, alternative_positions, current_ea_player_id )
        `)
        .eq('team_id', team.id)
        .eq('season_id', activeSeasonObj.id)
        .is('left_at', null)
        .order('joined_at', { ascending: true }),
      publicSupabase
        .from('team_season_stats')
        .select('matches_played, wins, draws, losses, points, goals_for, goals_against')
        .eq('team_id', team.id)
        .eq('season_id', activeSeasonObj.id)
        .maybeSingle(),
      publicSupabase
        .from('fixtures')
        .select(`
          id,
          week_number,
          scheduled_at,
          status,
          home_team_id,
          away_team_id,
          matches (
            id,
            home_score,
            away_score,
            status,
            played_at
          )
        `)
        .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
        .eq('season_id', activeSeasonObj.id)
        .order('week_number', { ascending: true }),
      publicSupabase
        .from('matches')
        .select('id')
        .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
        .eq('season_id', activeSeasonObj.id)
        .eq('status', 'APPROVED')
    ]);

    slotRows = slotRowsData;
    if (seasonStats) {
      stats = {
        matches_played: seasonStats.matches_played,
        wins: seasonStats.wins,
        draws: seasonStats.draws,
        losses: seasonStats.losses,
        points: seasonStats.points,
        goals_for: seasonStats.goals_for,
        goals_against: seasonStats.goals_against,
        goal_difference: (seasonStats.goals_for ?? 0) - (seasonStats.goals_against ?? 0),
      };
    }
    approvedMatchIds = (seasonApprovedMatches || []).map((m: any) => m.id);

    if (memberships) {
      roster = memberships.map((m: any) => {
        const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        return {
          id: prof?.id || '',
          username: prof?.username || '',
          full_name: prof?.full_name || null,
          avatar_url: prof?.avatar_url || null,
          primary_position: prof?.primary_position || null,
          alternative_positions: prof?.alternative_positions || [],
          current_ea_player_id: prof?.current_ea_player_id || null,
          joined_at: m.joined_at,
          role: 'PLAYER',
          marketValue: 0,
          stats: { matches: 0, goals: 0, assists: 0, avgRating: '0.00' }
        };
      });
    }

    if (teamFixtures && teamFixtures.length > 0) {
      const completed: TeamRecentMatchItem[] = [];
      const upcoming: TeamUpcomingMatchItem[] = [];

      teamFixtures.forEach((f: any) => {
        const isHome = f.home_team_id === team.id;
        const opponentId = isHome ? f.away_team_id : f.home_team_id;
        const opponent = teamMap.get(opponentId);
        const matchesList = Array.isArray(f.matches) ? f.matches : f.matches ? [f.matches] : [];
        const appMatch = matchesList.find((m: any) => m.status === 'APPROVED');
        const pendingMatch = matchesList.find((m: any) => m.status === 'PENDING_REVIEW');

        const opponentSummary: TeamOpponentSummary | null = opponent ? {
          id: opponent.id,
          name: opponent.name,
          slug: opponent.slug,
          logo_url: opponent.logo_url || null,
        } : null;

        if (appMatch) {
          completed.push({
            id: appMatch.id,
            fixture_id: f.id,
            date: appMatch.played_at || f.scheduled_at,
            isHome,
            opponent: opponentSummary,
            myScore: isHome ? (appMatch.home_score ?? 0) : (appMatch.away_score ?? 0),
            oppScore: isHome ? (appMatch.away_score ?? 0) : (appMatch.home_score ?? 0),
            status: 'APPROVED',
            week_number: f.week_number,
          });
        } else if (f.status !== 'CANCELLED') {
          upcoming.push({
            id: pendingMatch ? pendingMatch.id : f.id,
            fixture_id: f.id,
            date: f.scheduled_at,
            isHome,
            opponent: opponentSummary,
            status: pendingMatch ? 'PENDING_REVIEW' : f.status || 'SCHEDULED',
            week_number: f.week_number,
          });
        }
      });

      completed.sort((a, b) => {
        if (a.date && b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();
        return b.week_number - a.week_number;
      });
      recentMatches = completed.slice(0, 5);

      upcoming.sort((a, b) => {
        if (a.date && b.date) return new Date(a.date).getTime() - new Date(b.date).getTime();
        return a.week_number - b.week_number;
      });
      upcomingMatches = upcoming.slice(0, 5);
    }
  } else {
    const { data: slotRowsData } = await publicSupabase.rpc('get_team_transfer_slots', {
      p_team_id: team.id,
      p_season_id: null
    });
    slotRows = slotRowsData;
  }

  const slotData = Array.isArray(slotRows) && slotRows.length > 0 ? slotRows[0] : null;
  const isUnlimited = (slotData as any)?.is_unlimited ?? ((slotData?.total_slots ?? 0) >= 999);
  const transferSlots: TeamTransferSlotsItem = {
    remaining: slotData?.remaining_slots ?? 5,
    total: slotData?.total_slots ?? 5,
    isUnlimited
  };

  // 5. Roster Stats & Market Value Bulk Fetch
  let totalTeamValue = 0;
  if (roster.length > 0) {
    const profileIds = roster.map((r) => r.id).filter(Boolean);
    const shouldFetchRosterStats = approvedMatchIds.length > 0 && profileIds.length > 0;

    const [pStatsRes, bulkStatsRes, bulkAchievementsRes] = await Promise.all([
      shouldFetchRosterStats
        ? publicSupabase
            .from('match_player_stats')
            .select('player_id, goals, assists, rating')
            .in('match_id', approvedMatchIds)
            .in('player_id', profileIds)
        : Promise.resolve({ data: null }),
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
        : Promise.resolve({ data: [] })
    ]);

    const pStats = pStatsRes.data;
    if (pStats && pStats.length > 0) {
      roster = roster.map((r) => {
        const myStats = pStats.filter((s: any) => s.player_id === r.id);
        if (myStats.length > 0) {
          const matchesCount = myStats.length;
          const goals = myStats.reduce((sum: number, s: any) => sum + (s.goals || 0), 0);
          const assists = myStats.reduce((sum: number, s: any) => sum + (s.assists || 0), 0);
          const totalRating = myStats.reduce((sum: number, s: any) => sum + (parseFloat(s.rating) || 0), 0);
          return {
            ...r,
            stats: {
              matches: matchesCount,
              goals,
              assists,
              avgRating: (totalRating / matchesCount).toFixed(2)
            }
          };
        }
        return r;
      });
    }

    const bulkStats = bulkStatsRes.data;
    const bulkAchievements = bulkAchievementsRes.data;

    const achByProfile = new Map<string, any[]>();
    if (bulkAchievements) {
      bulkAchievements.forEach((a: any) => {
        if (!achByProfile.has(a.player_id)) achByProfile.set(a.player_id, []);
        achByProfile.get(a.player_id)!.push(a);
      });
    }

    const statsByPlayerId = new Map<string, any[]>();
    if (bulkStats) {
      bulkStats.forEach((s: any) => {
        if (s.player_id) {
          if (!statsByPlayerId.has(s.player_id)) statsByPlayerId.set(s.player_id, []);
          statsByPlayerId.get(s.player_id)!.push(s);
        }
      });
    }

    roster.forEach((r) => {
      let tM = 0, tW = 0, tD = 0, tL = 0, tG = 0, tA = 0, tCGK = 0, tCDEF = 0, tRC = 0;
      const sMap = new Map<string, { season_id: string; rating_sum: number; rating_count: number }>();
      const pStatsList = r.id ? statsByPlayerId.get(r.id) || [] : [];

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

          const sid = m.season_id;
          if (sid) {
            if (!sMap.has(sid)) sMap.set(sid, { season_id: sid, rating_sum: 0, rating_count: 0 });
            const item = sMap.get(sid)!;
            item.rating_sum += parseFloat(s.rating) || 0;
            item.rating_count++;
          }
        }
      });

      const mvInput: MarketValueInput = {
        profile: { primary_position: r.primary_position },
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
        achievements: achByProfile.get(r.id) || []
      };

      const res = calculateMarketValue(mvInput);
      r.marketValue = res.totalValue;
      totalTeamValue += res.totalValue;
    });
  }

  return {
    team,
    activeLeague: activeLeagueObj ? { name: activeLeagueObj.name, level: activeLeagueObj.level } : null,
    activeSeason: activeSeasonObj ? { id: activeSeasonObj.id, name: activeSeasonObj.name, status: activeSeasonObj.status } : null,
    teamTrophies,
    allTimeWins,
    allTimeDraws,
    allTimeLosses,
    roster,
    recentMatches,
    upcomingMatches,
    transferSlots,
    totalTeamValue,
    stats,
  };
}

/**
 * Cached public team page data with 60-second TTL.
 * Tagged with 'public-team-page' and granular 'team-[slug]' tag.
 */
export async function getCachedTeamPageData(slug: string): Promise<TeamPageData | null> {
  if (!slug) return null;

  const fetcher = unstable_cache(
    async () => fetchRawTeamPageData(slug),
    ['public-team-page-data', slug],
    {
      tags: ['public-team-page', `team-${slug}`],
      revalidate: 60,
    }
  );

  return fetcher();
}

/**
 * Revalidates public team page cache tags and paths.
 */
export function revalidateTeamPage(slug?: string) {
  try {
    revalidateTag('public-team-page', 'max');
    if (slug) {
      revalidateTag(`team-${slug}`, 'max');
      revalidatePath(`/takim/${slug}`);
    }
  } catch {
    // fallback if called in non-action context
  }
}
