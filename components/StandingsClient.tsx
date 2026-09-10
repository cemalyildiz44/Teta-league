'use client';

import { useState } from 'react';
import Link from 'next/link';
import TeamLogo from '@/components/TeamLogo';
import { getStandingsZone } from '@/lib/standingsZones';

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

  // Ana sayfa: ilk 5 takım
  const displayTeams = currentLeague?.teams ? currentLeague.teams.slice(0, 5) : [];

  const fullStandingsUrl = currentLeague?.seasonSlug && currentLeague?.slug
    ? `/lig/${currentLeague.seasonSlug}/${currentLeague.slug}`
    : '/ligler';

  return (
    <div className="space-y-4">
      {/* BAŞLIK VE TÜM SIRALAMAYI GÖR LİNKİ */}
      <div className="flex items-baseline justify-between pb-1">
        <h2 className="text-xl sm:text-2xl font-[800] tracking-wide text-white uppercase">
          PUAN <span className="text-[#00e5ff]">DURUMU</span>
        </h2>

        <Link
          href={fullStandingsUrl}
          className="text-xs font-bold text-zinc-400 hover:text-[#00e5ff] transition-colors tracking-wider uppercase inline-flex items-center gap-1 group"
        >
          <span>TÜM SIRALAMAYI GÖR</span>
          <span className="transform group-hover:translate-x-1 transition-transform">→</span>
        </Link>
      </div>

      {/* SADE TEXT LİG SEÇİCİ TABLARI */}
      <div className="flex items-center gap-6 border-b border-white/[0.08] text-xs font-bold uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setActiveTab('superlig')}
          className={`pb-2.5 transition-colors relative ${
            activeTab === 'superlig'
              ? 'text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          SÜPER LİG
          {activeTab === 'superlig' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00e5ff]" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ecl')}
          className={`pb-2.5 transition-colors relative ${
            activeTab === 'ecl'
              ? 'text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          ECL 1. LİG
          {activeTab === 'ecl' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00e5ff]" />
          )}
        </button>
      </div>

      {/* FLAT TABLO: DIŞ KUTU YOK, SAYFA ÜZERİNDE DOĞRUDAN LİSTE */}
      <div>
        {/* KOLON BAŞLIKLARI */}
        <div className="flex items-center justify-between px-2 py-2 border-b border-white/[0.08] text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
          <div className="flex items-center gap-3">
            <span className="w-5 text-center">#</span>
            <span className="pl-1">TAKIM</span>
          </div>
          <div className="flex items-center gap-6 pr-2 font-mono">
            <span className="w-8 text-center" title="Oynanan Maç">O</span>
            <span className="w-8 text-center text-zinc-400 font-bold" title="Puan">P</span>
          </div>
        </div>

        {/* SATIRLAR: İLK 5 TAKIM */}
        <div className="divide-y divide-white/[0.05]">
          {displayTeams.map((row, index) => {
            const rank = index + 1;
            const zone = getStandingsZone(rank, isLevel1);

            return (
              <div
                key={row.team_id || index}
                className="flex items-center justify-between px-2 h-14 sm:h-[58px] hover:bg-white/[0.02] transition-colors"
              >
                {/* SOL: SIRA + ZONE ÇİZGİSİ + LOGO + TAKIM ADI */}
                <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* SOL İNCE 2-3px ZONE INDICATOR */}
                    <span
                      className={`w-[3px] h-5 rounded-full shrink-0 ${zone.barClass}`}
                      title={zone.label}
                    />
                    <span className="w-5 text-center text-xs sm:text-sm font-bold text-zinc-400 font-mono">
                      {rank}
                    </span>
                  </div>

                  <Link
                    href={row.team_slug ? `/takim/${row.team_slug}` : '#'}
                    className="flex items-center gap-3 min-w-0 group"
                  >
                    <TeamLogo
                      src={row.team_logo_url}
                      name={row.team_name}
                      size="md"
                      className="w-9 h-9 sm:w-10 sm:h-10 shrink-0"
                    />
                    <span className="font-bold text-sm sm:text-[15px] text-white group-hover:text-[#00e5ff] transition-colors truncate tracking-wide uppercase">
                      {row.team_name}
                    </span>
                  </Link>
                </div>

                {/* SAĞ: OYNANAN (O) & PUAN (P) */}
                <div className="flex items-center gap-6 shrink-0 pr-2 font-mono">
                  <span className="w-8 text-center text-xs sm:text-sm font-medium text-zinc-500">
                    {row.matches_played}
                  </span>
                  <span className="w-8 text-center text-base sm:text-lg font-black text-[#00e5ff]">
                    {row.points}
                  </span>
                </div>
              </div>
            );
          })}

          {displayTeams.length === 0 && (
            <div className="py-8 text-center text-xs font-bold text-zinc-600 tracking-wider uppercase">
              Henüz puan durumu verisi bulunmuyor
            </div>
          )}
        </div>

        {/* ALT LEGEND: SADE VE KUTUSUZ TEK SATIR */}
        <div className="pt-3 pb-1 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-medium">
          <div className="flex flex-wrap items-center gap-4">
            {isLevel1 ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Şampiyonlar Ligi (1-2)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Avrupa Ligi (3-4)</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Lig Yükselme (1)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Play-Off (2-5)</span>
                </div>
              </>
            )}
          </div>

          {currentLeague?.seasonName && (
            <span className="text-zinc-600 hidden sm:inline font-mono">
              {currentLeague.seasonName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
