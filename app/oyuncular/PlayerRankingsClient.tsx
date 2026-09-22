"use client";

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatEuro } from '@/app/utils/marketValueCalculator';
import {
  PLATFORM_OPTIONS,
  POSITION_FILTER_OPTIONS,
  POSITION_OPTIONS,
  POSITION_ALIASES,
  getPositionLabel,
  matchesPositionSingle,
  matchesSecondaryPosition,
  formatPosition,
  formatPlatform
} from '@/app/utils/positions';

export {
  PLATFORM_OPTIONS,
  POSITION_FILTER_OPTIONS,
  POSITION_OPTIONS,
  POSITION_ALIASES,
  getPositionLabel,
  matchesPositionSingle,
  matchesSecondaryPosition,
  formatPosition,
  formatPlatform
};

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
  alternativePositions?: string[] | null;
  status: string;
  teamName?: string | null;
  isSuspended?: boolean;
  marketValue: number;
  wins?: number;
  draws?: number;
  losses?: number;
  played?: number;
};

function matchesPlatform(playerPlatform: string | null | undefined, filterValue: string): boolean {
  if (!filterValue || filterValue === 'TÜMÜ') return true;
  if (!playerPlatform) return false;

  const p = playerPlatform.toLowerCase().trim();
  const f = filterValue.toLowerCase().trim();

  // Eski/belirsiz kayıtlar (common-gen5, bilinmiyor vb.) spesifik platform filtrelerinde GÖRÜNMEZ
  if (p === 'common-gen5' || p === 'common_gen5' || p === 'bilinmiyor' || p === 'belirtilmedi') {
    return false;
  }

  // Birebir tam eşleşme (örn: 'ps5' === 'ps5', 'pc' === 'pc', 'xbox series x' === 'xbox series x', 'xbox series s' === 'xbox series s')
  return p === f;
}

export default function PlayerRankingsClient({ rankings }: { rankings: PlayerRanking[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState('TÜMÜ');
  const [positionFilter, setPositionFilter] = useState('TÜMÜ');
  const [secondaryPositionFilters, setSecondaryPositionFilters] = useState<string[]>([]);
  const [isSecondaryDropdownOpen, setIsSecondaryDropdownOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const secondaryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (secondaryDropdownRef.current && !secondaryDropdownRef.current.contains(event.target as Node)) {
        setIsSecondaryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredRankings = useMemo(() => {
    return rankings.filter(player => {
      // 1. Search filter
      const matchesSearch = player.username.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // 2. Platform filter
      if (platformFilter !== 'TÜMÜ' && !matchesPlatform(player.platform, platformFilter)) return false;

      // 3. Primary Position filter
      if (positionFilter !== 'TÜMÜ' && !matchesPositionSingle(player.position, positionFilter)) return false;

      // 4. Secondary Position filter (Multi-select OR logic)
      if (secondaryPositionFilters.length > 0 && !matchesSecondaryPosition(player.alternativePositions, secondaryPositionFilters)) return false;

      // 5. Status filter
      if (statusFilter !== 'ALL' && player.status !== statusFilter) return false;

      return true;
    }).sort((a, b) => {
      if (b.marketValue !== a.marketValue) {
        return b.marketValue - a.marketValue;
      }
      return a.username.localeCompare(b.username, 'tr', { sensitivity: 'base' });
    });
  }, [rankings, searchTerm, platformFilter, positionFilter, secondaryPositionFilters, statusFilter]);

  

  return (
    <div className="w-full">
      {/* Search & Filters */}
      <div className="mb-10 bg-black/40 border border-white/5 p-6 rounded-2xl client-glass shadow-[0_0_20px_rgba(0,0,0,0.5)] relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-5">
          
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-1 flex flex-col gap-1.5 group">
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

          {/* Position (Primary) Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-[900] tracking-widest text-gray-500 uppercase ml-1">ANA POZİSYON</label>
            <div className="relative">
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[500] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-all appearance-none cursor-pointer"
              >
                <option value="TÜMÜ">TÜMÜ</option>
                {POSITION_FILTER_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          {/* Secondary Position Multi-Select Filter */}
          <div className="flex flex-col gap-1.5 relative" ref={secondaryDropdownRef}>
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] font-[900] tracking-widest text-gray-500 uppercase">
                YAN POZİSYON {secondaryPositionFilters.length > 0 && `(${secondaryPositionFilters.length})`}
              </label>
              {secondaryPositionFilters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSecondaryPositionFilters([])}
                  className="text-[10px] font-[700] text-gray-500 hover:text-white transition-colors uppercase tracking-wider"
                >
                  Temizle
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsSecondaryDropdownOpen(prev => !prev)}
              className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[500] text-left text-white focus:outline-none focus:border-[#00e5ff]/50 transition-all flex items-center justify-between cursor-pointer"
            >
              <span className={secondaryPositionFilters.length === 0 ? "text-gray-400" : "text-white font-[600] truncate mr-2"}>
                {secondaryPositionFilters.length === 0 ? "TÜMÜ" : secondaryPositionFilters.join(', ')}
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-gray-400 transition-transform shrink-0 ${isSecondaryDropdownOpen ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {/* Dropdown Menu */}
            {isSecondaryDropdownOpen && (
              <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-[#03070c] border border-white/10 rounded-xl shadow-2xl p-2 z-50 max-h-60 overflow-y-auto backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => {
                    setSecondaryPositionFilters([]);
                    setIsSecondaryDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[12px] font-[700] rounded-lg transition-colors text-left cursor-pointer ${
                    secondaryPositionFilters.length === 0 ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span>TÜMÜ (Temizle)</span>
                  {secondaryPositionFilters.length === 0 && <span>✓</span>}
                </button>
                <div className="h-[1px] bg-white/5 my-1.5" />
                {POSITION_FILTER_OPTIONS.map(p => {
                  const isChecked = secondaryPositionFilters.includes(p.value);
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => {
                        setSecondaryPositionFilters(prev =>
                          isChecked ? prev.filter(v => v !== p.value) : [...prev, p.value]
                        );
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg hover:bg-white/5 transition-colors text-left cursor-pointer"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isChecked ? 'bg-white/20 border-white/60 text-white font-black text-[10px]' : 'border-white/20 bg-black/40'
                      }`}>
                        {isChecked ? '✓' : ''}
                      </div>
                      <span className={`text-[12px] ${isChecked ? 'text-white font-[700]' : 'text-gray-400 font-medium'}`}>
                        {p.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected Chips */}
            {secondaryPositionFilters.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {secondaryPositionFilters.map(pos => (
                  <span
                    key={pos}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 text-gray-300 rounded text-[10px] font-bold"
                  >
                    <span>{pos}</span>
                    <button
                      type="button"
                      onClick={() => setSecondaryPositionFilters(prev => prev.filter(v => v !== pos))}
                      className="text-gray-400 hover:text-white transition-colors leading-none"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
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
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[500px]">
              <thead>
                <tr className="bg-black/40 border-b border-white/5">
                  <th className="py-5 px-6 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center w-24">SIRA</th>
                  <th className="py-5 px-6 text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase">OYUNCU</th>
                  <th className="py-5 px-6 text-[12px] font-[900] text-[#00e5ff] tracking-[0.2em] uppercase text-right w-48 md:w-60">PİYASA DEĞERİ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRankings.map((player, index) => {
                  const rank = index + 1;
                  
                  // Top 3 specific styles
                  let rankStyle = "text-gray-400";
                  let rowStyle = "hover:bg-white/5";
                  let valueStyle = "text-gray-200 font-[800]";
                  
                  if (rank === 1) {
                    rankStyle = "text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.8)] font-[900]";
                    rowStyle = "bg-[#00e5ff]/[0.03] border-l-4 border-l-[#00e5ff] hover:bg-[#00e5ff]/[0.06]";
                    valueStyle = "text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.8)] font-[900]";
                  } else if (rank === 2) {
                    rankStyle = "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] font-[900]";
                    rowStyle = "bg-white/[0.02] border-l-4 border-l-gray-400 hover:bg-white/[0.04]";
                    valueStyle = "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] font-[900]";
                  } else if (rank === 3) {
                    rankStyle = "text-orange-300 drop-shadow-[0_0_5px_rgba(253,186,116,0.3)] font-[900]";
                    rowStyle = "bg-orange-500/[0.015] border-l-4 border-l-orange-900/50 hover:bg-orange-500/[0.03]";
                    valueStyle = "text-orange-300 drop-shadow-[0_0_5px_rgba(253,186,116,0.3)] font-[900]";
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
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-[800] text-white group-hover:text-[#00e5ff] transition-colors min-w-0 break-words whitespace-normal leading-tight">
                                {player.username}
                              </span>
                              {player.isSuspended && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-[900] tracking-widest bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase shrink-0">
                                  ASKIDA
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="data-label !text-[9px] !px-1.5">{formatPosition(player.position)}</span>
                              {player.alternativePositions && player.alternativePositions.length > 0 && (
                                <span
                                  className="text-[9px] font-semibold text-gray-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10"
                                  title={`Yan Pozisyonlar: ${player.alternativePositions.map(p => getPositionLabel(p)).join(', ')}`}
                                >
                                  YAN: {player.alternativePositions.join(', ')}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-500 font-medium">{formatPlatform(player.platform)}</span>
                              <span className="text-[10px] text-gray-600 font-medium">
                                {player.status === 'CONTRACTED'
                                  ? `SÖZLEŞMELİ${player.teamName ? ` • ${player.teamName}` : ''}`
                                  : 'SERBEST'}
                              </span>
                            </div>
                          </div>
                        </Link>
                      </td>
                      
                      {/* MARKET VALUE */}
                      <td className="py-4 px-6 text-right">
                        <span className={`text-[15px] md:text-[17px] tracking-wider ${valueStyle}`}>
                          {formatEuro(player.marketValue)}
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
