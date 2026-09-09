"use client";

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import TeamLogo from '@/components/TeamLogo';

export type TeamRanking = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  played: number;
};

export default function TeamRankingsClient({ rankings }: { rankings: TeamRanking[] }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRankings = rankings.filter(team => 
    team.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full">
      {/* Search Input */}
      <div className="mb-8 max-w-md mx-auto">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-focus-within:text-[#00e5ff] transition-colors">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <input
            type="text"
            placeholder="TAKIM ARA..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#060d18] border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-[15px] font-[500] text-white placeholder-gray-500 focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all glow-cyan-sm"
          />
        </div>
      </div>

      {/* Table Section */}
      {rankings.length === 0 ? (
        <div className="client-glass max-w-3xl mx-auto rounded-3xl p-12 border border-white/5 text-center shadow-[0_0_30px_rgba(0,229,255,0.03)] relative overflow-hidden group mt-12">
          <div className="absolute inset-0 bg-gradient-to-b from-[#00e5ff]/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="empty-state !py-12 border-none bg-transparent relative z-10">
            <span className="text-6xl mb-6 block opacity-50 drop-shadow-[0_0_15px_rgba(0,229,255,0.3)]">📊</span>
            <span className="empty-state-title text-[24px]">Kayıt Yok</span>
            <span className="empty-state-desc text-[15px] max-w-md mx-auto leading-relaxed">
              Henüz onaylanmış maç bulunmuyor.<br/>Maçlar oynandıkça tüm zamanlar sıralaması burada oluşacak.
            </span>
          </div>
        </div>
      ) : filteredRankings.length === 0 ? (
        <div className="client-glass max-w-3xl mx-auto rounded-3xl p-12 border border-white/5 text-center shadow-[0_0_30px_rgba(0,229,255,0.03)] relative overflow-hidden mt-12">
          <div className="empty-state !py-8 border-none bg-transparent relative z-10">
            <span className="text-4xl mb-4 block opacity-50">🔍</span>
            <span className="empty-state-title text-[20px]">Takım Bulunamadı</span>
            <span className="empty-state-desc text-[14px]">Arama kriterlerinize uygun takım eşleşmedi.</span>
          </div>
        </div>
      ) : (
        <div className="client-glass rounded-2xl border border-white/5 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
              <thead>
                <tr className="bg-black/40 border-b border-white/5">
                  <th className="py-5 px-6 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center w-20">SIRA</th>
                  <th className="py-5 px-6 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase">TAKIM</th>
                  <th className="py-5 px-4 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center w-16">G</th>
                  <th className="py-5 px-4 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center w-16">B</th>
                  <th className="py-5 px-4 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center w-16">M</th>
                  <th className="py-5 px-6 text-[12px] font-[900] text-[#00e5ff] tracking-[0.2em] uppercase text-center w-24">PUAN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRankings.map((team, index) => {
                  const rank = index + 1;
                  
                  // Top 3 specific styles
                  let rankStyle = "text-gray-400";
                  let rowStyle = "hover:bg-white/5";
                  let pointsStyle = "text-white";
                  
                  if (rank === 1) {
                    rankStyle = "text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.8)] font-[900]";
                    rowStyle = "bg-[#00e5ff]/[0.03] border-l-4 border-l-[#00e5ff] hover:bg-[#00e5ff]/[0.06]";
                    pointsStyle = "text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.8)] font-[900]";
                  } else if (rank === 2) {
                    rankStyle = "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] font-[900]";
                    rowStyle = "bg-white/[0.02] border-l-4 border-l-gray-400 hover:bg-white/[0.04]";
                    pointsStyle = "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] font-[900]";
                  } else if (rank === 3) {
                    rankStyle = "text-orange-300 drop-shadow-[0_0_5px_rgba(253,186,116,0.3)] font-[900]";
                    rowStyle = "bg-orange-500/[0.015] border-l-4 border-l-orange-900/50 hover:bg-orange-500/[0.03]";
                    pointsStyle = "text-orange-300 drop-shadow-[0_0_5px_rgba(253,186,116,0.3)] font-[900]";
                  }
                  
                  return (
                    <tr key={team.id} className={`transition-colors duration-300 group ${rowStyle}`}>
                      {/* RANK */}
                      <td className="py-4 px-6 text-center">
                        <span className={`text-[16px] font-[800] ${rankStyle}`}>
                          {rank < 10 ? `0${rank}` : rank}
                        </span>
                      </td>
                      
                      {/* TEAM INFO */}
                      <td className="py-4 px-6">
                        <Link 
                          href={`/takim/${team.slug}`}
                          className="flex items-center gap-4 group-hover:drop-shadow-[0_0_10px_rgba(0,229,255,0.3)] transition-all"
                        >
                          <TeamLogo src={team.logoUrl} name={team.name} size="lg" />
                          <span className="text-[15px] font-[800] text-white group-hover:text-[#00e5ff] transition-colors min-w-0 break-words whitespace-normal leading-tight">
                            {team.name}
                          </span>
                        </Link>
                      </td>
                      
                      {/* WINS */}
                      <td className="py-4 px-4 text-center">
                        <span className="text-[14px] font-[700] text-gray-300">{team.wins}</span>
                      </td>
                      
                      {/* DRAWS */}
                      <td className="py-4 px-4 text-center">
                        <span className="text-[14px] font-[700] text-gray-400">{team.draws}</span>
                      </td>
                      
                      {/* LOSSES */}
                      <td className="py-4 px-4 text-center">
                        <span className="text-[14px] font-[700] text-gray-500">{team.losses}</span>
                      </td>
                      
                      {/* TOTAL POINTS */}
                      <td className="py-4 px-6 text-center">
                        <span className={`text-[18px] font-[900] ${pointsStyle}`}>
                          {team.points}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
