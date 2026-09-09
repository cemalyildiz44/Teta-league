import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { getLeagueBySlugs } from "../../../utils";
import { cookies } from "next/headers";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";

export default async function LeagueStatsPage({ params }: { params: Promise<{ seasonSlug: string; leagueSlug: string }> }) {
  const resolvedParams = await params;
  const league = await getLeagueBySlugs(resolvedParams.seasonSlug, resolvedParams.leagueSlug);
  if (!league) notFound();
  
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. OYNANAN APPROVED MAÇLARI AL
  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, home_score, away_score")
    .eq("league_id", league.id)
    .eq("status", "APPROVED");

  const matchIds = (matches || []).map(m => m.id);

  // 2. MATCH PLAYER STATS AL (boş olsa da hata vermez, [] döner)
  let rawStats: any[] = [];
  if (matchIds.length > 0) {
    const { data: statsData } = await supabase
      .from("match_player_stats")
      .select("match_id, team_id, player_id, ea_player_id, goals, assists, saves, goals_conceded, cleansheets_gk, cleansheets_def, position, rating, profiles(id, username), teams(id, name, slug, logo_url)")
      .in("match_id", matchIds);
    rawStats = statsData || [];
  }
  const stats = rawStats;

  // ÜST ÖZET KARTLARI İÇİN HESAPLAMA
  const totalMatches = (matches || []).length;
  const totalGoals = (matches || []).reduce((acc, m) => acc + (m.home_score || 0) + (m.away_score || 0), 0);
  const totalAssists = stats.reduce((acc, s) => acc + (s.assists || 0), 0);
  const activePlayerIds = new Set(stats.map(s => s.player_id || s.ea_player_id).filter(Boolean));
  const activePlayerCount = activePlayerIds.size;

  // OYUNCU İSTATİSTİKLERİ HESAPLAMA
  const playerMap = new Map();
  
  for (const s of stats) {
    const pId = s.player_id || s.ea_player_id;
    if (!pId) continue;

    const prof = s.profiles as any;
    const tm = s.teams as any;

    if (!playerMap.has(pId)) {
      playerMap.set(pId, {
        id: pId,
        username: prof?.username || 'Bilinmiyor',
        hasProfile: !!prof?.id,
        teamId: tm?.id,
        teamName: tm?.name || 'Bilinmiyor',
        teamSlug: tm?.slug,
        teamLogo: tm?.logo_url,
        position: s.position,
        matches: 0,
        goals: 0,
        assists: 0,
        wins: 0,
        cleansheets: 0,
        goalsConceded: 0,
        ratingSum: 0
      });
    }

    const ps = playerMap.get(pId);
    ps.matches += 1;
    ps.goals += (s.goals || 0);
    ps.assists += (s.assists || 0);
    ps.cleansheets += (s.cleansheets_gk || 0);
    ps.goalsConceded += (s.goals_conceded || 0);
    ps.ratingSum += (parseFloat(s.rating) || 0);

    // Galibiyet hesaplama
    const match = (matches || []).find((m: any) => m.id === s.match_id);
    if (match) {
      if (s.team_id === match.home_team_id && match.home_score > match.away_score) {
        ps.wins += 1;
      } else if (s.team_id === match.away_team_id && match.away_score > match.home_score) {
        ps.wins += 1;
      }
    }
  }

  const allPlayers = Array.from(playerMap.values()).filter(p => p.hasProfile).map(p => ({
    ...p,
    avgRating: p.matches > 0 ? (p.ratingSum / p.matches).toFixed(1) : "0.0"
  }));

  const topScorers = [...allPlayers].filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals || a.matches - b.matches).slice(0, 5);
  const topAssisters = [...allPlayers].filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists || a.matches - b.matches).slice(0, 5);
  const mostMatchesPlayers = [...allPlayers].sort((a, b) => b.matches - a.matches || b.goals - a.goals).slice(0, 5);
  const mostWinsPlayers = [...allPlayers].filter(p => p.wins > 0).sort((a, b) => b.wins - a.wins || a.matches - b.matches).slice(0, 5);
  
  const goalkeepers = [...allPlayers]
    .filter(p => p.position === 'Kaleci' || p.position === 'GK')
    .sort((a, b) => b.cleansheets - a.cleansheets || b.matches - a.matches)
    .slice(0, 5);

  const bestDefenders = [...allPlayers]
    .filter(p => ['CB', 'LB', 'RB', 'LWB', 'RWB', 'STP', 'SĞB', 'SLB'].includes(p.position))
    .sort((a, b) => parseFloat(b.avgRating) - parseFloat(a.avgRating) || b.matches - a.matches)
    .slice(0, 5);

  // TAKIM İSTATİSTİKLERİ HESAPLAMA
  const { data: teamStatsData } = await supabase
    .from("team_season_stats")
    .select("team_id, wins, goals_for, points, goals_against, matches_played, teams(id, name, slug, logo_url)")
    .eq("league_id", league.id);
    
  const teamStats = (teamStatsData || []).map(ts => {
    const tm = ts.teams as any;
    return {
      id: tm?.id,
      name: tm?.name,
      slug: tm?.slug,
      logo: tm?.logo_url,
      wins: ts.wins,
      goalsFor: ts.goals_for,
      points: ts.points,
      goalsAgainst: ts.goals_against,
      matches: ts.matches_played
    };
  });

  const mostWinsTeams = [...teamStats].filter(t => t.wins > 0).sort((a, b) => b.wins - a.wins).slice(0, 5);
  const mostGoalsTeams = [...teamStats].filter(t => t.goalsFor > 0).sort((a, b) => b.goalsFor - a.goalsFor).slice(0, 5);
  const leastConcededTeams = [...teamStats].filter(t => t.matches > 0).sort((a, b) => a.goalsAgainst - b.goalsAgainst).slice(0, 5);

  // Helper Components
  const StatCard = ({ title, value, delay }: { title: string, value: string | number, delay: string }) => (
    <div className={`client-glass border border-white/5 p-6 rounded-xl relative overflow-hidden group hover:border-[#00e5ff]/30 transition-all ${delay}`}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#00e5ff]/5 to-transparent rounded-full -mr-10 -mt-10 group-hover:from-[#00e5ff]/10 transition-colors"></div>
      <div className="text-[11px] font-[900] tracking-[0.2em] text-gray-500 mb-2 uppercase">{title}</div>
      <div className="text-4xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] group-hover:text-[#00e5ff] transition-colors">{value}</div>
    </div>
  );

  const PlayerRow = ({ player, idx, val, label }: { player: any, idx: number, val: number | string, label: string }) => (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors px-2 rounded-lg -mx-2 group">
      <div className="flex items-center gap-4">
        <span className={`text-[16px] font-[900] w-5 text-center ${idx === 0 ? 'text-[#00e5ff] drop-shadow-[0_0_5px_rgba(0,229,255,0.5)]' : 'text-gray-600'}`}>{idx + 1}</span>
        <div className="flex items-center gap-3">
          <Link href={`/takim/${player.teamSlug}`} className="shrink-0 group-hover:drop-shadow-[0_0_8px_rgba(0,229,255,0.4)] transition-all">
            <TeamLogo src={player.teamLogo} name={player.teamName} size="sm" />
          </Link>
          <div className="flex flex-col">
            <Link href={`/oyuncular/${player.username}`} className="text-[15px] font-[800] text-white hover:text-[#00e5ff] transition-colors tracking-wide">
              {player.username}
            </Link>
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{player.teamName}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[18px] font-black text-[#00e5ff]">{val}</span>
        <span className="text-[9px] font-black tracking-widest text-gray-600 uppercase">{label}</span>
      </div>
    </div>
  );

  const TeamRow = ({ team, idx, val, label }: { team: any, idx: number, val: number, label: string }) => (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors px-2 rounded-lg -mx-2 group">
      <div className="flex items-center gap-4">
        <span className={`text-[16px] font-[900] w-5 text-center ${idx === 0 ? 'text-[#00e5ff] drop-shadow-[0_0_5px_rgba(0,229,255,0.5)]' : 'text-gray-600'}`}>{idx + 1}</span>
        <div className="flex items-center gap-3">
          <Link href={`/takim/${team.slug}`} className="shrink-0 flex items-center justify-center">
            <TeamLogo src={team.logo} name={team.name} size="sm" />
          </Link>
          <div className="flex flex-col">
            <Link href={`/takim/${team.slug}`} className="text-[15px] font-[800] text-white hover:text-[#00e5ff] transition-colors tracking-wide">
              {team.name}
            </Link>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[18px] font-black text-[#00e5ff]">{val}</span>
        <span className="text-[9px] font-black tracking-widest text-gray-600 uppercase">{label}</span>
      </div>
    </div>
  );

  const EmptyRow = ({ label }: { label: string }) => (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0 px-2 rounded-lg -mx-2 opacity-50">
      <div className="flex items-center gap-4">
        <span className="text-[16px] font-[900] w-5 text-center text-gray-700">—</span>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#0a1628] border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
            <span className="text-[10px] font-black text-gray-700">—</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-[800] text-gray-500 tracking-wide">Henüz veri yok</span>
            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">—</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[18px] font-black text-gray-700">—</span>
        <span className="text-[9px] font-black tracking-widest text-gray-700 uppercase">{label}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-12 pb-12">
      
      {/* 1. ÜST ÖZET İSTATİSTİK KARTLARI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <StatCard title="OYNANAN MAÇ" value={totalMatches} delay="animate-fade-in-up" />
        <StatCard title="TOPLAM GOL" value={totalGoals} delay="animate-fade-in-up [animation-delay:100ms]" />
        <StatCard title="TOPLAM ASİST" value={totalAssists} delay="animate-fade-in-up [animation-delay:200ms]" />
        <StatCard title="AKTİF OYUNCU" value={activePlayerCount} delay="animate-fade-in-up [animation-delay:300ms]" />
      </div>

      {/* 2. OYUNCU İSTATİSTİKLERİ */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-[24px] font-[900] text-white tracking-widest uppercase">OYUNCU <span className="text-[#00e5ff]">İSTATİSTİKLERİ</span></h2>
          <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {/* GOL KRALLIĞI */}
          <div className="client-glass border border-white/5 p-6 rounded-xl">
            <h3 className="text-[13px] font-[900] text-gray-400 tracking-widest mb-6 uppercase">GOL KRALLIĞI</h3>
            <div className="flex flex-col">
              {topScorers.length > 0 ? topScorers.map((p, idx) => (
                <PlayerRow key={p.id} player={p} idx={idx} val={p.goals} label="GOL" />
              )) : <EmptyRow label="GOL" />}
            </div>
          </div>
          
          {/* ASİST KRALLIĞI */}
          <div className="client-glass border border-white/5 p-6 rounded-xl">
            <h3 className="text-[13px] font-[900] text-gray-400 tracking-widest mb-6 uppercase">ASİST KRALLIĞI</h3>
            <div className="flex flex-col">
              {topAssisters.length > 0 ? topAssisters.map((p, idx) => (
                <PlayerRow key={p.id} player={p} idx={idx} val={p.assists} label="ASİST" />
              )) : <EmptyRow label="ASİST" />}
            </div>
          </div>
          
          {/* EN ÇOK MAÇ (Oyuncu) */}
          <div className="client-glass border border-white/5 p-6 rounded-xl">
            <h3 className="text-[13px] font-[900] text-gray-400 tracking-widest mb-6 uppercase">EN ÇOK MAÇA ÇIKANLAR</h3>
            <div className="flex flex-col">
              {mostMatchesPlayers.length > 0 ? mostMatchesPlayers.map((p, idx) => (
                <PlayerRow key={p.id} player={p} idx={idx} val={p.matches} label="MAÇ" />
              )) : <EmptyRow label="MAÇ" />}
            </div>
          </div>

          {/* EN ÇOK GALİBİYET (Oyuncu) */}
          <div className="client-glass border border-white/5 p-6 rounded-xl">
            <h3 className="text-[13px] font-[900] text-gray-400 tracking-widest mb-6 uppercase">EN ÇOK GALİBİYET ALANLAR</h3>
            <div className="flex flex-col">
              {mostWinsPlayers.length > 0 ? mostWinsPlayers.map((p, idx) => (
                <PlayerRow key={p.id} player={p} idx={idx} val={p.wins} label="GALİBİYET" />
              )) : <EmptyRow label="GALİBİYET" />}
            </div>
          </div>
        </div>
      </div>

      {/* KALECİ İSTATİSTİKLERİ */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-[24px] font-[900] text-white tracking-widest uppercase">KALECİ <span className="text-[#00e5ff]">İSTATİSTİKLERİ</span></h2>
          <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          <div className="client-glass border border-white/5 p-6 rounded-xl">
            <h3 className="text-[13px] font-[900] text-gray-400 tracking-widest mb-6 uppercase">EN ÇOK GOL YEMEDEN BİTİREN (CLEANSHEET)</h3>
            <div className="flex flex-col">
              {goalkeepers.length > 0 ? goalkeepers.map((p, idx) => (
                <PlayerRow key={p.id} player={p} idx={idx} val={p.cleansheets} label="MAÇ" />
              )) : <EmptyRow label="MAÇ" />}
            </div>
          </div>
        </div>
      </div>

      {/* EN İYİ DEFANSLAR */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-[24px] font-[900] text-white tracking-widest uppercase">EN İYİ <span className="text-[#00e5ff]">DEFANSLAR</span></h2>
          <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          <div className="client-glass border border-white/5 p-6 rounded-xl">
            <h3 className="text-[13px] font-[900] text-gray-400 tracking-widest mb-6 uppercase">RATING ORTALAMASI (CB, LB, RB)</h3>
            <div className="flex flex-col">
              {bestDefenders.length > 0 ? bestDefenders.map((p, idx) => (
                <PlayerRow key={p.id} player={p} idx={idx} val={p.avgRating} label="RATING" />
              )) : (
                <EmptyRow label="RATING" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TAKIM İSTATİSTİKLERİ */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-[24px] font-[900] text-white tracking-widest uppercase">TAKIM <span className="text-[#00e5ff]">İSTATİSTİKLERİ</span></h2>
          <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          <div className="client-glass border border-white/5 p-6 rounded-xl">
            <h3 className="text-[13px] font-[900] text-gray-400 tracking-widest mb-6 uppercase">EN ÇOK GALİBİYET</h3>
            <div className="flex flex-col">
              {mostWinsTeams.length > 0 ? mostWinsTeams.map((t, idx) => (
                <TeamRow key={t.id} team={t} idx={idx} val={t.wins} label="GALİBİYET" />
              )) : <EmptyRow label="GALİBİYET" />}
            </div>
          </div>
          
          <div className="client-glass border border-white/5 p-6 rounded-xl">
            <h3 className="text-[13px] font-[900] text-gray-400 tracking-widest mb-6 uppercase">EN ÇOK GOL ATAN</h3>
            <div className="flex flex-col">
              {mostGoalsTeams.length > 0 ? mostGoalsTeams.map((t, idx) => (
                <TeamRow key={t.id} team={t} idx={idx} val={t.goalsFor} label="GOL" />
              )) : <EmptyRow label="GOL" />}
            </div>
          </div>
          
          <div className="client-glass border border-white/5 p-6 rounded-xl">
            <h3 className="text-[13px] font-[900] text-gray-400 tracking-widest mb-6 uppercase">EN AZ GOL YİYEN</h3>
            <div className="flex flex-col">
              {leastConcededTeams.length > 0 ? leastConcededTeams.map((t, idx) => (
                <TeamRow key={t.id} team={t} idx={idx} val={t.goalsAgainst} label="YENİLEN" />
              )) : <EmptyRow label="YENİLEN" />}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
