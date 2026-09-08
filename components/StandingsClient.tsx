'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface StandingsTeamRow {
  team_id: string;
  team_name: string;
  team_slug: string;
  team_logo_url: string | null;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
}

export interface StandingsLeagueInfo {
  id: string;
  name: string;
  slug: string;
  level: number;
  seasonSlug: string;
  seasonName: string;
  teams: StandingsTeamRow[];
}

interface StandingsClientProps {
  superLig: StandingsLeagueInfo | null;
  ecl: StandingsLeagueInfo | null;
}

export default function StandingsClient({ superLig, ecl }: StandingsClientProps) {
  const [activeTab, setActiveTab] = useState<'superlig' | 'ecl'>('superlig');

  // Fallback if one league is missing
  const currentLeague = activeTab === 'superlig' 
    ? (superLig || ecl) 
    : (ecl || superLig);

  const isLevel1 = currentLeague 
    ? (currentLeague.level === 1 || currentLeague.slug.includes('super') || currentLeague.name.toLowerCase().includes('süper'))
    : true;
  const isLevel2 = !isLevel1;

  const displayTeams = currentLeague?.teams ? currentLeague.teams.slice(0, 5) : [];

  return (
    <div className="space-y-4">
      {/* SECTION HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-[#00e5ff] rounded-full shadow-[0_0_12px_#00e5ff]" />
          <h2 className="text-[26px] sm:text-[28px] font-[900] tracking-wide text-white uppercase">
            PUAN <span className="text-[#00e5ff]">DURUMU</span>
          </h2>
        </div>
      </div>

      {/* CARD CONTAINER */}
      <div className="card-surface rounded-xl overflow-hidden border border-white/5 shadow-[0_0_30px_rgba(0,229,255,0.03)]">
        {/* CARD HEADER WITH TABS */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/5">
          <div className="flex items-center gap-1.5 bg-black/60 p-1 rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('superlig')}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-xs font-[900] tracking-widest uppercase transition-all ${
                activeTab === 'superlig'
                  ? 'bg-[#00e5ff] text-black shadow-[0_0_12px_rgba(0,229,255,0.4)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              SÜPERLİG
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ecl')}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-xs font-[900] tracking-widest uppercase transition-all ${
                activeTab === 'ecl'
                  ? 'bg-[#00e5ff] text-black shadow-[0_0_12px_rgba(0,229,255,0.4)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ECL
            </button>
          </div>

          {currentLeague?.seasonName && (
            <div className="text-[11px] font-[800] tracking-widest uppercase text-gray-500 hidden sm:block">
              {currentLeague.seasonName}
            </div>
          )}
        </div>

        {/* TABLE */}
        <div className="w-full overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-black/40 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5">
              <tr>
                <th className="px-3 sm:px-4 py-3.5 w-10 sm:w-12 text-center">#</th>
                <th className="px-3 py-3.5">TAKIM</th>
                <th className="px-3 py-3.5 text-center w-12 hidden sm:table-cell" title="Oynanan Maç">O</th>
                <th className="px-3 py-3.5 text-center w-12 hidden md:table-cell" title="Galibiyet">G</th>
                <th className="px-3 py-3.5 text-center w-12 hidden md:table-cell" title="Beraberlik">B</th>
                <th className="px-3 py-3.5 text-center w-12 hidden md:table-cell" title="Mağlubiyet">M</th>
                <th className="px-3 py-3.5 text-center w-14 hidden sm:table-cell" title="Averaj">AV</th>
                <th className="px-3 sm:px-4 py-3.5 text-center w-12 sm:w-14 font-black text-[#00e5ff]">P</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {displayTeams.map((row, index) => {
                const rank = index + 1;
                let rowBg = "hover:bg-white/5";
                let tdLeftBorder = "border-l-[3px] border-l-transparent";
                let rankBadge = "text-gray-400 font-bold";

                if (isLevel1) {
                  if (rank === 1 || rank === 2) { 
                    rowBg = "bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20"; 
                    tdLeftBorder = "border-l-[3px] border-l-[#3b82f6] shadow-[-2px_0_10px_rgba(59,130,246,0.3)]"; 
                    rankBadge = "text-[#3b82f6] font-black";
                  } else if (rank === 3 || rank === 4) { 
                    rowBg = "bg-[#eab308]/10 hover:bg-[#eab308]/20"; 
                    tdLeftBorder = "border-l-[3px] border-l-[#eab308] shadow-[-2px_0_10px_rgba(234,179,8,0.3)]"; 
                    rankBadge = "text-[#eab308] font-black";
                  }
                } else if (isLevel2) {
                  if (rank === 1) { 
                    rowBg = "bg-[#22c55e]/10 hover:bg-[#22c55e]/20"; 
                    tdLeftBorder = "border-l-[3px] border-l-[#22c55e] shadow-[-2px_0_10px_rgba(34,197,94,0.3)]"; 
                    rankBadge = "text-[#22c55e] font-black";
                  } else if (rank >= 2 && rank <= 5) { 
                    rowBg = "bg-[#eab308]/10 hover:bg-[#eab308]/20"; 
                    tdLeftBorder = "border-l-[3px] border-l-[#eab308] shadow-[-2px_0_10px_rgba(234,179,8,0.3)]"; 
                    rankBadge = "text-[#eab308] font-black";
                  }
                }

                return (
                  <tr key={row.team_id || index} className={`transition-colors group ${rowBg}`}>
                    <td className={`px-3 sm:px-4 py-3.5 text-center ${rankBadge} ${tdLeftBorder}`}>
                      {rank}
                    </td>
                    <td className="px-3 py-3.5 min-w-0">
                      <Link 
                        href={row.team_slug ? `/takim/${row.team_slug}` : '#'}
                        className="flex items-center gap-2.5 sm:gap-3 min-w-0 group/team hover:drop-shadow-[0_0_8px_rgba(0,229,255,0.4)] transition-all"
                      >
                        <div className="w-6 h-6 rounded-full bg-black/50 border border-white/10 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                          {row.team_logo_url ? (
                            <img src={row.team_logo_url} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[9px] font-black text-[#00e5ff]">
                              {row.team_name?.substring(0, 2).toUpperCase() || '??'}
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-xs sm:text-sm truncate text-white group-hover/team:text-[#00e5ff] transition-colors uppercase tracking-wider">
                          {row.team_name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3.5 text-center text-gray-300 font-medium hidden sm:table-cell">
                      {row.matches_played}
                    </td>
                    <td className="px-3 py-3.5 text-center text-emerald-400 font-medium hidden md:table-cell">
                      {row.wins}
                    </td>
                    <td className="px-3 py-3.5 text-center text-amber-400 font-medium hidden md:table-cell">
                      {row.draws}
                    </td>
                    <td className="px-3 py-3.5 text-center text-rose-400 font-medium hidden md:table-cell">
                      {row.losses}
                    </td>
                    <td className="px-3 py-3.5 text-center text-gray-300 font-medium hidden sm:table-cell">
                      {row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}
                    </td>
                    <td className="px-3 sm:px-4 py-3.5 text-center font-black text-sm sm:text-base text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.3)]">
                      {row.points}
                    </td>
                  </tr>
                );
              })}

              {displayTeams.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500 font-bold tracking-widest text-xs uppercase">
                    Bu lig için henüz puan durumu verisi bulunmuyor
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* CARD FOOTER WITH LEGEND & DIRECT LINK */}
        <div className="p-3.5 bg-black/40 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Legend */}
          {displayTeams.length > 0 ? (
            <div className="flex items-center gap-3 text-[10px] sm:text-[11px] font-[800] uppercase tracking-wider text-gray-400">
              {isLevel1 ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-[#3b82f6] shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
                    <span>Şampiyonlar Ligi</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-[#eab308] shadow-[0_0_6px_rgba(234,179,8,0.5)]" />
                    <span>Avrupa Ligi</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
                    <span>Lig Yükselme</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-[#eab308] shadow-[0_0_6px_rgba(234,179,8,0.5)]" />
                    <span>Play-Off</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div />
          )}

          {/* Direct link to league standings */}
          {currentLeague?.seasonSlug && currentLeague?.slug ? (
            <Link
              href={`/lig/${currentLeague.seasonSlug}/${currentLeague.slug}`}
              className="text-[12px] sm:text-[13px] font-[800] text-[#00e5ff] hover:text-white transition-colors tracking-widest uppercase flex items-center gap-1.5 group ml-auto"
            >
              <span>TÜM SIRALAMAYI GÖR</span>
              <span className="transform group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          ) : (
            <Link
              href="/ligler"
              className="text-[12px] sm:text-[13px] font-[800] text-[#00e5ff] hover:text-white transition-colors tracking-widest uppercase flex items-center gap-1.5 group ml-auto"
            >
              <span>TÜM SIRALAMAYI GÖR</span>
              <span className="transform group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
