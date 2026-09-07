import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";

export default async function GlobalStatsPage({ searchParams }: { searchParams: Promise<{ season?: string, league?: string }> }) {
  const resolvedParams = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Fetch seasons and leagues
  const { data: seasons } = await supabase.from("seasons").select("id, name, status").order("created_at", { ascending: false });
  const { data: leagues } = await supabase.from("leagues").select("id, name, season_id").order("name");

  const activeSeason = seasons?.find(s => s.status === "ACTIVE") || seasons?.[0];
  const selectedSeasonId = resolvedParams.season || activeSeason?.id;
  const availableLeagues = leagues?.filter(l => l.season_id === selectedSeasonId) || [];
  const selectedLeagueId = resolvedParams.league || availableLeagues[0]?.id;

  // 2. Fetch APPROVED matches
  let matchIds: string[] = [];
  if (selectedSeasonId && selectedLeagueId) {
    const { data: matches } = await supabase
      .from("matches")
      .select("id")
      .eq("season_id", selectedSeasonId)
      .eq("league_id", selectedLeagueId)
      .eq("status", "APPROVED");
    matchIds = (matches || []).map(m => m.id);
  }

  // 3. Fetch raw match_player_stats for those matches
  let rawStats: any[] = [];
  if (matchIds.length > 0) {
    const { data: stats } = await supabase
      .from("match_player_stats")
      .select("*")
      .in("match_id", matchIds);
    rawStats = stats || [];
  }

  // 4. MİMARİ B SEÇENEĞİ: Yalnızca EA hesabı bağlı ve kayıtlı "gerçek" oyuncuları filtrele
  // Önce istatistiklerdeki tüm ea_player_id'leri bul
  const eaPlayerIds = Array.from(new Set(rawStats.map(s => s.ea_player_id).filter(Boolean)));
  
  let validProfiles: any[] = [];
  let eaToProfileMap = new Map();
  
  if (eaPlayerIds.length > 0) {
    // Sadece current_ea_player_id dolu olan profilleri çek
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, username, current_ea_player_id")
      .in("current_ea_player_id", eaPlayerIds)
      .not("current_ea_player_id", "is", null);
      
    validProfiles = profilesData || [];
    eaToProfileMap = new Map(validProfiles.map(p => [p.current_ea_player_id, p]));
  }

  // Filtrelenmiş rawStats: Yalnızca ea_player_id'si bir profile bağlı olanları al.
  const filteredStats = rawStats.filter(s => s.ea_player_id && eaToProfileMap.has(s.ea_player_id));

  // Teams mapping
  const teamIds = Array.from(new Set(filteredStats.map(s => s.team_id).filter(Boolean)));
  let teamMap = new Map();
  if (teamIds.length > 0) {
    const { data: teamsData } = await supabase.from("teams").select("id, name, slug, logo_url").in("id", teamIds);
    teamMap = new Map((teamsData || []).map(t => [t.id, t]));
  }

  // 5. Aggregate stats per VALID player
  const playerStatsMap = new Map<string, any>();
  for (const s of filteredStats) {
    const profile = eaToProfileMap.get(s.ea_player_id);
    const key = profile.id; // Unique identifier is profile ID

    if (!playerStatsMap.has(key)) {
      playerStatsMap.set(key, {
        profile_id: profile.id,
        username: profile.username,
        ea_player_id: s.ea_player_id,
        team_id: s.team_id,
        position: s.position,
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
    if (s.team_id) ps.team_id = s.team_id;
  }

  const aggregated = Array.from(playerStatsMap.values()).map(ps => ({
    ...ps,
    avg_rating: ps.matches_played > 0 ? (ps.rating_sum / ps.matches_played).toFixed(2) : "0.00",
    team: teamMap.get(ps.team_id)
  }));

  // Create sub-lists
  const topScorers = [...aggregated].sort((a, b) => b.goals - a.goals || a.matches_played - b.matches_played).filter(p => p.goals > 0).slice(0, 10);
  const topAssisters = [...aggregated].sort((a, b) => b.assists - a.assists || a.matches_played - b.matches_played).filter(p => p.assists > 0).slice(0, 10);
  const topRatings = [...aggregated].sort((a, b) => parseFloat(b.avg_rating) - parseFloat(a.avg_rating) || b.matches_played - a.matches_played).filter(p => parseFloat(p.avg_rating) > 0).slice(0, 10);
  const mostMatches = [...aggregated].sort((a, b) => b.matches_played - a.matches_played).slice(0, 10);
  const goalkeepers = aggregated.filter(p => p.position === "goalkeeper" || p.saves > 0).sort((a, b) => b.saves - a.saves || a.goals_conceded - b.goals_conceded).slice(0, 10);

  // Helper to render Team logo & name
  const renderTeam = (team: any) => {
    if (!team) return <span className="text-gray-600 text-xs">-</span>;
    return (
      <Link href={`/takim/${team.slug}`} className="flex items-center gap-2 group">
        <div className="w-5 h-5 rounded-full overflow-hidden bg-[#0a1628] border border-white/10 shrink-0">
          {team.logo_url ? (
            <img src={team.logo_url} alt={team.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[8px] font-black text-[#00e5ff]">{team.name.charAt(0)}</div>
          )}
        </div>
        <span className="text-xs font-bold text-gray-300 group-hover:text-[#00e5ff] transition-colors truncate max-w-[120px]">{team.name}</span>
      </Link>
    );
  };

  const renderPlayer = (p: any) => (
    <Link href={`/oyuncular/${p.username}`} className="font-bold text-white text-xs hover:text-[#00e5ff] hover:underline transition-colors">
      {p.username}
    </Link>
  );

  return (
    <main className="min-h-screen bg-[#060d18] pt-12 pb-12">
      <div className="max-w-6xl mx-auto px-4 lg:px-6">
        
        <div className="mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-widest mb-2 uppercase">İSTATİSTİKLER</h1>
          <p className="text-gray-400 text-sm">Sezonun en iyi oyuncuları ve performansları</p>
        </div>

        <div className="card-surface p-6 rounded-xl border border-white/5 mb-10 flex flex-col md:flex-row gap-4 items-end">
          <form className="flex-1 flex flex-col md:flex-row gap-4 w-full" action="/istatistikler" method="GET">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 mb-2 tracking-widest">SEZON SEÇ</label>
              <select 
                name="season"
                defaultValue={selectedSeasonId}
                className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
              >
                {seasons?.map(s => (
                  <option key={s.id} value={s.id}>{s.name} {s.status === "ACTIVE" ? "(Aktif)" : ""}</option>
                ))}
              </select>
            </div>
            
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 mb-2 tracking-widest">LİG SEÇ</label>
              <select 
                name="league"
                defaultValue={selectedLeagueId}
                className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
              >
                {availableLeagues.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
                {availableLeagues.length === 0 && <option value="">Lig bulunamadı</option>}
              </select>
            </div>
            
            <button 
              type="submit"
              className="px-8 py-2.5 bg-[#00e5ff] text-black font-black uppercase tracking-widest text-sm rounded-lg hover:bg-[#00c8e6] transition-colors whitespace-nowrap"
            >
              Filtrele
            </button>
          </form>
        </div>

        {aggregated.length === 0 ? (
          <div className="card-surface p-12 rounded-xl border border-white/5 text-center">
            <span className="text-gray-500 font-medium italic">Henüz yeterli istatistik verisi bulunmuyor veya EA hesapları eşleşmemiş.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* GOL KRALLIĞI */}
            <div className="card-surface rounded-xl border border-white/5 overflow-hidden">
              <div className="bg-[#0a1628] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-white font-black tracking-widest uppercase">GOL KRALLIĞI</h3>
                <span className="text-xs text-[#00e5ff] font-bold">TOP 10</span>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-[#060d18] text-[10px] text-gray-500 uppercase font-black tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">#</th>
                      <th className="px-4 py-3">OYUNCU</th>
                      <th className="px-4 py-3">TAKIM</th>
                      <th className="px-4 py-3 text-center">M</th>
                      <th className="px-4 py-3 text-center text-[#00e5ff]">G</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {topScorers.map((p, idx) => (
                      <tr key={p.profile_id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-center font-black text-gray-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">{renderPlayer(p)}</td>
                        <td className="px-4 py-3">{renderTeam(p.team)}</td>
                        <td className="px-4 py-3 text-center font-bold text-gray-400 text-xs">{p.matches_played}</td>
                        <td className="px-4 py-3 text-center font-black text-[#00e5ff] text-sm">{p.goals}</td>
                      </tr>
                    ))}
                    {topScorers.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500 italic text-xs">Veri yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ASİST KRALLIĞI */}
            <div className="card-surface rounded-xl border border-white/5 overflow-hidden">
              <div className="bg-[#0a1628] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-white font-black tracking-widest uppercase">ASİST KRALLIĞI</h3>
                <span className="text-xs text-[#00e5ff] font-bold">TOP 10</span>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-[#060d18] text-[10px] text-gray-500 uppercase font-black tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">#</th>
                      <th className="px-4 py-3">OYUNCU</th>
                      <th className="px-4 py-3">TAKIM</th>
                      <th className="px-4 py-3 text-center">M</th>
                      <th className="px-4 py-3 text-center text-[#00e5ff]">A</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {topAssisters.map((p, idx) => (
                      <tr key={p.profile_id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-center font-black text-gray-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">{renderPlayer(p)}</td>
                        <td className="px-4 py-3">{renderTeam(p.team)}</td>
                        <td className="px-4 py-3 text-center font-bold text-gray-400 text-xs">{p.matches_played}</td>
                        <td className="px-4 py-3 text-center font-black text-[#00e5ff] text-sm">{p.assists}</td>
                      </tr>
                    ))}
                    {topAssisters.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500 italic text-xs">Veri yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* EN İYİ RATING */}
            <div className="card-surface rounded-xl border border-white/5 overflow-hidden">
              <div className="bg-[#0a1628] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-white font-black tracking-widest uppercase">EN İYİ RATING</h3>
                <span className="text-xs text-[#00e5ff] font-bold">TOP 10</span>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-[#060d18] text-[10px] text-gray-500 uppercase font-black tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">#</th>
                      <th className="px-4 py-3">OYUNCU</th>
                      <th className="px-4 py-3">TAKIM</th>
                      <th className="px-4 py-3 text-center">M</th>
                      <th className="px-4 py-3 text-center text-[#00e5ff]">RTG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {topRatings.map((p, idx) => (
                      <tr key={p.profile_id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-center font-black text-gray-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">{renderPlayer(p)}</td>
                        <td className="px-4 py-3">{renderTeam(p.team)}</td>
                        <td className="px-4 py-3 text-center font-bold text-gray-400 text-xs">{p.matches_played}</td>
                        <td className="px-4 py-3 text-center font-black text-[#00e5ff] text-sm">{p.avg_rating}</td>
                      </tr>
                    ))}
                    {topRatings.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500 italic text-xs">Veri yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* EN ÇOK MAÇ */}
            <div className="card-surface rounded-xl border border-white/5 overflow-hidden">
              <div className="bg-[#0a1628] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-white font-black tracking-widest uppercase">EN ÇOK MAÇ</h3>
                <span className="text-xs text-[#00e5ff] font-bold">TOP 10</span>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-[#060d18] text-[10px] text-gray-500 uppercase font-black tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">#</th>
                      <th className="px-4 py-3">OYUNCU</th>
                      <th className="px-4 py-3">TAKIM</th>
                      <th className="px-4 py-3 text-center text-[#00e5ff]">M</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {mostMatches.map((p, idx) => (
                      <tr key={p.profile_id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-center font-black text-gray-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">{renderPlayer(p)}</td>
                        <td className="px-4 py-3">{renderTeam(p.team)}</td>
                        <td className="px-4 py-3 text-center font-black text-[#00e5ff] text-sm">{p.matches_played}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* KALECİ İSTATİSTİKLERİ */}
            <div className="card-surface rounded-xl border border-white/5 overflow-hidden md:col-span-2">
              <div className="bg-[#0a1628] px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-white font-black tracking-widest uppercase">KALECİ İSTATİSTİKLERİ</h3>
                <span className="text-xs text-[#00e5ff] font-bold">TOP 10</span>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-[#060d18] text-[10px] text-gray-500 uppercase font-black tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">#</th>
                      <th className="px-4 py-3">OYUNCU</th>
                      <th className="px-4 py-3">TAKIM</th>
                      <th className="px-4 py-3 text-center">M</th>
                      <th className="px-4 py-3 text-center text-[#00e5ff]">KURTARIŞ</th>
                      <th className="px-4 py-3 text-center text-red-400">YEDİĞİ GOL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {goalkeepers.map((p, idx) => (
                      <tr key={p.profile_id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-center font-black text-gray-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">{renderPlayer(p)}</td>
                        <td className="px-4 py-3">{renderTeam(p.team)}</td>
                        <td className="px-4 py-3 text-center font-bold text-gray-400 text-xs">{p.matches_played}</td>
                        <td className="px-4 py-3 text-center font-black text-[#00e5ff] text-sm">{p.saves}</td>
                        <td className="px-4 py-3 text-center font-black text-red-400 text-sm">{p.goals_conceded}</td>
                      </tr>
                    ))}
                    {goalkeepers.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500 italic text-xs">Veri yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>
    </main>
  );
}