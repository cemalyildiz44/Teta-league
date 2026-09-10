import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Calendar, ChevronRight } from 'lucide-react';
import TeamRosterCarousel from '../TeamRosterCarousel';
import TeamLogo from '@/components/TeamLogo';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: team } = await supabase
    .from('teams')
    .select('name')
    .eq('slug', slug)
    .single();

  if (!team) return { title: 'Takım Bulunamadı' };

  return {
    title: `${team.name} | TETA League`,
    description: `${team.name} takımının aktif kadrosu, güncel lig durumu ve kaptanlık detayları. TETA League e-spor platformu.`,
  };
}

export default async function TeamPage({ params }: Props) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Fetch Team
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!team) {
    notFound();
  }

  // 2. Fetch Active League & Season
  const { data: leagueTeamData } = await supabase
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
    .single();

  const activeLeague: any = Array.isArray(leagueTeamData?.leagues) ? leagueTeamData.leagues[0] : leagueTeamData?.leagues;
  const activeSeason: any = Array.isArray(activeLeague?.seasons) ? activeLeague.seasons[0] : activeLeague?.seasons;

  // 2b. Fetch Transfer Slots (Option B)
  const { data: slotRows } = await supabase.rpc('get_team_transfer_slots', {
    p_team_id: team.id,
    p_season_id: activeSeason?.id || null
  });
  const slotData = Array.isArray(slotRows) && slotRows.length > 0 ? slotRows[0] : null;
  const transferSlots = {
    remaining: slotData?.remaining_slots ?? 5,
    total: slotData?.total_slots ?? 5
  };

  // 3. Fetch Captain Role
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, role, profiles ( id, username, avatar_url, current_ea_player_id )')
    .eq('team_id', team.id)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .limit(1)
    .single();

  const captain: any = Array.isArray(roles?.profiles) ? roles.profiles[0] : roles?.profiles;

  // 4. Fetch Active Roster
  let roster: any[] = [];
  if (activeSeason) {
    const { data: memberships } = await supabase
      .from('team_memberships')
      .select(`
        joined_at,
        profiles ( id, username, full_name, avatar_url, primary_position, alternative_positions, current_ea_player_id )
      `)
      .eq('team_id', team.id)
      .eq('season_id', activeSeason.id)
      .is('left_at', null)
      .order('joined_at', { ascending: true });
      
    if (memberships) {
      roster = memberships.map((m: any) => ({
        joined_at: m.joined_at,
        ...m.profiles,
        role: captain?.id === m.profiles.id ? 'CAPTAIN' : 'PLAYER',
        stats: { matches: 0, goals: 0, assists: 0, avgRating: "0.00" }
      }));
    }
  }

  // 5. Fetch Matches & Stats
  let recentMatches: any[] = [];
  let upcomingMatches: any[] = [];
  let stats: any = null;

  if (activeSeason) {
    // Team Stats
    const { data: s } = await supabase
      .from('team_season_stats')
      .select('*')
      .eq('team_id', team.id)
      .eq('season_id', activeSeason.id)
      .single();
    stats = s;

    // Fetch fixtures for this team in active season
    const { data: teamFixtures } = await supabase
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
      .eq('season_id', activeSeason.id)
      .order('week_number', { ascending: true });

    // Fetch team details for opponent mapping
    const { data: allTeamsData } = await supabase
      .from('teams')
      .select('id, name, slug, logo_url');
    const teamMap = new Map((allTeamsData || []).map(t => [t.id, t]));

    // Also fetch all approved matches for this team in active season (to ensure roster stats get all matches)
    const { data: seasonApprovedMatches } = await supabase
      .from('matches')
      .select('id')
      .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
      .eq('season_id', activeSeason.id)
      .eq('status', 'APPROVED');

    const approvedMatchIds = (seasonApprovedMatches || []).map(m => m.id);

    if (teamFixtures && teamFixtures.length > 0) {
      const completed: any[] = [];
      const upcoming: any[] = [];

      teamFixtures.forEach(f => {
        const isHome = f.home_team_id === team.id;
        const opponentId = isHome ? f.away_team_id : f.home_team_id;
        const opponent = teamMap.get(opponentId);
        const matchesList = Array.isArray(f.matches) ? f.matches : f.matches ? [f.matches] : [];
        const appMatch = matchesList.find((m: any) => m.status === 'APPROVED');
        const pendingMatch = matchesList.find((m: any) => m.status === 'PENDING_REVIEW');

        if (appMatch) {
          completed.push({
            id: appMatch.id,
            fixture_id: f.id,
            date: appMatch.played_at || f.scheduled_at,
            isHome,
            opponent,
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
            opponent,
            status: pendingMatch ? 'PENDING_REVIEW' : f.status || 'SCHEDULED',
            week_number: f.week_number,
          });
        }
      });

      // Recent matches: sorted by date desc or week desc
      completed.sort((a, b) => {
        if (a.date && b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();
        return b.week_number - a.week_number;
      });
      recentMatches = completed.slice(0, 5);

      // Upcoming matches: sorted by date asc or week asc
      upcoming.sort((a, b) => {
        if (a.date && b.date) return new Date(a.date).getTime() - new Date(b.date).getTime();
        return a.week_number - b.week_number;
      });
      upcomingMatches = upcoming.slice(0, 5);
    }

    if (approvedMatchIds.length > 0 && roster.length > 0) {
      // Find player stats for the roster
      const eaPlayerIds = roster.map(r => r.current_ea_player_id).filter(Boolean);
      if (eaPlayerIds.length > 0) {
        const { data: pStats } = await supabase
          .from('match_player_stats')
          .select('ea_player_id, goals, assists, rating')
          .in('match_id', approvedMatchIds)
          .in('ea_player_id', eaPlayerIds);

        if (pStats && pStats.length > 0) {
          roster = roster.map(r => {
            const myStats = pStats.filter(s => s.ea_player_id === r.current_ea_player_id);
            if (myStats.length > 0) {
              let matches = myStats.length;
              let goals = myStats.reduce((sum, s) => sum + (s.goals || 0), 0);
              let assists = myStats.reduce((sum, s) => sum + (s.assists || 0), 0);
              let totalRating = myStats.reduce((sum, s) => sum + (parseFloat(s.rating) || 0), 0);
              return {
                ...r,
                stats: {
                  matches,
                  goals,
                  assists,
                  avgRating: (totalRating / matches).toFixed(2)
                }
              };
            }
            return r;
          });
        }
      }
    }
  }

  // 5b. All-Time APPROVED matches for the team across all seasons & leagues
  const { data: allTimeMatches } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, home_score, away_score')
    .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
    .eq('status', 'APPROVED');

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

  // 6. Market Value Bulk Fetch
  let totalTeamValue = 0;
  if (roster.length > 0) {
    const eaPlayerIds = roster.map(r => r.current_ea_player_id).filter(Boolean);
    const profileIds = roster.map(r => r.id);
    
    const [{ data: bulkStats }, { data: bulkAchievements }] = await Promise.all([
      supabase.from("match_player_stats").select("ea_player_id, team_id, goals, assists, rating, cleansheets_gk, cleansheets_def, red_cards, matches!inner(home_team_id, away_team_id, home_score, away_score, status, season_id)").in("ea_player_id", eaPlayerIds).eq("matches.status", "APPROVED"),
      supabase.from("player_achievements").select("player_id, achievement_type, season_id").in("player_id", profileIds)
    ]);

    const achByProfile = new Map();
    if (bulkAchievements) {
      bulkAchievements.forEach(a => {
        if (!achByProfile.has(a.player_id)) achByProfile.set(a.player_id, []);
        achByProfile.get(a.player_id).push(a);
      });
    }

    const statsByEaId = new Map();
    if (bulkStats) {
      bulkStats.forEach(s => {
        if (!statsByEaId.has(s.ea_player_id)) statsByEaId.set(s.ea_player_id, []);
        statsByEaId.get(s.ea_player_id).push(s);
      });
    }

    // Dynamic import to use the calculator without importing at the top if it causes issues, but we can just import it.
    // Wait, let's just do it directly or use require if it's simpler. I'll import it at the top later.
    const { calculateMarketValue } = await import("@/app/utils/marketValueCalculator");

    roster.forEach(r => {
      let tM=0, tW=0, tD=0, tL=0, tG=0, tA=0, tCGK=0, tCDEF=0, tRC=0;
      const sMap = new Map();
      const pStatsList = r.current_ea_player_id ? statsByEaId.get(r.current_ea_player_id) || [] : [];
      
      pStatsList.forEach((s: any) => {
        tM++; tG += s.goals || 0; tA += s.assists || 0; tRC += s.red_cards || 0;
        tCGK += s.cleansheets_gk || 0; tCDEF += s.cleansheets_def || 0;
        
        const m = s.matches;
        const isHome = s.team_id === m.home_team_id;
        const my = isHome ? m.home_score : m.away_score;
        const opp = isHome ? m.away_score : m.home_score;
        if (my > opp) tW++; else if (my < opp) tL++; else tD++;

        const sid = m.season_id;
        if (!sMap.has(sid)) sMap.set(sid, { season_id: sid, rating_sum: 0, rating_count: 0 });
        const p = sMap.get(sid);
        p.rating_sum += parseFloat(s.rating) || 0;
        p.rating_count++;
      });

      const mvInput = {
        profile: { primary_position: r.primary_position },
        careerStats: { matches_played: tM, wins: tW, draws: tD, losses: tL, goals: tG, assists: tA, cleansheets_gk: tCGK, cleansheets_def: tCDEF, red_cards: tRC },
        seasonStats: Array.from(sMap.values()),
        achievements: achByProfile.get(r.id) || []
      };
      
      const res = calculateMarketValue(mvInput);
      r.marketValue = res.totalValue;
      totalTeamValue += res.totalValue;
    });
  }

  const shortTag = `#${(team.ea_club_name || team.slug.substring(0,3)).toUpperCase()}`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16">
      
      {/* HERO SECTION */}
      <div className="client-glass rounded-2xl p-6 lg:p-10 relative overflow-hidden mb-8 border border-[#00e5ff]/20 bg-[#01060b]">
        {/* Subtle Background Elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#00e5ff] rounded-full blur-[150px] opacity-[0.07] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#00e5ff] rounded-full blur-[120px] opacity-[0.03] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-8">
          {/* Logo */}
          <TeamLogo src={team.logo_url} name={team.name} size="hero" />

          {/* Info */}
          <div className="flex-1 text-center md:text-left flex flex-col justify-center pt-2">
            
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-3">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-[900] text-white tracking-tight uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                {team.name}
              </h1>
              <span className="data-label !bg-transparent !text-gray-400 border border-white/10 self-center md:self-auto text-[13px]">
                {shortTag}
              </span>
              {!team.is_active && (
                <span className="data-label !bg-red-500/10 !text-red-400 border border-red-500/30 self-center md:self-auto">
                  PASİF
                </span>
              )}
            </div>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-6">
              <p className="text-[#00e5ff] text-[14px] font-[700] tracking-[0.2em] uppercase">
                EA CLUB ID: <span className="text-white">{team.ea_club_id || "BİLİNMİYOR"}</span>
              </p>

              {(team.stream_url || team.instagram_url) && (
                <div className="flex items-center gap-2">
                  {team.stream_url && (
                    <a
                      href={team.stream_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 border border-[#00e5ff]/30 text-[#00e5ff] text-[12px] font-[800] uppercase tracking-wider transition-all shadow-[0_0_12px_rgba(0,229,255,0.15)] group"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 3l14 9-14 9V3z" />
                      </svg>
                      YAYIN
                    </a>
                  )}
                  {team.instagram_url && (
                    <a
                      href={team.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-pink-400 text-[12px] font-[800] uppercase tracking-wider transition-all"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                      Instagram
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
              {activeLeague && activeSeason ? (
                <>
                  <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl flex flex-col">
                    <span className="text-[10px] text-gray-500 font-[900] uppercase tracking-[0.2em] mb-1">Aktif Lig</span>
                    <span className="text-[14px] text-white font-[800] tracking-widest uppercase">{activeLeague.name}</span>
                  </div>
                  <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl flex flex-col">
                    <span className="text-[10px] text-gray-500 font-[900] uppercase tracking-[0.2em] mb-1">Sezon</span>
                    <span className="text-[14px] text-white font-[800] tracking-widest uppercase">{activeSeason.name}</span>
                  </div>
                </>
              ) : (
                <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl">
                  <span className="text-[13px] text-gray-500 font-bold uppercase tracking-widest">Kayıtlı Aktif Lig Yok</span>
                </div>
              )}

              {/* Transfer Slotu */}
              <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl flex flex-col">
                <span className="text-[10px] text-gray-400 font-[900] uppercase tracking-[0.2em] mb-1">TRANSFER SLOTU</span>
                <span className="text-[14px] text-white font-[800] tracking-widest uppercase font-mono">
                  {transferSlots.remaining} / {transferSlots.total}
                </span>
              </div>

              {/* Team Market Value Badge */}
              {totalTeamValue > 0 && (
                <div className="px-6 py-3 bg-gradient-to-br from-[#00e5ff]/10 to-transparent backdrop-blur-md border border-[#00e5ff]/30 rounded-xl flex flex-col shadow-[0_0_15px_rgba(0,229,255,0.1)] relative overflow-hidden group">
                  <div className="absolute inset-0 bg-[#00e5ff] opacity-0 group-hover:opacity-[0.05] transition-opacity" />
                  <span className="text-[10px] text-[#00e5ff] font-[900] uppercase tracking-[0.2em] mb-1 z-10">KADRO DEĞERİ</span>
                  <span className="text-[16px] text-white font-[900] tracking-wider uppercase z-10">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(totalTeamValue)}</span>
                </div>
              )}

              {/* TÜM ZAMANLAR STATS BADGE */}
              <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl flex flex-col">
                <span className="text-[10px] text-gray-400 font-[900] uppercase tracking-[0.2em] mb-1">TÜM ZAMANLAR</span>
                <div className="flex items-center gap-2 text-[14px] font-[900]">
                  <span className="text-emerald-400">{allTimeWins} <span className="text-[10px] text-gray-400 font-bold">G</span></span>
                  <span className="text-white/20">•</span>
                  <span className="text-gray-300">{allTimeDraws} <span className="text-[10px] text-gray-400 font-bold">B</span></span>
                  <span className="text-white/20">•</span>
                  <span className="text-red-400">{allTimeLosses} <span className="text-[10px] text-gray-400 font-bold">M</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TEAM STATS ROW */}
      {stats && (
        <div className="mb-12">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[11px] font-[900] text-gray-500 uppercase tracking-[0.2em]">
              SEZON İSTATİSTİKLERİ ({activeSeason?.name || 'GÜNCEL'})
            </h3>
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
              TÜM ZAMANLAR: {allTimeWins}G / {allTimeDraws}B / {allTimeLosses}M
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "OYNANAN", value: stats.matches_played },
            { label: "GALİBİYET", value: stats.wins, color: "text-emerald-400" },
            { label: "BERABERLİK", value: stats.draws, color: "text-gray-300" },
            { label: "MAĞLUBİYET", value: stats.losses, color: "text-red-400" },
            { label: "PUAN", value: stats.points, highlight: true },
            { label: "ATILAN", value: stats.goals_for },
            { label: "YENİLEN", value: stats.goals_against },
            { label: "AVERAJ", value: stats.goal_difference }
          ].map((stat, i) => (
            <div key={i} className={`client-glass rounded-xl border p-4 text-center flex flex-col justify-center ${stat.highlight ? 'border-[#00e5ff]/30 bg-[#00e5ff]/5' : 'border-white/5 bg-[#03070c]'}`}>
              <span className={`text-[9px] font-[900] tracking-[0.2em] uppercase mb-2 ${stat.highlight ? 'text-[#00e5ff]' : 'text-gray-500'}`}>{stat.label}</span>
              <span className={`text-xl lg:text-2xl font-[900] ${stat.highlight ? 'text-[#00e5ff] drop-shadow-[0_0_10px_rgba(0,229,255,0.4)]' : (stat.color || 'text-white')}`}>{stat.value}</span>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* MAIN ROSTER SECTION */}
      <div className="mb-16">
        <div className="flex items-center gap-4 mb-8">
          <h2 className="text-2xl md:text-3xl font-[900] text-white tracking-widest uppercase flex items-center gap-3">
            <span className="w-2 h-8 bg-[#00e5ff] rounded-full inline-block" />
            KADRO
          </h2>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </div>
        
        <TeamRosterCarousel players={roster} />
      </div>

      {/* MATCHES SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Upcoming Matches */}
          <div className="client-glass rounded-xl border border-white/5 p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[12px] font-[900] text-gray-400 tracking-[0.2em] uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Yaklaşan Maçlar
              </h3>
            </div>
            <div className="space-y-3">
              {upcomingMatches.length > 0 ? (
                upcomingMatches.map(match => {
                  const opponent = match.opponent;
                  const dateStr = match.date
                    ? new Intl.DateTimeFormat('tr-TR', {
                        timeZone: 'Europe/Istanbul',
                        day: 'numeric',
                        month: 'short',
                      }).format(new Date(match.date))
                    : `${match.week_number}. Hafta`;
                  const timeStr = match.date
                    ? new Intl.DateTimeFormat('tr-TR', {
                        timeZone: 'Europe/Istanbul',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(match.date))
                    : (match.status === 'PENDING_REVIEW' ? 'İNCELEMEDE' : 'VS');

                  return (
                    <div key={match.id || match.fixture_id} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="flex flex-col items-center justify-center min-w-[65px] pr-4 border-r border-white/10">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">
                          {dateStr}
                        </span>
                        <span className={`text-[11px] font-black uppercase ${match.status === 'PENDING_REVIEW' ? 'text-amber-400' : 'text-white'}`}>
                          {timeStr}
                        </span>
                      </div>
                      <div className="flex-1 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 truncate">
                          <TeamLogo src={opponent?.logo_url} name={opponent?.name} size="sm" />
                          <Link href={opponent?.slug ? `/takim/${opponent.slug}` : "#"} className="text-[14px] font-[800] text-gray-300 hover:text-[#00e5ff] truncate transition-colors">
                            {opponent?.name || 'Rakip Takım'}
                          </Link>
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase px-2 py-0.5 rounded bg-white/5 shrink-0">
                          {match.isHome ? 'EV' : 'DEP'}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-[13px] text-gray-500 italic p-4 bg-white/[0.02] rounded-xl border border-white/5">Yaklaşan maç bulunmuyor.</div>
              )}
            </div>
          </div>

          {/* Recent Matches */}
          <div className="client-glass rounded-xl border border-white/5 p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[12px] font-[900] text-gray-400 tracking-[0.2em] uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00e5ff]" />
                Son Maçlar
              </h3>
            </div>
            <div className="space-y-3">
              {recentMatches.length > 0 ? (
                recentMatches.map(match => {
                  const opponent = match.opponent;
                  const myScore = match.myScore;
                  const oppScore = match.oppScore;
                  let resultClass = "text-gray-400 bg-white/5"; // draw
                  if (myScore > oppScore) resultClass = "text-emerald-400 bg-emerald-500/10"; // win
                  else if (myScore < oppScore) resultClass = "text-red-400 bg-red-500/10"; // loss

                  const dateStr = match.date
                    ? new Intl.DateTimeFormat('tr-TR', {
                        timeZone: 'Europe/Istanbul',
                        day: 'numeric',
                        month: 'short',
                      }).format(new Date(match.date))
                    : `${match.week_number}. Hafta`;

                  return (
                    <Link href={`/mac/${match.id}`} key={match.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/20 transition-colors group">
                      <div className="flex flex-col items-center justify-center min-w-[65px] pr-4 border-r border-white/10">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">
                          {dateStr}
                        </span>
                        <span className="text-[9px] font-bold text-gray-500 uppercase">
                          {match.isHome ? 'EV' : 'DEP'}
                        </span>
                      </div>
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex items-center gap-3 truncate">
                          <TeamLogo src={opponent?.logo_url} name={opponent?.name} size="sm" />
                          <span className="text-[14px] font-[800] text-gray-300 truncate group-hover:text-white transition-colors">
                            {opponent?.name || 'Rakip Takım'}
                          </span>
                        </div>
                        <div className={`px-3 py-1 rounded ml-3 shrink-0 flex items-center justify-center font-[900] text-[14px] tracking-wider ${resultClass}`}>
                          {myScore} - {oppScore}
                        </div>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="text-[13px] text-gray-500 italic p-4 bg-white/[0.02] rounded-xl border border-white/5">Son maç bulunmuyor.</div>
              )}
            </div>
          </div>

        </div>
    </div>
  );
}
