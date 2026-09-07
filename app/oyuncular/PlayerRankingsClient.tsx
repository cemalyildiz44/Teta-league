"use client";

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export const PLATFORM_OPTIONS = [
  'PS5',
  'Xbox Series X',
  'Xbox Series S',
  'PC'
];

export const POSITION_OPTIONS = [
  'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'CF', 'LW', 'RW', 'ST'
];

export const STATUS_OPTIONS = [
  { value: 'FREE', label: 'SERBEST' },
  { value: 'CONTRACTED', label: 'SÖZLEŞMELİ' }
];

export type PlayerRanking = {
  id: string;
  username: string;
  avatarUrl: string | null;
  platform: string;
  position: string;
  status: string;
  wins: number;
  draws: number;
  losses: number;
  played: number;
};

export default function PlayerRankingsClient({ rankings }: { rankings: PlayerRanking[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState('TÜMÜ');
  const [positionFilter, setPositionFilter] = useState('TÜMÜ');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredRankings = useMemo(() => {
    return rankings.filter(player => {
      // 1. Search filter
      const matchesSearch = player.username.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // 2. Platform filter
      // Note: If DB stores something else, we use strict equality based on future expected DB values.
      if (platformFilter !== 'TÜMÜ' && player.platform !== platformFilter) return false;

      // 3. Position filter
      if (positionFilter !== 'TÜMÜ' && player.position !== positionFilter) return false;

      // 4. Status filter
      if (statusFilter !== 'ALL' && player.status !== statusFilter) return false;

      return true;
    });
  }, [rankings, searchTerm, platformFilter, positionFilter, statusFilter]);

  

  return (
    <div className="w-full">
      {/* Search & Filters */}
      <div className="mb-10 bg-black/40 border border-white/5 p-6 rounded-2xl client-glass shadow-[0_0_20px_rgba(0,0,0,0.5)] relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          
          {/* Search */}
          <div className="relative md:col-span-1 flex flex-col gap-1.5 group">
            <label className="text-[10px] font-[900] tracking-widest text-gray-500 uppercase ml-1">OYUNCU</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-focus-within:text-[#00e5ff] transition-colors">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
              <input
                type="text"
                placeholder="Oyuncu ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#03070c] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-[14px] font-[500] text-white placeholder-gray-500 focus:outline-none focus:border-[#00e5ff]/50 transition-all glow-cyan-sm"
              />
            </div>
          </div>

          {/* Platform Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-[900] tracking-widest text-gray-500 uppercase ml-1">PLATFORM</label>
            <div className="relative">
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[500] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-all appearance-none cursor-pointer"
              >
                <option value="TÜMÜ">TÜMÜ</option>
                {PLATFORM_OPTIONS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          {/* Position Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-[900] tracking-widest text-gray-500 uppercase ml-1">POZİSYON</label>
            <div className="relative">
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[500] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-all appearance-none cursor-pointer"
              >
                <option value="TÜMÜ">TÜMÜ</option>
                {POSITION_OPTIONS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-[900] tracking-widest text-gray-500 uppercase ml-1">DURUM</label>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[500] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-all appearance-none cursor-pointer"
              >
                <option value="ALL">TÜMÜ</option>
                {STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>
          
        </div>
      </div>

      {/* Table Section */}
      {rankings.length === 0 ? (
        <div className="client-glass max-w-3xl mx-auto rounded-3xl p-12 border border-white/5 text-center shadow-[0_0_30px_rgba(0,229,255,0.03)] relative overflow-hidden group mt-12">
          <div className="absolute inset-0 bg-gradient-to-b from-[#00e5ff]/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="empty-state !py-12 border-none bg-transparent relative z-10">
            <span className="text-6xl mb-6 block opacity-50 drop-shadow-[0_0_15px_rgba(0,229,255,0.3)]">👥</span>
            <span className="empty-state-title text-[24px]">Kayıtlı Oyuncu Bulunamadı</span>
            <span className="empty-state-desc text-[15px] max-w-md mx-auto leading-relaxed">
              Sisteme kayıtlı hiçbir oyuncu profili bulunmuyor.
            </span>
          </div>
        </div>
      ) : filteredRankings.length === 0 ? (
        <div className="client-glass max-w-3xl mx-auto rounded-3xl p-12 border border-white/5 text-center shadow-[0_0_30px_rgba(0,229,255,0.03)] relative overflow-hidden mt-12">
          <div className="empty-state !py-8 border-none bg-transparent relative z-10">
            <span className="text-4xl mb-4 block opacity-50">🔍</span>
            <span className="empty-state-title text-[20px]">Sonuç bulunamadı</span>
            <span className="empty-state-desc text-[14px]">Seçtiğiniz filtrelere uygun oyuncu bulunamadı.</span>
          </div>
        </div>
      ) : (
        <div className="client-glass rounded-2xl border border-white/5 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
              <thead>
                <tr className="bg-black/40 border-b border-white/5">
                  <th className="py-5 px-6 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center w-20">SIRA</th>
                  <th className="py-5 px-6 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase">OYUNCU</th>
                  <th className="py-5 px-4 text-[12px] font-[900] text-[#00e5ff] tracking-[0.2em] uppercase text-center w-20">G</th>
                  <th className="py-5 px-4 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center w-16">B</th>
                  <th className="py-5 px-4 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center w-16">M</th>
                  <th className="py-5 px-6 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center w-24">MAÇ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRankings.map((player, index) => {
                  const rank = index + 1;
                  
                  // Top 3 specific styles
                  let rankStyle = "text-gray-400";
                  let rowStyle = "hover:bg-white/5";
                  let winsStyle = "text-white";
                  
                  if (rank === 1) {
                    rankStyle = "text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.8)] font-[900]";
                    rowStyle = "bg-[#00e5ff]/[0.03] border-l-4 border-l-[#00e5ff] hover:bg-[#00e5ff]/[0.06]";
                    winsStyle = "text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.8)] font-[900]";
                  } else if (rank === 2) {
                    rankStyle = "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] font-[900]";
                    rowStyle = "bg-white/[0.02] border-l-4 border-l-gray-400 hover:bg-white/[0.04]";
                    winsStyle = "text-[#00e5ff] drop-shadow-[0_0_5px_rgba(0,229,255,0.5)] font-[900]";
                  } else if (rank === 3) {
                    rankStyle = "text-orange-300 drop-shadow-[0_0_5px_rgba(253,186,116,0.3)] font-[900]";
                    rowStyle = "bg-orange-500/[0.015] border-l-4 border-l-orange-900/50 hover:bg-orange-500/[0.03]";
                    winsStyle = "text-[#00e5ff] drop-shadow-[0_0_5px_rgba(0,229,255,0.3)] font-[900]";
                  }
                  
                  return (
                    <tr key={player.id} className={`transition-colors duration-300 group ${rowStyle}`}>
                      {/* RANK */}
                      <td className="py-4 px-6 text-center">
                        <span className={`text-[16px] font-[800] ${rankStyle}`}>
                          {rank < 10 ? `0${rank}` : rank}
                        </span>
                      </td>
                      
                      {/* PLAYER INFO */}
                      <td className="py-4 px-6">
                        <Link 
                          href={`/oyuncular/${player.username}`}
                          className="flex items-center gap-4 group-hover:drop-shadow-[0_0_10px_rgba(0,229,255,0.3)] transition-all"
                        >
                          <div className="w-10 h-10 shrink-0 rounded-full bg-black border border-white/10 p-[2px] flex items-center justify-center overflow-hidden relative">
                            {player.avatarUrl ? (
                              <img src={player.avatarUrl} alt={player.username} className="w-full h-full object-cover rounded-full" />
                            ) : (
                              <span className="text-[14px] font-bold text-gray-500">
                                {player.username.substring(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[15px] font-[800] text-white group-hover:text-[#00e5ff] transition-colors min-w-0 break-words whitespace-normal leading-tight">
                              {player.username}
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="data-label !text-[9px] !px-1.5">{player.position ? player.position.toUpperCase() : 'BİLİNMİYOR'}</span>
                              <span className="text-[10px] text-gray-500 font-medium">{player.platform || 'Bilinmiyor'}</span>
                              <span className="text-[10px] text-gray-600 font-medium">{player.status === 'CONTRACTED' ? 'SÖZLEŞMELİ' : 'SERBEST'}</span>
                            </div>
                          </div>
                        </Link>
                      </td>
                      
                      {/* WINS */}
                      <td className="py-4 px-4 text-center">
                        <span className={`text-[18px] font-[900] ${winsStyle}`}>
                          {player.wins}
                        </span>
                      </td>
                      
                      {/* DRAWS */}
                      <td className="py-4 px-4 text-center">
                        <span className="text-[14px] font-[700] text-gray-400">{player.draws}</span>
                      </td>
                      
                      {/* LOSSES */}
                      <td className="py-4 px-4 text-center">
                        <span className="text-[14px] font-[700] text-gray-500">{player.losses}</span>
                      </td>
                      
                      {/* TOTAL MATCHES */}
                      <td className="py-4 px-6 text-center">
                        <span className="text-[15px] font-[800] text-white">
                          {player.played}
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
