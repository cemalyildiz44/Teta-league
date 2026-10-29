import type { Metadata } from "next";
import Link from "next/link";
import TeamLogo from "@/components/TeamLogo";
import { getCachedFilterOptions, getCachedStatsData, PublicPlayerStatItem } from "./stats";

export const metadata: Metadata = {
  title: 'İstatistikler | TETA League',
  description: 'TETA League EA FC Pro Clubs oyuncu istatistikleri: sezon ve lig bazında gol, asist, reyting ve performans sıralamaları.',
  alternates: { canonical: '/istatistikler' },
};

export const revalidate = 60;

export default async function GlobalStatsPage({ searchParams }: { searchParams: Promise<{ season?: string, league?: string }> }) {
  const resolvedParams = await searchParams;

  // 1. Fetch cached filter options (seasons & leagues)
  const { seasons, leagues } = await getCachedFilterOptions();

  const activeSeason = seasons?.find(s => s.status === "ACTIVE") || seasons?.[0];
  const selectedSeasonId = resolvedParams.season || activeSeason?.id;
  const availableLeagues = leagues?.filter(l => l.season_id === selectedSeasonId) || [];
  const selectedLeagueId = resolvedParams.league || availableLeagues[0]?.id;

  // 2. Fetch cached statistics result for the selected scope
  const {
    topScorers,
    topAssisters,
    topRatings,
    mostMatches,
    goalkeepers
  } = await getCachedStatsData(selectedSeasonId, selectedLeagueId);

  const hasAnyData = topScorers.length > 0 || topAssisters.length > 0 || topRatings.length > 0 || mostMatches.length > 0 || goalkeepers.length > 0;

  // Helper to render Team logo & name
  const renderTeam = (team: PublicPlayerStatItem["team"]) => {
    if (!team) return <span className="text-gray-600 text-xs">-</span>;
    return (
      <Link href={`/takim/${team.slug}`} className="flex items-center gap-2 group">
        <TeamLogo src={team.logo_url} name={team.name} size="xs" />
        <span className="text-xs font-bold text-gray-300 group-hover:text-[#00e5ff] transition-colors truncate max-w-[120px]">{team.name}</span>
      </Link>
    );
  };

  const renderPlayer = (p: PublicPlayerStatItem) => (
    <Link href={`/oyuncular/${encodeURIComponent(p.username)}`} className="font-bold text-white text-xs hover:text-[#00e5ff] hover:underline transition-colors">
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

        {!hasAnyData ? (
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
