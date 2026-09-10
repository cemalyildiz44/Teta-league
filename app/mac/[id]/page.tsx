import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Shield, ChevronRight } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";

import { getMatchById, getTeamById } from "@/lib/fetchers";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const matchId = resolvedParams.id;

  const match = await getMatchById(matchId);
  if (!match || match.status !== "APPROVED") return { title: "Maç Bulunamadı | TETA League" };

  const [ht, at] = await Promise.all([
    match.home_team_id ? getTeamById(match.home_team_id) : Promise.resolve(null),
    match.away_team_id ? getTeamById(match.away_team_id) : Promise.resolve(null)
  ]);

  return {
    title: `${ht?.name || "Ev Sahibi"} ${match.home_score} - ${match.away_score} ${at?.name || "Deplasman"} | TETA League`,
  };
}

export default async function PublicMatchDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ tab?: string }> }) {
  const resolvedParams = await params;
  const matchId = resolvedParams.id;
  const resolvedSearchParams = await searchParams;
  const activeTab = resolvedSearchParams.tab || 'genel';

  const match = await getMatchById(matchId);
  if (!match || match.status !== "APPROVED") notFound();

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Parallel fetches for relations (homeTeam & awayTeam are memoized from generateMetadata)
  const [{ data: leagueData }, { data: seasonData }, homeTeam, awayTeam, { data: statsData }] = await Promise.all([
    match.league_id ? supabase.from("leagues").select("id, name, slug").eq("id", match.league_id).maybeSingle() : Promise.resolve({ data: null }),
    match.season_id ? supabase.from("seasons").select("id, name, slug").eq("id", match.season_id).maybeSingle() : Promise.resolve({ data: null }),
    getTeamById(match.home_team_id),
    getTeamById(match.away_team_id),
    supabase.from("match_player_stats").select("*, profiles(username, avatar_url)").eq("match_id", matchId)
  ]);

  if (!homeTeam || !awayTeam) notFound();

  (match as any).leagues = leagueData;
  (match as any).seasons = seasonData;

  const stats = statsData || [];
  const homeStats = stats.filter(s => s.team_id === match.home_team_id).sort((a, b) => b.rating - a.rating);
  const awayStats = stats.filter(s => s.team_id === match.away_team_id).sort((a, b) => b.rating - a.rating);

  // Totals
  const sumStats = (teamArr: any[], key: string) => teamArr.reduce((acc, curr) => acc + (curr[key] || 0), 0);
  
  const hShots = sumStats(homeStats, "shots");
  const aShots = sumStats(awayStats, "shots");
  
  const hPassM = sumStats(homeStats, "passes_made");
  const hPassA = sumStats(homeStats, "pass_attempts");
  const hPassAcc = hPassA > 0 ? Math.round((hPassM / hPassA) * 100) : 0;
  
  const aPassM = sumStats(awayStats, "passes_made");
  const aPassA = sumStats(awayStats, "pass_attempts");
  const aPassAcc = aPassA > 0 ? Math.round((aPassM / aPassA) * 100) : 0;
  
  const hTackM = sumStats(homeStats, "tackles_made");
  const aTackM = sumStats(awayStats, "tackles_made");
  
  const hSaves = sumStats(homeStats, "saves");
  const aSaves = sumStats(awayStats, "saves");

  const hRating = homeStats.length > 0 ? (sumStats(homeStats, "rating") / homeStats.length).toFixed(1) : "0.0";
  const aRating = awayStats.length > 0 ? (sumStats(awayStats, "rating") / awayStats.length).toFixed(1) : "0.0";

  // Goals & Assists Lists
  const homeGoals = homeStats.filter(s => s.goals > 0);
  const awayGoals = awayStats.filter(s => s.goals > 0);
  const homeAssists = homeStats.filter(s => s.assists > 0);
  const awayAssists = awayStats.filter(s => s.assists > 0);
  const allMom = stats.filter(s => s.is_mom);

  const tabs = [
    { id: 'genel', label: 'GENEL' },
    { id: 'kadrolar', label: 'KADROLAR' },
    { id: 'istatistikler', label: 'İSTATİSTİKLER' },
  ];

  const renderPlayerRow = (s: any) => {
    const uname = (s.profiles as any)?.username || s.ea_player_name || "Bilinmiyor";
    const avatar = (s.profiles as any)?.avatar_url;
    return (
      <Link key={s.id} href={(s.profiles as any)?.username ? `/oyuncular/${(s.profiles as any).username}` : "#"} className="flex items-center gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-xl hover:bg-white/[0.04] transition-colors group">
        <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
          {avatar ? <img src={avatar} className="w-full h-full object-cover" /> : <span className="text-[14px] font-[900] text-[#00e5ff] uppercase">{uname.substring(0, 2)}</span>}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[14px] font-[900] text-white truncate group-hover:text-[#00e5ff] transition-colors uppercase">{uname}</span>
          <span className="text-[10px] font-[800] text-gray-500 uppercase tracking-widest mt-0.5">{s.position || "Belirtilmedi"}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-[800] text-gray-500 uppercase tracking-widest mb-0.5">RATING</span>
          <span className="text-[16px] font-[900] text-[#00e5ff]">{s.rating?.toFixed(1) || "-"}</span>
        </div>
      </Link>
    );
  };

  const renderStatsTable = (teamStats: any[]) => (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-left min-w-[600px]">
        <thead className="bg-[#01060b] border-b border-white/5">
          <tr>
            <th className="px-4 py-3 text-[10px] font-[900] text-gray-500 tracking-widest uppercase">OYUNCU</th>
            <th className="px-2 py-3 text-center text-[10px] font-[900] text-[#00E5FF] tracking-widest uppercase">RTG</th>
            <th className="px-2 py-3 text-center text-[10px] font-[900] text-gray-500 tracking-widest uppercase">G</th>
            <th className="px-2 py-3 text-center text-[10px] font-[900] text-gray-500 tracking-widest uppercase">A</th>
            <th className="px-2 py-3 text-center text-[10px] font-[900] text-gray-500 tracking-widest uppercase">ŞUT</th>
            <th className="px-2 py-3 text-center text-[10px] font-[900] text-gray-500 tracking-widest uppercase">PAS</th>
            <th className="px-2 py-3 text-center text-[10px] font-[900] text-gray-500 tracking-widest uppercase">MÜD</th>
            <th className="px-2 py-3 text-center text-[10px] font-[900] text-gray-500 tracking-widest uppercase">KIR</th>
            <th className="px-4 py-3 text-center text-[10px] font-[900] text-gray-500 tracking-widest uppercase">MOM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {teamStats.map(s => {
            const uname = (s.profiles as any)?.username || s.ea_player_name || "Bilinmiyor";
            return (
              <tr key={s.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-4 py-3">
                  <Link href={(s.profiles as any)?.username ? `/oyuncular/${(s.profiles as any).username}` : "#"} className="flex flex-col">
                    <span className="font-[800] text-[13px] text-white group-hover:text-[#00e5ff] transition-colors uppercase">{uname}</span>
                    <span className="text-[10px] font-[700] text-gray-600 uppercase mt-0.5">{s.position}</span>
                  </Link>
                </td>
                <td className="px-2 py-3 text-center font-[900] text-[14px] text-[#00E5FF]">{s.rating?.toFixed(1) || "-"}</td>
                <td className="px-2 py-3 text-center font-[900] text-white">{s.goals || "-"}</td>
                <td className="px-2 py-3 text-center font-[900] text-white">{s.assists || "-"}</td>
                <td className="px-2 py-3 text-center font-[800] text-gray-400">{s.shots || "-"}</td>
                <td className="px-2 py-3 text-center font-[800] text-gray-400">{s.passes_made}/{s.pass_attempts}</td>
                <td className="px-2 py-3 text-center font-[800] text-gray-400">{s.tackles_made}/{s.tackle_attempts}</td>
                <td className="px-2 py-3 text-center font-[900] text-red-400">{s.red_cards || "-"}</td>
                <td className="px-4 py-3 text-center">
                  {s.is_mom ? <span className="text-amber-400 text-[14px]">⭐</span> : <span className="text-gray-700">-</span>}
                </td>
              </tr>
            )
          })}
          {teamStats.length === 0 && (
            <tr><td colSpan={9} className="px-6 py-12 text-center text-[12px] font-[700] text-gray-600">İstatistik verisi bulunmuyor.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#01060b] pt-8 pb-20">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6">

        {/* BREADCRUMB */}
        <div className="flex items-center gap-2 mb-8 text-[10px] font-[800] tracking-[0.2em] uppercase text-gray-600 overflow-x-auto whitespace-nowrap">
          <Link href="/ligler" className="hover:text-[#00e5ff] transition-colors">LİGLER</Link>
          <ChevronRight className="w-3 h-3 text-gray-700" />
          {leagueData && (
            <>
              <Link href={`/lig/${seasonData?.slug}/${leagueData.slug}`} className="hover:text-[#00e5ff] transition-colors">{leagueData.name}</Link>
              <ChevronRight className="w-3 h-3 text-gray-700" />
            </>
          )}
          <span>{(match.fixtures as any)?.week_number ? `${(match.fixtures as any).week_number}. HAFTA` : 'MAÇ DETAYI'}</span>
        </div>

        {/* MAÇ HEADER (SCOREBOARD) */}
        <section className="bg-[#03070c] border border-white/5 rounded-3xl p-6 md:p-10 lg:p-12 mb-8 relative overflow-hidden shadow-2xl">
          {/* Arkaplan süslemesi */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#00e5ff]/5 blur-[100px] rounded-full pointer-events-none transform translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#00e5ff]/5 blur-[100px] rounded-full pointer-events-none transform -translate-x-1/2 translate-y-1/2" />

          <div className="relative z-10 flex flex-col items-center">
            {/* Meta */}
            <div className="flex flex-col items-center text-center mb-8 md:mb-12 gap-3">
              <span className="text-[12px] md:text-[14px] font-[900] tracking-[0.3em] uppercase text-gray-400">
                {seasonData?.name} — {leagueData?.name}
              </span>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-[#00e5ff]/10 border border-[#00e5ff]/20 text-[#00e5ff] text-[10px] font-[900] tracking-widest uppercase rounded">ONAYLANDI</span>
                {(match.fixtures as any)?.week_number && (
                  <span className="px-3 py-1 bg-white/5 border border-white/10 text-white text-[10px] font-[900] tracking-widest uppercase rounded">HAFTA {(match.fixtures as any).week_number}</span>
                )}
              </div>
              <span className="text-[11px] font-[800] tracking-widest text-gray-500 mt-2 uppercase">{new Date(match.played_at).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" })}</span>
            </div>

            {/* Skor Alanı */}
            <div className="w-full flex items-center justify-between md:justify-center md:gap-24 lg:gap-32">
              
              {/* HOME TEAM */}
              <Link href={`/takim/${homeTeam?.slug}`} className="flex flex-col items-center group flex-1 md:flex-none">
                <div className="mb-4 md:mb-6">
                  <TeamLogo src={homeTeam?.logo_url} name={homeTeam?.name} size="hero" className="w-24 h-24 md:w-36 md:h-36" />
                </div>
                <span className="text-[16px] md:text-[24px] font-[900] text-white tracking-widest uppercase text-center group-hover:text-[#00e5ff] transition-colors leading-tight">
                  {homeTeam?.name}
                </span>
                <span className="text-[10px] font-[900] text-gray-600 uppercase tracking-[0.2em] mt-2 hidden md:block">EV SAHİBİ</span>
              </Link>

              {/* SKOR */}
              <div className="flex items-center gap-2 md:gap-6 shrink-0 bg-black/40 backdrop-blur-md px-6 md:px-12 py-4 md:py-6 rounded-3xl border border-white/10 shadow-2xl">
                <span className="text-[40px] md:text-[72px] font-[900] text-white tracking-tighter leading-none">{match.home_score}</span>
                <span className="text-[20px] md:text-[32px] font-[900] text-gray-600 leading-none mb-1 md:mb-2">-</span>
                <span className="text-[40px] md:text-[72px] font-[900] text-white tracking-tighter leading-none">{match.away_score}</span>
              </div>

              {/* AWAY TEAM */}
              <Link href={`/takim/${awayTeam?.slug}`} className="flex flex-col items-center group flex-1 md:flex-none">
                <div className="mb-4 md:mb-6">
                  <TeamLogo src={awayTeam?.logo_url} name={awayTeam?.name} size="hero" className="w-24 h-24 md:w-36 md:h-36" />
                </div>
                <span className="text-[16px] md:text-[24px] font-[900] text-white tracking-widest uppercase text-center group-hover:text-[#00e5ff] transition-colors leading-tight">
                  {awayTeam?.name}
                </span>
                <span className="text-[10px] font-[900] text-gray-600 uppercase tracking-[0.2em] mt-2 hidden md:block">DEPLASMAN</span>
              </Link>

            </div>
          </div>
        </section>

        {/* TABS */}
        <nav className="mb-8 sticky top-[60px] z-40 bg-[#01060b]/95 backdrop-blur-md border-b border-white/10 -mx-4 lg:-mx-6 px-4 lg:px-6">
          <div className="flex gap-2 overflow-x-auto custom-scrollbar py-0">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Link 
                  key={tab.id}
                  href={`?tab=${tab.id}`} 
                  scroll={false}
                  className={`px-6 py-5 text-[11px] font-[900] tracking-widest uppercase whitespace-nowrap transition-all border-b-2 ${
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

        {/* TAB CONTENTS */}
        <div className="animate-in fade-in duration-500">
          
          {/* GENEL TAB */}
          {activeTab === 'genel' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* EV SAHİBİ ÖZET */}
                <div className="bg-[#03070c] border border-white/5 rounded-2xl p-6 md:p-8">
                  <h3 className="text-[14px] font-[900] text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                    <TeamLogo src={homeTeam?.logo_url} name={homeTeam?.name} size="xs" />
                    {homeTeam?.name}
                  </h3>
                  
                  {homeGoals.length > 0 || homeAssists.length > 0 ? (
                    <div className="space-y-8">
                      {homeGoals.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-4 border-b border-white/5 pb-2">GOLLER</h4>
                          <div className="space-y-3">
                            {homeGoals.map(s => {
                              const uname = (s.profiles as any)?.username || s.ea_player_name || "Bilinmiyor";
                              return Array.from({ length: s.goals }).map((_, i) => (
                                <div key={`${s.id}-g-${i}`} className="flex items-center gap-3 text-[14px]">
                                  <span className="text-emerald-400">⚽</span>
                                  <Link href={(s.profiles as any)?.username ? `/oyuncular/${(s.profiles as any).username}` : "#"} className="font-[800] text-white hover:text-[#00e5ff] uppercase">{uname}</Link>
                                </div>
                              ))
                            })}
                          </div>
                        </div>
                      )}
                      
                      {homeAssists.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-4 border-b border-white/5 pb-2">ASİSTLER</h4>
                          <div className="space-y-3">
                            {homeAssists.map(s => {
                              const uname = (s.profiles as any)?.username || s.ea_player_name || "Bilinmiyor";
                              return Array.from({ length: s.assists }).map((_, i) => (
                                <div key={`${s.id}-a-${i}`} className="flex items-center gap-3 text-[14px]">
                                  <span className="text-gray-500">👟</span>
                                  <Link href={(s.profiles as any)?.username ? `/oyuncular/${(s.profiles as any).username}` : "#"} className="font-[800] text-gray-300 hover:text-[#00e5ff] uppercase">{uname}</Link>
                                </div>
                              ))
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[12px] font-[700] text-gray-600">Skor katkısı bulunmuyor.</div>
                  )}
                </div>

                {/* DEPLASMAN ÖZET */}
                <div className="bg-[#03070c] border border-white/5 rounded-2xl p-6 md:p-8">
                  <h3 className="text-[14px] font-[900] text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                    <TeamLogo src={awayTeam?.logo_url} name={awayTeam?.name} size="xs" />
                    {awayTeam?.name}
                  </h3>
                  
                  {awayGoals.length > 0 || awayAssists.length > 0 ? (
                    <div className="space-y-8">
                      {awayGoals.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-4 border-b border-white/5 pb-2">GOLLER</h4>
                          <div className="space-y-3">
                            {awayGoals.map(s => {
                              const uname = (s.profiles as any)?.username || s.ea_player_name || "Bilinmiyor";
                              return Array.from({ length: s.goals }).map((_, i) => (
                                <div key={`${s.id}-g-${i}`} className="flex items-center gap-3 text-[14px]">
                                  <span className="text-emerald-400">⚽</span>
                                  <Link href={(s.profiles as any)?.username ? `/oyuncular/${(s.profiles as any).username}` : "#"} className="font-[800] text-white hover:text-[#00e5ff] uppercase">{uname}</Link>
                                </div>
                              ))
                            })}
                          </div>
                        </div>
                      )}
                      
                      {awayAssists.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-4 border-b border-white/5 pb-2">ASİSTLER</h4>
                          <div className="space-y-3">
                            {awayAssists.map(s => {
                              const uname = (s.profiles as any)?.username || s.ea_player_name || "Bilinmiyor";
                              return Array.from({ length: s.assists }).map((_, i) => (
                                <div key={`${s.id}-a-${i}`} className="flex items-center gap-3 text-[14px]">
                                  <span className="text-gray-500">👟</span>
                                  <Link href={(s.profiles as any)?.username ? `/oyuncular/${(s.profiles as any).username}` : "#"} className="font-[800] text-gray-300 hover:text-[#00e5ff] uppercase">{uname}</Link>
                                </div>
                              ))
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[12px] font-[700] text-gray-600">Skor katkısı bulunmuyor.</div>
                  )}
                </div>
              </div>

              {/* MAÇIN OYUNCUSU (MOTM) */}
              {allMom.length > 0 && (
                <div className="bg-[#03070c] border border-amber-500/20 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-[50px] rounded-full" />
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <span className="text-3xl">⭐</span>
                  </div>
                  <div className="flex flex-col text-center md:text-left z-10">
                    <h4 className="text-[10px] font-[900] text-amber-500 tracking-[0.3em] uppercase mb-1">MAÇIN OYUNCUSU</h4>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                      {allMom.map(m => {
                        const uname = (m.profiles as any)?.username || m.ea_player_name || "Bilinmiyor";
                        const team = m.team_id === match.home_team_id ? homeTeam : awayTeam;
                        return (
                          <Link key={m.id} href={(m.profiles as any)?.username ? `/oyuncular/${(m.profiles as any).username}` : "#"} className="text-[20px] font-[900] text-white hover:text-amber-400 transition-colors uppercase">
                            {uname} <span className="text-[12px] text-gray-500 tracking-widest ml-2 border-l border-white/10 pl-2">{team?.name}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* KADROLAR TAB */}
          {activeTab === 'kadrolar' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* HOME KADRO */}
              <div className="space-y-4">
                <h3 className="text-[12px] font-[900] text-gray-500 uppercase tracking-[0.2em] mb-4 text-center md:text-left">{homeTeam?.name} KADROSU</h3>
                {homeStats.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {homeStats.map(renderPlayerRow)}
                  </div>
                ) : (
                  <div className="bg-[#03070c] border border-white/5 rounded-2xl px-6 py-12 text-center text-[12px] font-[700] text-gray-600">Kadro verisi bulunmuyor.</div>
                )}
              </div>

              {/* AWAY KADRO */}
              <div className="space-y-4">
                <h3 className="text-[12px] font-[900] text-gray-500 uppercase tracking-[0.2em] mb-4 text-center md:text-left">{awayTeam?.name} KADROSU</h3>
                {awayStats.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {awayStats.map(renderPlayerRow)}
                  </div>
                ) : (
                  <div className="bg-[#03070c] border border-white/5 rounded-2xl px-6 py-12 text-center text-[12px] font-[700] text-gray-600">Kadro verisi bulunmuyor.</div>
                )}
              </div>
            </div>
          )}

          {/* İSTATİSTİKLER TAB */}
          {activeTab === 'istatistikler' && (
            <div className="space-y-8">
              
              {/* TAKIM KARŞILAŞTIRMASI */}
              {stats.length > 0 && (
                <div className="bg-[#03070c] border border-white/5 rounded-2xl p-6 md:p-10 mb-8">
                  <h3 className="text-[12px] font-[900] text-gray-500 uppercase tracking-[0.2em] mb-8 text-center">TAKIM İSTATİSTİKLERİ</h3>
                  <div className="flex flex-col gap-6 max-w-2xl mx-auto">
                    {[
                      { l: "RATING", h: hRating, a: aRating },
                      { l: "ŞUT", h: hShots, a: aShots },
                      { l: "PAS İSABETİ", h: `${hPassAcc}%`, a: `${aPassAcc}%` },
                      { l: "BAŞARILI MÜDAHALE", h: hTackM, a: aTackM },
                      { l: "KURTARIŞ", h: hSaves, a: aSaves },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center justify-between group pb-4 border-b border-white/5 last:border-0 last:pb-0">
                        <span className="w-20 text-[18px] font-[900] text-white text-left">{row.h}</span>
                        <span className="text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center flex-1">{row.l}</span>
                        <span className="w-20 text-[18px] font-[900] text-white text-right">{row.a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* HOME TABLE */}
              <div className="space-y-4">
                <h3 className="text-[12px] font-[900] text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                  <TeamLogo src={homeTeam?.logo_url} name={homeTeam?.name} size="xs" />
                  {homeTeam?.name} OYUNCU İSTATİSTİKLERİ
                </h3>
                <div className="bg-[#03070c] border border-white/5 rounded-2xl overflow-hidden">
                  {renderStatsTable(homeStats)}
                </div>
              </div>

              {/* AWAY TABLE */}
              <div className="space-y-4 pt-4">
                <h3 className="text-[12px] font-[900] text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                  <TeamLogo src={awayTeam?.logo_url} name={awayTeam?.name} size="xs" />
                  {awayTeam?.name} OYUNCU İSTATİSTİKLERİ
                </h3>
                <div className="bg-[#03070c] border border-white/5 rounded-2xl overflow-hidden">
                  {renderStatsTable(awayStats)}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </main>
  );
}
