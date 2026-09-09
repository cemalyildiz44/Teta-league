import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { calculateMarketValue, formatEuro, MarketValueInput } from "@/app/utils/marketValueCalculator";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = await params;
  const username = decodeURIComponent(resolvedParams.username);
  return {
    title: `${username} | TETA League`,
  };
}

// Visuals removed as per market value requirement

export default async function PlayerProfilePage({ params, searchParams }: { params: Promise<{ username: string }>, searchParams: Promise<{ tab?: string }> }) {
  const resolvedParams = await params;
  const paramVal = decodeURIComponent(resolvedParams.username);
  const resolvedSearchParams = await searchParams;
  const activeTab = resolvedSearchParams.tab || 'genel';
  
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Legacy UUID redirect
  const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRx.test(paramVal)) {
    const { data: lp } = await supabase.from("profiles").select("username").eq("id", paramVal).maybeSingle();
    if (lp?.username) redirect(`/oyuncular/${encodeURIComponent(lp.username)}`);
    else notFound();
  }

  // ── 1. Profile ─────────────────────────────────────────────────────
  const { data: profile } = await supabase.from("profiles").select("*").ilike("username", paramVal).maybeSingle();
  if (!profile) notFound();

  // ── 2. Parallel Fetches ────────────────────────────────────────────
  let playerStats: any[] = [];
  let approvedMatches: any[] = [];
  if (profile.current_ea_player_id) {
    const { data: statsWithMatches } = await supabase
      .from("match_player_stats")
      .select("*, matches!inner(id, home_team_id, away_team_id, home_score, away_score, season_id, league_id, played_at, status, fixtures(week_number))")
      .eq("ea_player_id", profile.current_ea_player_id)
      .eq("matches.status", "APPROVED");
      
    if (statsWithMatches) {
      playerStats = statsWithMatches;
      approvedMatches = statsWithMatches.map((s: any) => s.matches);
    }
  }

  const [
    { data: membershipsData },
    { data: allSeasonsData },
    { data: allLeaguesData },
    { data: playerAchievementsData },
    { data: legacyStatsData }
  ] = await Promise.all([
    supabase.from("team_memberships").select("*").eq("player_id", profile.id).order("joined_at", { ascending: false }),
    supabase.from("seasons").select("id, name, slug"),
    supabase.from("leagues").select("id, name, season_id"),
    supabase.from('player_achievements').select('achievement_type, season_id').eq('player_id', profile.id),
    supabase.from('player_legacy_career_stats').select('*').eq('player_id', profile.id).is('deleted_at', null).order('season_name', { ascending: false })
  ]);

  const legacyStats = legacyStatsData || [];
  const memberships = membershipsData || [];
  const activeMembership = memberships.find((m) => !m.left_at);
  const matchMap = new Map(approvedMatches.map((m) => [m.id, m]));
  const seasonsMap = new Map((allSeasonsData || []).map((s) => [s.id, s]));
  const leaguesMap = new Map((allLeaguesData || []).map((l) => [l.id, l]));

  // Teams
  const teamIds = new Set<string>();
  approvedMatches.forEach((m) => { teamIds.add(m.home_team_id); teamIds.add(m.away_team_id); });
  memberships.forEach((m) => { if (m.team_id) teamIds.add(m.team_id); });
  legacyStats.forEach((l: any) => { if (l.team_id) teamIds.add(l.team_id); });
  const { data: allTeamsData } = await supabase.from("teams").select("id, name, slug, logo_url, is_active").in("id", teamIds.size > 0 ? Array.from(teamIds) : ["00000000-0000-0000-0000-000000000000"]);
  const teamsMap = new Map((allTeamsData || []).map((t) => [t.id, t]));

  const activeTeamRaw = activeMembership ? teamsMap.get(activeMembership.team_id) : null;
  const activeTeam = (activeTeamRaw && activeTeamRaw.is_active !== false) ? activeTeamRaw : null;

  // ── 4. Aggregate ───────────────────────────────────────────────────
  let tM = 0, tG = 0, tA = 0, tR = 0, tW = 0, tD = 0, tL = 0, tSh = 0, tPM = 0, tPA = 0, tTM = 0, tTA = 0, tSv = 0, tGC = 0, tMOM = 0, tRC = 0, tCGK = 0, tCDEF = 0;
  const slMap = new Map<string, any>();
  const matchLevel: any[] = [];

  for (const s of playerStats) {
    const m = matchMap.get(s.match_id);
    if (!m) continue;
    tM++; tG += s.goals || 0; tA += s.assists || 0; tR += parseFloat(s.rating) || 0;
    tSh += s.shots || 0; tPM += s.passes_made || 0; tPA += s.pass_attempts || 0;
    tTM += s.tackles_made || 0; tTA += s.tackle_attempts || 0; tSv += s.saves || 0;
    tGC += s.goals_conceded || 0; tMOM += s.is_mom ? 1 : 0; tRC += s.red_cards || 0;
    tCGK += s.cleansheets_gk || 0; tCDEF += s.cleansheets_def || 0;

    const isHome = s.team_id === m.home_team_id;
    const my = isHome ? m.home_score : m.away_score;
    const opp = isHome ? m.away_score : m.home_score;
    let res: "W" | "D" | "L" = "D";
    if (my > opp) { res = "W"; tW++; } 
    else if (my < opp) { res = "L"; tL++; } 
    else { res = "D"; tD++; }

    matchLevel.push({
      matchId: m.id, playedAt: m.played_at, rating: parseFloat(s.rating) || 0,
      goals: s.goals || 0, assists: s.assists || 0, result: res,
      myScore: my, oppScore: opp, teamId: s.team_id,
      opponentId: isHome ? m.away_team_id : m.home_team_id,
      weekNumber: (m.fixtures as any)?.week_number, seasonId: m.season_id, leagueId: m.league_id,
      position: s.position, isMom: s.is_mom
    });

    if (m.season_id && m.league_id) {
      const k = `${m.season_id}_${m.league_id}_${s.team_id}`;
      if (!slMap.has(k)) {
        const sn = seasonsMap.get(m.season_id) || (m.seasons as any);
        const ln = leaguesMap.get(m.league_id) || (m.leagues as any);
        slMap.set(k, { seasonId: m.season_id, seasonName: sn?.name || "?", leagueId: m.league_id, leagueName: ln?.name || "?", teamId: s.team_id, matches: 0, goals: 0, assists: 0, wins: 0, ratingSum: 0 });
      }
      const p = slMap.get(k)!;
      p.matches++; p.goals += s.goals || 0; p.assists += s.assists || 0; p.ratingSum += parseFloat(s.rating) || 0;
      if (res === "W") p.wins++;
    }
  }

  // Market Value Calculation
  // We aggregate ratings strictly by season_id to prevent double counting
  // for players who played in multiple teams/leagues in the same season.
  const mvSeasonStatsMap = new Map<string, { season_id: string, rating_sum: number, rating_count: number }>();
  for (const s of slMap.values()) {
    if (!mvSeasonStatsMap.has(s.seasonId)) {
      mvSeasonStatsMap.set(s.seasonId, { season_id: s.seasonId, rating_sum: 0, rating_count: 0 });
    }
    const mvS = mvSeasonStatsMap.get(s.seasonId)!;
    mvS.rating_sum += s.ratingSum;
    mvS.rating_count += s.matches;
  }

  const mvInput: MarketValueInput = {
    profile: { primary_position: profile.primary_position },
    careerStats: { matches_played: tM, wins: tW, draws: tD, losses: tL, goals: tG, assists: tA, cleansheets_gk: tCGK, cleansheets_def: tCDEF, red_cards: tRC },
    seasonStats: Array.from(mvSeasonStatsMap.values()),
    achievements: playerAchievementsData || []
  };
  const marketValue = calculateMarketValue(mvInput);

  const avgRating = tM > 0 ? (tR / tM).toFixed(2) : "0.00";
  const passAcc = tPA > 0 ? ((tPM / tPA) * 100).toFixed(0) : "0";
  const tackleAcc = tTA > 0 ? ((tTM / tTA) * 100).toFixed(0) : "0";

  // Recent 12
  const allMatchesSorted = [...matchLevel].sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  const recent12 = allMatchesSorted.slice(0, 12);
  const r12Avg = recent12.length > 0 ? recent12.reduce((s, m) => s + m.rating, 0) / recent12.length : 0;
  const r12W = recent12.filter((m) => m.result === "W").length;
  const r12D = recent12.filter((m) => m.result === "D").length;
  const r12L = recent12.filter((m) => m.result === "L").length;

  // ── Combined Career Totals (Official + Granular Legacy Career) ────────
  const legacyTotalMatches = legacyStats.reduce((sum: number, l: any) => sum + (l.matches_played || 0), 0);
  const legacyTotalGoals = legacyStats.reduce((sum: number, l: any) => sum + (l.goals || 0), 0);
  const legacyTotalAssists = legacyStats.reduce((sum: number, l: any) => sum + (l.assists || 0), 0);
  const legacyTotalWins = legacyStats.reduce((sum: number, l: any) => sum + (l.wins || 0), 0);
  const legacyTotalDraws = legacyStats.reduce((sum: number, l: any) => sum + (l.draws || 0), 0);
  const legacyTotalLosses = legacyStats.reduce((sum: number, l: any) => sum + (l.losses || 0), 0);
  const legacyTotalRedCards = legacyStats.reduce((sum: number, l: any) => sum + (l.red_cards || 0), 0);
  const legacyTotalCleanSheets = legacyStats.reduce((sum: number, l: any) => sum + (l.clean_sheets || 0), 0);
  const legacyRatingProductSum = legacyStats.reduce((sum: number, l: any) => sum + ((Number(l.rating_avg) || 0) * (l.matches_played || 0)), 0);

  const combinedTotalMatches = tM + legacyTotalMatches;
  const combinedTotalGoals = tG + legacyTotalGoals;
  const combinedTotalAssists = tA + legacyTotalAssists;
  const combinedTotalWins = tW + legacyTotalWins;
  const combinedTotalDraws = tD + legacyTotalDraws;
  const combinedTotalLosses = tL + legacyTotalLosses;
  const combinedTotalRedCards = tRC + legacyTotalRedCards;

  // Weighted average rating calculation
  const combinedAvgRating = combinedTotalMatches > 0
    ? ((tR + legacyRatingProductSum) / combinedTotalMatches).toFixed(2)
    : "0.00";

  // ── Unified Season Stats (Official + Legacy) ──────────────────────────
  interface UnifiedSeasonStat {
    isLegacy: boolean;
    seasonName: string;
    leagueName: string;
    teamName: string;
    teamSlug?: string;
    teamLogo?: string | null;
    matches: number;
    goals: number;
    assists: number;
    avgRating: number;
    wins?: number;
    draws?: number;
    losses?: number;
    cleanSheets?: number;
    redCards?: number;
    marketValue?: number;
    notes?: string | null;
  }

  const officialSeasonCards: UnifiedSeasonStat[] = Array.from(slMap.values()).map((p) => {
    const t = teamsMap.get(p.teamId);
    return {
      isLegacy: false,
      seasonName: p.seasonName,
      leagueName: p.leagueName,
      teamName: t?.name || "?",
      teamSlug: t?.slug,
      teamLogo: t?.logo_url,
      matches: p.matches,
      goals: p.goals,
      assists: p.assists,
      avgRating: p.matches > 0 ? p.ratingSum / p.matches : 0,
      wins: p.wins
    };
  });

  const legacySeasonCards: UnifiedSeasonStat[] = legacyStats.map((l: any) => {
    const t = l.team_id ? teamsMap.get(l.team_id) : null;
    return {
      isLegacy: true,
      seasonName: l.season_name,
      leagueName: l.league_name,
      teamName: l.team_name,
      teamSlug: t?.slug,
      teamLogo: t?.logo_url,
      matches: l.matches_played,
      goals: l.goals,
      assists: l.assists,
      avgRating: Number(l.rating_avg) || 0,
      wins: l.wins,
      draws: l.draws,
      losses: l.losses,
      cleanSheets: l.clean_sheets,
      redCards: l.red_cards,
      marketValue: l.market_value,
      notes: l.notes
    };
  });

  const allSeasonStats: UnifiedSeasonStat[] = [...officialSeasonCards, ...legacySeasonCards]
    .sort((a, b) => b.seasonName.localeCompare(a.seasonName, "tr", { numeric: true }));

  // Career timeline (consolidate consecutive memberships + legacy career teams)
  interface TimelineItem {
    teamId?: string | null;
    leagueId?: string | null;
    seasonId?: string | null;
    teamName: string;
    teamSlug?: string;
    teamLogo?: string | null;
    joinedAt?: string;
    leftAt?: string | null;
    isCurrent: boolean;
    joinedFmt: string;
    leagueName: string | null;
    seasonName: string | null;
    isLegacy?: boolean;
    matches?: number;
    goals?: number;
    assists?: number;
  }

  const timeline: TimelineItem[] = [];
  for (const m of memberships) {
    const prev = timeline[timeline.length - 1];
    if (prev && prev.teamId === m.team_id && prev.leagueId === m.league_id && prev.seasonId === m.season_id) {
      // Merge consecutive memberships for same team, league and season
      if (new Date(m.joined_at) < new Date(prev.joinedAt!)) {
        prev.joinedAt = m.joined_at;
        prev.joinedFmt = new Date(m.joined_at).getFullYear().toString();
      }
      if (!m.left_at) {
        prev.isCurrent = true;
        prev.leftAt = null;
      }
    } else {
      const t = teamsMap.get(m.team_id);
      const lg = leaguesMap.get(m.league_id);
      const sn = seasonsMap.get(m.season_id);
      timeline.push({
        teamId: m.team_id,
        leagueId: m.league_id,
        seasonId: m.season_id,
        teamName: t?.name || "?",
        teamSlug: t?.slug,
        teamLogo: t?.logo_url,
        joinedAt: m.joined_at,
        leftAt: m.left_at,
        isCurrent: !m.left_at,
        joinedFmt: new Date(m.joined_at).getFullYear().toString(),
        leagueName: lg?.name || null,
        seasonName: sn?.name || null,
        isLegacy: false,
      });
    }
  }

  const legacyTimelineItems: TimelineItem[] = legacyStats.map((l: any) => {
    const t = l.team_id ? teamsMap.get(l.team_id) : null;
    return {
      teamId: l.team_id,
      teamName: l.team_name,
      teamSlug: t?.slug,
      teamLogo: t?.logo_url,
      isCurrent: false,
      isLegacy: true,
      joinedFmt: l.season_name,
      leagueName: l.league_name,
      seasonName: l.season_name,
      matches: l.matches_played,
      goals: l.goals,
      assists: l.assists,
    };
  });

  const fullTimeline: TimelineItem[] = [...timeline, ...legacyTimelineItems];

  const currentLeague = (activeTeam && activeMembership) ? leaguesMap.get(activeMembership.league_id) : null;

  // Achievements
  const [
    { data: tournamentsData },
    { data: ncData }
  ] = await Promise.all([
    supabase
      .from('tournament_winners')
      .select('id, placement, tournaments(name, type, image_url, seasons(name)), tournament_applications(team_name)')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false }),
      
    supabase
      .from('tournament_application_players')
      .select('application_id, tournament_applications(team_name, tournament_winners(id, placement, tournaments(name, type, image_url, seasons(name))))')
      .eq('profile_id', profile.id)
  ]);

  const directTournaments = tournamentsData || [];
  const ncWins = (ncData || [])
    .filter((a: any) => a.tournament_applications?.tournament_winners?.length > 0)
    .map((a: any) => ({
      id: a.tournament_applications.tournament_winners[0].id,
      placement: a.tournament_applications.tournament_winners[0].placement,
      tournaments: a.tournament_applications.tournament_winners[0].tournaments,
      tournament_applications: { team_name: a.tournament_applications.team_name }
    }));
    
  const allTrophies = [...directTournaments, ...ncWins];
  
  const achievementCounts = {
    TOTW: 0,
    MATCH_POTM: 0,
    MONTH_POTM: 0,
    POTS: 0,
    KARMA_WINNER: 0,
    '1V1_WINNER': 0,
    NIGHT_CUP_WINNER: 0
  };
  
  if (playerAchievementsData) {
    playerAchievementsData.forEach((a: any) => {
      if (achievementCounts[a.achievement_type as keyof typeof achievementCounts] !== undefined) {
        achievementCounts[a.achievement_type as keyof typeof achievementCounts]++;
      }
    });
  }

  const tabs = [
    { id: 'genel', label: 'GENEL' },
    { id: 'maclar', label: 'MAÇLAR' },
    { id: 'sezonlar', label: 'SEZONLAR' },
    { id: 'kariyer', label: 'KARİYER' },
    { id: 'basarilar', label: 'BAŞARILAR' },
  ];

  return (
    <main className="min-h-screen bg-[#01060b] pt-8 pb-20">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6">

        {/* ════════════════════════════════════════════════════════════ */}
        {/* HEADER — 3 Bölge: Sol (Bilgi), Orta (Kariyer), Sağ (Görsel) */}
        {/* ════════════════════════════════════════════════════════════ */}
        <section className="mb-6 grid grid-cols-1 md:grid-cols-[1fr_250px] lg:grid-cols-[1fr_220px_280px] xl:grid-cols-[1fr_260px_320px] gap-4 md:gap-6 items-stretch">
          
          {/* SOL: Oyuncu Bilgileri */}
          <div className="bg-[#03070c] border border-white/5 rounded-2xl p-6 lg:p-8 flex flex-col justify-center">
            <div className="flex gap-4 md:gap-6 items-start">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-[#0a1628] border border-white/10 overflow-hidden shrink-0 shadow-lg">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#00e5ff]/10 to-transparent">
                    <span className="text-3xl font-[900] text-[#00e5ff]/40">{profile.username.charAt(0).toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex flex-wrap gap-2 mb-3">
                  {profile.primary_position && <span className="px-2.5 py-0.5 rounded-md text-[10px] font-[900] tracking-widest bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/30 uppercase">{profile.primary_position}</span>}
                  {profile.platform && <span className="px-2.5 py-0.5 rounded-md text-[10px] font-[900] tracking-widest bg-white/5 text-gray-400 border border-white/10 uppercase">{profile.platform}</span>}
                </div>
                <h1 className="text-3xl md:text-4xl lg:text-[40px] font-[900] text-white tracking-tight uppercase leading-none truncate mb-2">
                  {profile.username}
                </h1>
                {profile.full_name && <p className="text-[#00e5ff] text-[14px] font-[700] tracking-wide mb-1.5">{profile.full_name}</p>}
                {profile.current_ea_player_id && <p className="text-[12px] text-gray-500 font-mono">EA ID: <span className="text-gray-400 font-[600]">{profile.current_ea_player_id}</span></p>}
              </div>
            </div>
            {profile.bio && (
              <div className="mt-6 pt-5 border-t border-white/5 text-[13px] text-gray-400 leading-relaxed font-medium">
                "{profile.bio}"
              </div>
            )}
            {((profile.discord_url || profile.social_links?.discord) || (profile.instagram_url || profile.social_links?.instagram)) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {(profile.discord_url || profile.social_links?.discord) && (
                  <a
                    href={profile.discord_url || profile.social_links?.discord}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#5865F2]/30 transition-colors text-[#5865F2] text-[12px] font-[800] uppercase tracking-wider"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.419-2.1569 2.419zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.419-2.1568 2.419z"/>
                    </svg>
                    Discord
                  </a>
                )}
                {(profile.instagram_url || profile.social_links?.instagram) && (
                  <a
                    href={profile.instagram_url || profile.social_links?.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 transition-colors text-pink-400 text-[12px] font-[800] uppercase tracking-wider"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                    Instagram
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ORTA: Kulüp Bilgisi */}
          <div className="bg-[#03070c] border border-white/5 rounded-2xl p-6 lg:p-8 flex flex-col justify-center">
            {activeTeam ? (
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/10 p-3 mb-4 flex items-center justify-center">
                  {activeTeam.logo_url ? <img src={activeTeam.logo_url} alt="" className="w-full h-full object-contain" /> : <span className="text-2xl font-black text-[#00e5ff]">{activeTeam.name.substring(0, 2)}</span>}
                </div>
                <Link href={`/takim/${activeTeam.slug}`} className="text-[18px] md:text-[20px] font-[900] text-white hover:text-[#00e5ff] transition-colors uppercase tracking-wide">
                  {activeTeam.name}
                </Link>
                {currentLeague && <div className="text-[12px] font-[700] text-[#00e5ff]/70 mt-1.5 uppercase tracking-wider">{(currentLeague as any).name}</div>}
                <div className="mt-5 inline-flex px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-[900] rounded-full uppercase tracking-widest">
                  Sözleşmeli
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center opacity-60">
                <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/10 mb-4 flex items-center justify-center text-4xl">🚫</div>
                <div className="text-[18px] font-[900] text-white tracking-wide uppercase">Kulüpsüz</div>
                <div className="mt-5 inline-flex px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-[900] rounded-full uppercase tracking-widest">
                  Serbest Oyuncu
                </div>
              </div>
            )}
          </div>

          {/* SAĞ: PİYASA DEĞERİ */}
          <div className="bg-[#03070c] border border-white/5 rounded-2xl p-6 lg:p-8 flex flex-col justify-center items-center text-center relative overflow-hidden h-full min-h-[220px]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00e5ff]/5 via-transparent to-transparent opacity-50" />
            <div className="text-[12px] font-[900] text-gray-500 tracking-[0.3em] uppercase mb-4 z-10">PİYASA DEĞERİ</div>
            <div className="text-4xl lg:text-5xl font-[900] text-[#00e5ff] tracking-tighter drop-shadow-[0_0_15px_rgba(0,229,255,0.3)] z-10">
              {formatEuro(marketValue.totalValue)}
            </div>

          </div>

        </section>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* KARİYER STATS BAR                                            */}
        {/* ════════════════════════════════════════════════════════════ */}
        <section className="bg-white/[0.02] border border-white/5 rounded-2xl flex flex-wrap lg:flex-nowrap divide-x divide-y lg:divide-y-0 divide-white/5 overflow-hidden">
          {[
            { l: "TOPLAM MAÇ", v: combinedTotalMatches, c: "text-white" },
            { l: "GOL", v: combinedTotalGoals, c: "text-white" },
            { l: "ASİST", v: combinedTotalAssists, c: "text-white" },
            { l: "GALİBİYET", v: combinedTotalWins, c: "text-emerald-400" },
            { l: "ORT. RATING", v: combinedAvgRating, c: "text-[#00e5ff]" },
            { l: "KAZANILAN KUPA", v: allTrophies.length, c: "text-amber-400" },
          ].map((s, i) => (
            <div key={i} className="flex-1 min-w-[120px] px-4 py-6 flex flex-col items-center justify-center hover:bg-white/[0.02] transition-colors">
              <span className={`text-[28px] md:text-[32px] font-[900] leading-none mb-2 ${s.c} ${s.c.includes("00e5ff") ? "drop-shadow-[0_0_12px_rgba(0,229,255,0.4)]" : ""}`}>{s.v}</span>
              <span className="text-[10px] font-[800] tracking-[0.15em] text-gray-500 uppercase text-center">{s.l}</span>
            </div>
          ))}
        </section>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* TAB NAVIGATION                                               */}
        {/* ════════════════════════════════════════════════════════════ */}
        <nav className="mt-8 sticky top-[60px] z-40 bg-[#01060b]/95 backdrop-blur-md border-b border-white/10 -mx-4 lg:-mx-6 px-4 lg:px-6 mb-6">
          <div className="flex gap-1 md:gap-2 overflow-x-auto custom-scrollbar py-0">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Link 
                  key={tab.id}
                  href={`?tab=${tab.id}`} 
                  scroll={false}
                  className={`px-4 py-4 text-[11px] font-[900] tracking-widest uppercase whitespace-nowrap transition-all border-b-2 ${
                    isActive
                      ? 'text-[#00e5ff] border-[#00e5ff] bg-[#00e5ff]/5 drop-shadow-[0_0_8px_rgba(0,229,255,0.3)]'
                      : 'text-gray-500 hover:text-gray-300 border-transparent hover:border-white/20'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* TAB CONTENTS                                                 */}
        {/* ════════════════════════════════════════════════════════════ */}
        <div className="animate-in fade-in duration-500">
          
          {/* GENEL TAB */}
          {activeTab === 'genel' && (
            <div className="space-y-6">
              {/* SON FORM (ÖZET GRAFİK) */}
              <section>
                <h2 className="text-[14px] font-[900] text-gray-500 tracking-widest uppercase mb-3">SON 12 MAÇ FORMU</h2>
                {recent12.length > 0 ? (
                  <div className="bg-[#03070c] border border-white/5 rounded-2xl overflow-hidden p-6">
                    <div className="flex flex-col md:flex-row gap-8">
                      <div className="flex flex-col justify-center min-w-[160px]">
                        <div className="flex flex-col gap-2 text-[14px] font-[700]">
                          <div className="flex justify-between text-emerald-400"><span>Galibiyet</span><span>{r12W}</span></div>
                          <div className="flex justify-between text-amber-400"><span>Beraberlik</span><span>{r12D}</span></div>
                          <div className="flex justify-between text-red-400"><span>Mağlubiyet</span><span>{r12L}</span></div>
                          <div className="flex justify-between text-white mt-2 pt-2 border-t border-white/10"><span>Ort. Rating</span><span className="text-[#00e5ff] font-[900] text-[16px]">{r12Avg.toFixed(2)}</span></div>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col justify-end md:border-l border-white/5 md:pl-8 min-h-[120px]">
                        <div className="flex items-end justify-between h-[100px] w-full gap-[3px]">
                          {recent12.slice().reverse().map((m, i) => {
                            const h = Math.max(((m.rating - 4) / 6) * 100, 10);
                            const bg = m.rating >= 8 ? "bg-[#00e5ff]" : m.rating >= 7 ? "bg-emerald-400" : m.rating >= 6 ? "bg-amber-400" : "bg-red-400";
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                                <span className={`text-[10px] font-[900] opacity-0 group-hover:opacity-100 transition-opacity absolute -top-5 ${bg.replace("bg-", "text-")}`}>{m.rating.toFixed(1)}</span>
                                <div className={`w-full ${bg} opacity-80 group-hover:opacity-100 transition-all rounded-t`} style={{ height: `${h}%` }} />
                                <div className={`w-2 h-2 rounded-full mt-2 ${m.result === "W" ? "bg-emerald-400" : m.result === "D" ? "bg-amber-400" : "bg-red-400"}`} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#03070c] border border-white/5 rounded-2xl px-6 py-8 text-center text-[12px] font-[700] text-gray-600">Henüz maç verisi yok.</div>
                )}
              </section>

              {/* DETAYLI İSTATİSTİKLER */}
              <section>
                <h2 className="text-[14px] font-[900] text-gray-500 tracking-widest uppercase mb-3">DETAYLI İSTATİSTİKLER</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
                  {[
                    { label: "ŞUT", value: tSh, sub: null },
                    { label: "PAS İSABETİ", value: `${passAcc}%`, sub: `${tPM}/${tPA}` },
                    { label: "MÜDAHALE", value: `${tackleAcc}%`, sub: `${tTM}/${tTA}` },
                    { label: "KURTARIŞ", value: tSv, sub: null },
                    { label: "YENEN GOL", value: tGC, sub: null, danger: true },
                    { label: "KIRMIZI KART", value: combinedTotalRedCards, sub: null, danger: true },
                    { label: "MAÇIN ADAMI", value: tMOM, sub: null, accent: true },
                    { label: "TOPLAM KATKI", value: combinedTotalGoals + combinedTotalAssists, sub: `${combinedTotalGoals}G + ${combinedTotalAssists}A` },
                  ].map((s, i) => (
                    <div key={i} className="bg-[#03070c] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors text-center">
                      <div className="text-[10px] font-[900] tracking-[0.15em] text-gray-600 uppercase mb-2">{s.label}</div>
                      <div className={`text-[24px] font-[900] leading-none ${(s as any).danger ? "text-red-400" : (s as any).accent ? "text-amber-400" : "text-white"}`}>{s.value}</div>
                      {s.sub && <div className="text-[11px] font-[700] text-gray-500 mt-1.5">{s.sub}</div>}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* MAÇLAR TAB */}
          {activeTab === 'maclar' && (
            <div className="space-y-4">
              <h2 className="text-[14px] font-[900] text-gray-500 tracking-widest uppercase mb-3">TÜM MAÇ GEÇMİŞİ</h2>
              {allMatchesSorted.length > 0 ? (
                <div className="bg-[#03070c] border border-white/5 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[640px]">
                      <thead className="text-[10px] text-gray-500 uppercase font-[900] tracking-widest border-b border-white/5 bg-[#01060b]">
                        <tr>
                          <th className="py-3 pl-6 pr-3">TARİH</th>
                          <th className="px-3 py-3 text-center">HF</th>
                          <th className="px-3 py-3">RAKİP</th>
                          <th className="px-3 py-3 text-center">SKOR</th>
                          <th className="px-3 py-3 text-center text-[#00e5ff]">RTG</th>
                          <th className="px-3 py-3 text-center">G</th>
                          <th className="px-3 py-3 text-center">A</th>
                          <th className="pl-3 pr-6 py-3 text-center">MOM</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.03]">
                        {allMatchesSorted.map((m) => {
                          const opp = teamsMap.get(m.opponentId);
                          const rc = m.result === "W" ? "text-emerald-400" : m.result === "L" ? "text-red-400" : "text-amber-400";
                          return (
                            <tr key={m.matchId} className="hover:bg-white/[0.02] transition-colors text-[13px]">
                              <td className="py-3 pl-6 pr-3">
                                <Link href={`/mac/${m.matchId}`} className="font-[700] text-gray-400 hover:text-white transition-colors">
                                  {new Date(m.playedAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                </Link>
                              </td>
                              <td className="px-3 py-3 text-center font-[900] text-gray-600">{m.weekNumber || "-"}</td>
                              <td className="px-3 py-3">
                                <Link href={opp?.slug ? `/takim/${opp.slug}` : "#"} className="flex items-center gap-3 group">
                                  <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                                    {opp?.logo_url ? <img src={opp.logo_url} alt="" className="w-full h-full object-contain" /> : <span className="text-[8px] font-bold text-gray-500">{opp?.name?.substring(0, 2)}</span>}
                                  </div>
                                  <span className="font-[800] text-gray-300 group-hover:text-[#00e5ff] transition-colors truncate">{opp?.name || "?"}</span>
                                </Link>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`font-[900] tracking-wide ${rc}`}>{m.myScore} - {m.oppScore}</span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`font-[900] ${m.rating >= 8 ? "text-[#00e5ff]" : m.rating >= 7 ? "text-emerald-400" : m.rating >= 6 ? "text-amber-400" : "text-red-400"}`}>{m.rating.toFixed(1)}</span>
                              </td>
                              <td className="px-3 py-3 text-center font-[900] text-white">{m.goals || <span className="text-gray-700">-</span>}</td>
                              <td className="px-3 py-3 text-center font-[900] text-white">{m.assists || <span className="text-gray-700">-</span>}</td>
                              <td className="pl-3 pr-6 py-3 text-center">{m.isMom ? <span className="text-amber-400 text-[11px]">⭐</span> : <span className="text-gray-700">-</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-[#03070c] border border-white/5 rounded-2xl px-6 py-12 text-center text-[13px] font-[700] text-gray-600">Henüz resmi maç bulunmuyor.</div>
              )}
            </div>
          )}

          {/* SEZONLAR TAB */}
          {activeTab === 'sezonlar' && (
            <div className="space-y-4">
              <h2 className="text-[14px] font-[900] text-gray-500 tracking-widest uppercase mb-3">SEZON PERFORMANSLARI</h2>
              {allSeasonStats.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {allSeasonStats.map((s, idx) => {
                    const contribution = s.matches > 0 ? ((s.goals + s.assists) / s.matches).toFixed(2) : "0.00";
                    return (
                      <div key={idx} className={`bg-[#03070c] border ${s.isLegacy ? 'border-amber-500/20 hover:border-amber-500/40' : 'border-white/5 hover:border-white/10'} rounded-2xl p-6 transition-colors relative overflow-hidden`}>
                        {s.isLegacy && (
                          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
                        )}
                        <div className="flex items-start justify-between mb-5 relative z-10">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-[16px] font-[900] text-white tracking-wide leading-tight">{s.seasonName}</span>
                              {s.isLegacy && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-[900] tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">
                                  ARŞİV
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-[700] text-[#00e5ff]/70 tracking-wider uppercase mt-1">{s.leagueName}</span>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                            {s.teamLogo && <img src={s.teamLogo} alt="" className="w-4 h-4 object-contain" />}
                            {s.teamSlug ? (
                              <Link href={`/takim/${s.teamSlug}`} className="text-[11px] font-[800] text-gray-300 hover:text-white transition-colors">
                                {s.teamName}
                              </Link>
                            ) : (
                              <span className="text-[11px] font-[800] text-gray-300">{s.teamName}</span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-y-4 gap-x-2 pt-4 border-t border-white/5 relative z-10">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-[900] text-gray-500 tracking-wider">MAÇ</span>
                            <span className="text-[18px] font-[900] text-white">{s.matches}</span>
                            {s.isLegacy && s.wins !== undefined && (
                              <span className="text-[9px] font-bold text-gray-500 mt-0.5">({s.wins}G {s.draws}B {s.losses}M)</span>
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-[900] text-gray-500 tracking-wider">GOL</span>
                            <span className="text-[18px] font-[900] text-white">{s.goals}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-[900] text-gray-500 tracking-wider">ASİST</span>
                            <span className="text-[18px] font-[900] text-white">{s.assists}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-[900] text-[#00e5ff]/50 tracking-wider">RTG</span>
                            <span className="text-[18px] font-[900] text-[#00e5ff]">{s.avgRating.toFixed(2)}</span>
                          </div>
                        </div>

                        {s.isLegacy && (
                          <div className="mt-4 pt-3 border-t border-white/5 space-y-2 relative z-10">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-gray-500 font-bold uppercase">Katkı / Maç</span>
                              <span className="font-bold text-emerald-400">{contribution} / maç</span>
                            </div>
                            {(s.cleanSheets !== undefined || s.redCards !== undefined) && (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-gray-500 font-bold uppercase">CS / Kırmızı Kart</span>
                                <span className="font-medium text-gray-300">{s.cleanSheets || 0} CS • {s.redCards || 0} K.Kart</span>
                              </div>
                            )}
                            {Boolean(s.marketValue && s.marketValue > 0) && (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-gray-500 font-bold uppercase">Arşiv Değeri</span>
                                <span className="font-mono font-bold text-[#00e5ff]">{formatEuro(s.marketValue!)}</span>
                              </div>
                            )}
                            {Boolean(s.notes) && (
                              <p className="text-[11px] text-gray-400 italic pt-1 border-t border-white/5">
                                &quot;{s.notes}&quot;
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-[#03070c] border border-white/5 rounded-2xl px-6 py-12 text-center text-[13px] font-[700] text-gray-600">Henüz sezon istatistiği bulunmuyor.</div>
              )}
            </div>
          )}

          {/* KARİYER TAB */}
          {activeTab === 'kariyer' && (
            <div className="space-y-4">
              <h2 className="text-[14px] font-[900] text-gray-500 tracking-widest uppercase mb-3">TAKIM GEÇMİŞİ</h2>
              {fullTimeline.length > 0 ? (
                <div className="bg-[#03070c] border border-white/5 rounded-2xl p-8 lg:p-10">
                  <div className="flex flex-col relative before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-0.5 before:bg-gradient-to-b before:from-[#00e5ff]/50 before:via-white/10 before:to-transparent">
                    {fullTimeline.map((e, idx) => (
                      <div key={idx} className="relative flex gap-6 pb-10 last:pb-0 group">
                        <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center shrink-0 z-10 ${e.isCurrent ? "border-[#00e5ff] bg-[#00e5ff]/10" : e.isLegacy ? "border-amber-500/50 bg-amber-500/10 ring-2 ring-amber-500/20" : "border-[#03070c] bg-gray-800 ring-2 ring-white/10"} transition-colors`}>
                          <div className={`w-2 h-2 rounded-full ${e.isCurrent ? "bg-[#00e5ff]" : e.isLegacy ? "bg-amber-400" : "bg-white/30"}`} />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1 pt-0.5">
                          <div className="flex items-center gap-3 mb-1">
                            <span className={`text-[16px] font-[900] ${e.isLegacy ? "text-amber-400" : "text-[#00e5ff]/80"}`}>{e.joinedFmt}</span>
                            {e.isCurrent && <span className="text-[9px] font-[900] tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded uppercase">AKTİF KULÜP</span>}
                            {e.isLegacy && <span className="text-[9px] font-[900] tracking-widest text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 uppercase">ESKİ DÖNEM</span>}
                          </div>
                          <div className="flex items-center justify-between gap-4 bg-white/[0.02] border border-white/5 rounded-xl p-4 mt-2 max-w-lg hover:bg-white/[0.04] transition-colors">
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="w-12 h-12 rounded-lg bg-black/40 border border-white/10 p-1 flex items-center justify-center shrink-0">
                                {e.teamLogo ? <img src={e.teamLogo} alt="" className="w-full h-full object-contain" /> : <span className="text-xs font-bold text-gray-500">{e.teamName.substring(0, 2)}</span>}
                              </div>
                              <div className="flex flex-col min-w-0">
                                {e.teamSlug ? (
                                  <Link href={`/takim/${e.teamSlug}`} className="text-[18px] font-[900] text-white hover:text-[#00e5ff] transition-colors leading-tight truncate">
                                    {e.teamName}
                                  </Link>
                                ) : (
                                  <span className="text-[18px] font-[900] text-white leading-tight truncate">
                                    {e.teamName}
                                  </span>
                                )}
                                {e.leagueName && <span className="text-[12px] font-[700] text-gray-500 mt-1 uppercase truncate">{e.leagueName}</span>}
                              </div>
                            </div>
                            {e.isLegacy && e.matches !== undefined && (
                              <div className="text-right shrink-0">
                                <div className="text-[10px] font-bold text-gray-500 uppercase">{e.matches} MAÇ</div>
                                <div className="text-xs font-black text-emerald-400">{e.goals}G <span className="text-gray-600 font-normal">/</span> {e.assists}A</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-[#03070c] border border-white/5 rounded-2xl px-6 py-12 text-center text-[13px] font-[700] text-gray-600">Henüz takım geçmişi bulunmuyor.</div>
              )}
            </div>
          )}

          {/* BASARILAR TAB */}
          {activeTab === 'basarilar' && (
            <div className="space-y-4">
              <h2 className="text-[14px] font-[900] text-gray-500 tracking-widest uppercase mb-3">KİŞİSEL BAŞARIMLAR</h2>
              <div className="bg-[#03070c] border border-white/5 rounded-2xl p-6 lg:p-10 mb-8">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* TOTW */}
                  <div className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${achievementCounts.TOTW > 0 ? 'bg-gradient-to-br from-[#00e5ff]/10 to-transparent border-[#00e5ff]/30 shadow-[0_0_20px_rgba(0,229,255,0.1)]' : 'bg-white/[0.02] border-white/5 opacity-60'}`}>
                    <div className="w-12 h-12 mb-3 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                      {achievementCounts.TOTW > 0 ? '🌟' : '🔒'}
                    </div>
                    <div className={`text-[12px] font-[900] tracking-widest uppercase mb-1 ${achievementCounts.TOTW > 0 ? 'text-white' : 'text-gray-500'}`}>HAFTANIN TAKIMI</div>
                    <div className={`text-[20px] font-black ${achievementCounts.TOTW > 0 ? 'text-[#00e5ff]' : 'text-gray-700'}`}>
                      {achievementCounts.TOTW > 0 ? `${achievementCounts.TOTW}x` : 'KİLİTLİ'}
                    </div>
                  </div>
                  {/* MATCH_POTM */}
                  <div className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${achievementCounts.MATCH_POTM > 0 ? 'bg-gradient-to-br from-[#00e5ff]/10 to-transparent border-[#00e5ff]/30 shadow-[0_0_20px_rgba(0,229,255,0.1)]' : 'bg-white/[0.02] border-white/5 opacity-60'}`}>
                    <div className="w-12 h-12 mb-3 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                      {achievementCounts.MATCH_POTM > 0 ? '🔥' : '🔒'}
                    </div>
                    <div className={`text-[12px] font-[900] tracking-widest uppercase mb-1 ${achievementCounts.MATCH_POTM > 0 ? 'text-white' : 'text-gray-500'}`}>MAÇIN OYUNCUSU</div>
                    <div className={`text-[20px] font-black ${achievementCounts.MATCH_POTM > 0 ? 'text-[#00e5ff]' : 'text-gray-700'}`}>
                      {achievementCounts.MATCH_POTM > 0 ? `${achievementCounts.MATCH_POTM}x` : 'KİLİTLİ'}
                    </div>
                  </div>
                  {/* MONTH_POTM */}
                  <div className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${achievementCounts.MONTH_POTM > 0 ? 'bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'bg-white/[0.02] border-white/5 opacity-60'}`}>
                    <div className="w-12 h-12 mb-3 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                      {achievementCounts.MONTH_POTM > 0 ? '⚡' : '🔒'}
                    </div>
                    <div className={`text-[12px] font-[900] tracking-widest uppercase mb-1 ${achievementCounts.MONTH_POTM > 0 ? 'text-white' : 'text-gray-500'}`}>AYIN OYUNCUSU</div>
                    <div className={`text-[20px] font-black ${achievementCounts.MONTH_POTM > 0 ? 'text-purple-400' : 'text-gray-700'}`}>
                      {achievementCounts.MONTH_POTM > 0 ? `${achievementCounts.MONTH_POTM}x` : 'KİLİTLİ'}
                    </div>
                  </div>
                  {/* POTS */}
                  <div className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${achievementCounts.POTS > 0 ? 'bg-gradient-to-br from-yellow-500/10 to-transparent border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.1)]' : 'bg-white/[0.02] border-white/5 opacity-60'}`}>
                    <div className="w-12 h-12 mb-3 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                      {achievementCounts.POTS > 0 ? '👑' : '🔒'}
                    </div>
                    <div className={`text-[12px] font-[900] tracking-widest uppercase mb-1 ${achievementCounts.POTS > 0 ? 'text-white' : 'text-gray-500'}`}>SEZONUN OYUNCUSU</div>
                    <div className={`text-[20px] font-black ${achievementCounts.POTS > 0 ? 'text-yellow-400' : 'text-gray-700'}`}>
                      {achievementCounts.POTS > 0 ? `${achievementCounts.POTS}x` : 'KİLİTLİ'}
                    </div>
                  </div>
                  {/* KARMA WINNER */}
                  <div className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${achievementCounts.KARMA_WINNER > 0 ? 'bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-white/[0.02] border-white/5 opacity-60'}`}>
                    <div className="w-12 h-12 mb-3 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                      {achievementCounts.KARMA_WINNER > 0 ? '⚔️' : '🔒'}
                    </div>
                    <div className={`text-[12px] font-[900] tracking-widest uppercase mb-1 ${achievementCounts.KARMA_WINNER > 0 ? 'text-white' : 'text-gray-500'}`}>KARMA WINNER</div>
                    <div className={`text-[20px] font-black ${achievementCounts.KARMA_WINNER > 0 ? 'text-emerald-400' : 'text-gray-700'}`}>
                      {achievementCounts.KARMA_WINNER > 0 ? `${achievementCounts.KARMA_WINNER}x` : 'KİLİTLİ'}
                    </div>
                  </div>
                  {/* 1V1 WINNER */}
                  <div className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${achievementCounts['1V1_WINNER'] > 0 ? 'bg-gradient-to-br from-cyan-500/10 to-transparent border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]' : 'bg-white/[0.02] border-white/5 opacity-60'}`}>
                    <div className="w-12 h-12 mb-3 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                      {achievementCounts['1V1_WINNER'] > 0 ? '🎯' : '🔒'}
                    </div>
                    <div className={`text-[12px] font-[900] tracking-widest uppercase mb-1 ${achievementCounts['1V1_WINNER'] > 0 ? 'text-white' : 'text-gray-500'}`}>1V1 WINNER</div>
                    <div className={`text-[20px] font-black ${achievementCounts['1V1_WINNER'] > 0 ? 'text-cyan-400' : 'text-gray-700'}`}>
                      {achievementCounts['1V1_WINNER'] > 0 ? `${achievementCounts['1V1_WINNER']}x` : 'KİLİTLİ'}
                    </div>
                  </div>
                  {/* NIGHT CUP WINNER */}
                  <div className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${achievementCounts.NIGHT_CUP_WINNER > 0 ? 'bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.1)]' : 'bg-white/[0.02] border-white/5 opacity-60'}`}>
                    <div className="w-12 h-12 mb-3 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-xl">
                      {achievementCounts.NIGHT_CUP_WINNER > 0 ? '🌙' : '🔒'}
                    </div>
                    <div className={`text-[12px] font-[900] tracking-widest uppercase mb-1 ${achievementCounts.NIGHT_CUP_WINNER > 0 ? 'text-white' : 'text-gray-500'}`}>NIGHT CUP WINNER</div>
                    <div className={`text-[20px] font-black ${achievementCounts.NIGHT_CUP_WINNER > 0 ? 'text-indigo-400' : 'text-gray-700'}`}>
                      {achievementCounts.NIGHT_CUP_WINNER > 0 ? `${achievementCounts.NIGHT_CUP_WINNER}x` : 'KİLİTLİ'}
                    </div>
                  </div>
                </div>
              </div>

              <h2 className="text-[14px] font-[900] text-gray-500 tracking-widest uppercase mb-3">TAKIM KUPALARI</h2>
              <div className="bg-[#03070c] border border-white/5 rounded-2xl p-8 lg:p-12">
                {allTrophies.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {allTrophies.map((t: any, i: number) => (
                      <div key={i} className="bg-gradient-to-b from-yellow-500/10 to-transparent border border-yellow-500/20 rounded-2xl p-6 text-center transition-all hover:scale-105 hover:border-yellow-500/40 hover:shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-black/50 overflow-hidden flex items-center justify-center border border-white/5">
                          {t.tournaments?.image_url ? (
                            <img src={t.tournaments.image_url} alt="Trophy" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-3xl">🏆</span>
                          )}
                        </div>
                        <div className="text-[11px] font-[900] tracking-widest text-yellow-500 uppercase leading-snug mb-1">
                          {t.tournaments?.type === 'KARMA' ? 'KARMA ŞAMPİYONU' : 
                           t.tournaments?.type === '1V1' ? '1V1 ŞAMPİYONU' : 'NIGHT CUP ŞAMPİYONU'}
                        </div>
                        <div className="text-[13px] font-[900] text-white uppercase">{t.tournaments?.name}</div>
                        {t.tournament_applications?.team_name && (
                          <div className="text-[10px] font-bold text-gray-400 mt-2">{t.tournament_applications.team_name}</div>
                        )}
                        {t.tournaments?.seasons?.name && (
                          <div className="text-[10px] font-bold text-gray-500 mt-1">{t.tournaments.seasons.name}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center mt-10">
                    <span className="text-[13px] text-gray-600 font-[700]">Henüz kazanılmış turnuva bulunmuyor.</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
