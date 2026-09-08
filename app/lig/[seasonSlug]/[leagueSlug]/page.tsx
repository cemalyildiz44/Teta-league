import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { getLeagueBySlugs } from "../../utils";
import { notFound } from "next/navigation";

export default async function LeagueStandingsPage({
  params,
}: {
  params: Promise<{ seasonSlug: string; leagueSlug: string }>;
}) {
  const resolvedParams = await params;
  const league = await getLeagueBySlugs(resolvedParams.seasonSlug, resolvedParams.leagueSlug);

  if (!league) {
    notFound();
  }

  const isLevel1 = league.level === 1 || resolvedParams.leagueSlug.includes("super");
  const isLevel2 = league.level === 2 || resolvedParams.leagueSlug.includes("ecl");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Fetch assigned teams from league_teams
  const { data: leagueTeamsData } = await supabase
    .from("league_teams")
    .select("team_id")
    .eq("league_id", league.id)
    .eq("is_active", true);
    
  const leagueTeams = leagueTeamsData || [];

  // 2. Fetch existing stats
  const { data: statsData } = await supabase
    .from("team_season_stats")
    .select("*")
    .eq("league_id", league.id);
    
  const stats = statsData || [];

  // 3. Merge them. If a team is in league_teams but has no stats, fallback to 0.
  const combinedStats = leagueTeams.map((lt) => {
    const existingStat = stats.find((s) => s.team_id === lt.team_id);
    if (existingStat) {
      return existingStat;
    }
    return {
      league_id: league.id,
      team_id: lt.team_id,
      matches_played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      points: 0,
    };
  });

  // 4. Fetch team details for display
  const { data: teams } = await supabase.from("teams").select("id, name, slug, logo_url");
  const teamMap = new Map((teams || []).map(t => [t.id, t]));

  let sortedStats: any[] = [];
  
  if (combinedStats && combinedStats.length > 0) {
    sortedStats = [...combinedStats].sort((a, b) => {
      // 1. Puan
      if (b.points !== a.points) return b.points - a.points;
      
      // 2. Averaj
      const gdA = a.goals_for - a.goals_against;
      const gdB = b.goals_for - b.goals_against;
      if (gdB !== gdA) return gdB - gdA;
      
      // 3. Atılan Gol
      if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
      
      // 4. Galibiyet
      if (b.wins !== a.wins) return b.wins - a.wins;
      
      return 0;
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-[28px] font-[900] tracking-tight text-white tracking-widest">PUAN <span className="text-[#00e5ff]">DURUMU</span></h2>
        <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
      </div>

      <div className="w-full overflow-x-auto custom-scrollbar bg-black/40 border border-white/5 rounded-2xl">
        <table className="w-full min-w-[700px] text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-[#00e5ff]/5">
              <th className="p-4 text-xs font-[900] text-gray-400 tracking-widest w-12 text-center">#</th>
              <th className="p-4 text-xs font-[900] text-gray-400 tracking-widest">TAKIM</th>
              <th className="p-4 text-xs font-[900] text-gray-400 tracking-widest text-center" title="Oynanan Maç">O</th>
              <th className="p-4 text-xs font-[900] text-gray-400 tracking-widest text-center" title="Galibiyet">G</th>
              <th className="p-4 text-xs font-[900] text-gray-400 tracking-widest text-center" title="Beraberlik">B</th>
              <th className="p-4 text-xs font-[900] text-gray-400 tracking-widest text-center" title="Mağlubiyet">M</th>
              <th className="p-4 text-xs font-[900] text-gray-400 tracking-widest text-center" title="Atılan Gol">AG</th>
              <th className="p-4 text-xs font-[900] text-gray-400 tracking-widest text-center" title="Yenilen Gol">YG</th>
              <th className="p-4 text-xs font-[900] text-[#00e5ff] tracking-widest text-center" title="Averaj">AV</th>
              <th className="p-4 text-xs font-[900] text-[#00e5ff] tracking-widest text-center" title="Puan">P</th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((stat, idx) => {
              const team = teamMap.get(stat.team_id);
              const gd = stat.goals_for - stat.goals_against;
              const rank = idx + 1;
              
              let rowBg = "hover:bg-white/5";
              let tdLeftBorder = "border-l-[3px] border-l-transparent";

              if (isLevel1) {
                if (rank === 1 || rank === 2) { 
                  rowBg = "bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20"; 
                  tdLeftBorder = "border-l-[3px] border-l-[#3b82f6] shadow-[-2px_0_10px_rgba(59,130,246,0.3)]"; 
                } else if (rank === 3 || rank === 4) { 
                  rowBg = "bg-[#eab308]/10 hover:bg-[#eab308]/20"; 
                  tdLeftBorder = "border-l-[3px] border-l-[#eab308] shadow-[-2px_0_10px_rgba(234,179,8,0.3)]"; 
                } else if (rank === 11 || rank === 12) { 
                  rowBg = "bg-[#ef4444]/10 hover:bg-[#ef4444]/20"; 
                  tdLeftBorder = "border-l-[3px] border-l-[#ef4444] shadow-[-2px_0_10px_rgba(239,68,68,0.3)]"; 
                }
              } else if (isLevel2) {
                if (rank === 1) { 
                  rowBg = "bg-[#22c55e]/10 hover:bg-[#22c55e]/20"; 
                  tdLeftBorder = "border-l-[3px] border-l-[#22c55e] shadow-[-2px_0_10px_rgba(34,197,94,0.3)]"; 
                } else if (rank >= 2 && rank <= 5) { 
                  rowBg = "bg-[#eab308]/10 hover:bg-[#eab308]/20"; 
                  tdLeftBorder = "border-l-[3px] border-l-[#eab308] shadow-[-2px_0_10px_rgba(234,179,8,0.3)]"; 
                }
              }
              
              return (
                <tr key={stat.team_id} className={`border-b border-white/5 transition-colors group ${rowBg}`}>
                  <td className={`p-4 text-center font-bold text-gray-400 ${tdLeftBorder}`}>{rank}</td>
                  <td className="p-4">
                    <Link href={`/takim/${team?.slug || ''}`} className="flex items-center gap-3 w-max group-hover:drop-shadow-[0_0_8px_rgba(0,229,255,0.5)] transition-all">
                      <div className="w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center p-1 shrink-0">
                        {team?.logo_url ? (
                          <img src={team.logo_url} alt={team.name} className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-[10px] font-bold text-[#00e5ff]">{team?.name?.substring(0,2)}</span>
                        )}
                      </div>
                      <span className="font-bold text-white tracking-widest text-sm uppercase">{team?.name || 'Bilinmeyen Takım'}</span>
                    </Link>
                  </td>
                  <td className="p-4 text-center text-gray-300 font-bold">{stat.matches_played}</td>
                  <td className="p-4 text-center text-emerald-400 font-bold">{stat.wins}</td>
                  <td className="p-4 text-center text-amber-400 font-bold">{stat.draws}</td>
                  <td className="p-4 text-center text-rose-400 font-bold">{stat.losses}</td>
                  <td className="p-4 text-center text-gray-300 font-bold">{stat.goals_for}</td>
                  <td className="p-4 text-center text-gray-300 font-bold">{stat.goals_against}</td>
                  <td className="p-4 text-center text-white font-bold">{gd > 0 ? `+${gd}` : gd}</td>
                  <td className="p-4 text-center text-[#00e5ff] font-[900] text-lg drop-shadow-[0_0_8px_rgba(0,229,255,0.3)]">{stat.points}</td>
                </tr>
              );
            })}
            
            {sortedStats.length === 0 && (
              <tr>
                <td colSpan={10} className="p-12 text-center text-gray-500 font-bold tracking-widest text-sm uppercase">
                  BU LİG İÇİN HENÜZ PUAN DURUMU BULUNMUYOR
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4 md:gap-6 text-[11px] md:text-[12px] font-[800] uppercase tracking-widest text-gray-400">
        {isLevel1 && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
              <span>Şampiyonlar Ligi</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#eab308] shadow-[0_0_8px_rgba(234,179,8,0.5)]"></div>
              <span>Avrupa Ligi</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
              <span>Küme Düşme</span>
            </div>
          </>
        )}
        {isLevel2 && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
              <span>Lig Yükselme</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#eab308] shadow-[0_0_8px_rgba(234,179,8,0.5)]"></div>
              <span>Lig Yükselme Play-Off</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
