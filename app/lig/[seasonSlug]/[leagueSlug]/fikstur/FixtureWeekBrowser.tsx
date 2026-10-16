'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';

export interface FixtureTeamView {
  name: string;
  slug: string | null;
  logo_url: string | null;
}

export interface FixtureView {
  id: string;
  week: number;
  dateLabel: string;
  timeLabel: string;
  fixtureStatus: string;
  home: FixtureTeamView | null;
  away: FixtureTeamView | null;
  approved: { id: string; homeScore: number; awayScore: number } | null;
  pendingReview: boolean;
}

interface FixtureWeekBrowserProps {
  fixtures: FixtureView[];
  initialWeek: number;
}

/**
 * Bir maçın tarih altı durum etiketi. "Planlandı" (varsayılan durum) etiketi gösterilmez;
 * yalnızca dikkat gerektiren durumlar gösterilir. Veritabanındaki durumlar değiştirilmez.
 */
function getStatusBadge(fixture: FixtureView): { label: string; className: string } | null {
  if (fixture.approved) {
    return { label: 'TAMAMLANDI', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' };
  }
  if (fixture.pendingReview) {
    return { label: 'ONAY BEKLİYOR', className: 'bg-amber-500/10 text-amber-400 border border-amber-500/30' };
  }
  if (fixture.fixtureStatus === 'POSTPONED') {
    return { label: 'ERTELENDİ', className: 'bg-orange-500/10 text-orange-400 border border-orange-500/30' };
  }
  if (fixture.fixtureStatus === 'CANCELLED') {
    return { label: 'İPTAL EDİLDİ', className: 'bg-red-500/10 text-red-400 border border-red-500/30' };
  }
  return null;
}

export default function FixtureWeekBrowser({ fixtures, initialWeek }: FixtureWeekBrowserProps) {
  const weeks = useMemo(
    () => Array.from(new Set(fixtures.map((f) => f.week))).sort((a, b) => a - b),
    [fixtures]
  );

  const [selectedWeek, setSelectedWeek] = useState<number>(
    weeks.includes(initialWeek) ? initialWeek : weeks[0]
  );

  const chipListRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Sunucudan gelen başlangıç haftası değişirse (örn. farklı ?hafta=N ile yönlendirme) seçimi eşitle.
  // (Efekt yerine, React'in önerdiği "render sırasında önceki prop ile karşılaştırma" deseni.)
  const [syncedInitialWeek, setSyncedInitialWeek] = useState(initialWeek);
  if (syncedInitialWeek !== initialWeek) {
    setSyncedInitialWeek(initialWeek);
    if (weeks.includes(initialWeek)) setSelectedWeek(initialWeek);
  }

  // URL'yi senkronla (paylaşılabilir ?hafta=N): replaceState geçmişe yeni kayıt eklemez ve
  // sunucu isteği yapmaz. Next.js App Router, replaceState'i yamalayarak useSearchParams'ı günceller;
  // bunun için state argümanı `null` verilmeli (Next'in iç history state'i yamaya bırakılır).
  const selectWeek = useCallback((week: number) => {
    setSelectedWeek(week);
    try {
      const params = new URLSearchParams(window.location.search);
      params.set('hafta', String(week));
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
    } catch {
      // URL güncellenemezse seçim yine de çalışır
    }
  }, []);

  // Seçili hafta düğmesini yatay kaydırmalı listede ortala (sayfayı dikeyde kaydırmadan).
  useEffect(() => {
    const list = chipListRef.current;
    const chip = chipRefs.current.get(selectedWeek);
    if (!list || !chip) return;
    const target = chip.offsetLeft - list.clientWidth / 2 + chip.clientWidth / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [selectedWeek]);

  const weekIndex = weeks.indexOf(selectedWeek);
  const prevWeek = weekIndex > 0 ? weeks[weekIndex - 1] : null;
  const nextWeek = weekIndex >= 0 && weekIndex < weeks.length - 1 ? weeks[weekIndex + 1] : null;

  const weekFixtures = useMemo(
    () => fixtures.filter((f) => f.week === selectedWeek),
    [fixtures, selectedWeek]
  );

  return (
    <div className="space-y-6">
      {/* Hafta seçici */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => prevWeek !== null && selectWeek(prevWeek)}
          disabled={prevWeek === null}
          aria-label="Önceki hafta"
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-[#00e5ff] hover:border-[#00e5ff]/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-300 disabled:hover:border-white/10"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div
          ref={chipListRef}
          role="group"
          aria-label="Hafta seçimi"
          className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto md:flex-wrap md:overflow-visible py-1 custom-scrollbar"
        >
          {weeks.map((week) => {
            const isActive = week === selectedWeek;
            return (
              <button
                key={week}
                type="button"
                aria-pressed={isActive}
                aria-label={`${week}. hafta`}
                ref={(el) => {
                  if (el) chipRefs.current.set(week, el);
                  else chipRefs.current.delete(week);
                }}
                onClick={() => selectWeek(week)}
                className={`shrink-0 min-w-[44px] h-10 px-3 rounded-lg border text-[13px] font-[900] tracking-wider transition-all ${
                  isActive
                    ? 'bg-[#00e5ff]/15 border-[#00e5ff] text-[#00e5ff] shadow-[0_0_12px_rgba(0,229,255,0.35)]'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-[#00e5ff]/40'
                }`}
              >
                {week}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => nextWeek !== null && selectWeek(nextWeek)}
          disabled={nextWeek === null}
          aria-label="Sonraki hafta"
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-[#00e5ff] hover:border-[#00e5ff]/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-300 disabled:hover:border-white/10"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Devre Arası (Mid-Season Break) Banner before Week 13 */}
      {selectedWeek === 13 && (
        <div className="client-glass border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-[#00e5ff]/5 to-transparent rounded-2xl p-5 md:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
          <div className="flex items-center gap-3.5">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)] animate-pulse" />
            <div>
              <h4 className="text-amber-400 text-sm md:text-base font-[900] tracking-wider uppercase">
                DEVRE ARASI & RESMİ TRANSFER DÖNEMİ
              </h4>
              <p className="text-xs text-gray-300 mt-1">
                1. Devre (1-12. Haftalar) tamamlandı. Takvim gereği 1 Pazartesi gecesi boş geçilir (Maç oynanmaz; transfer penceresi açıktır).
              </p>
            </div>
          </div>
          <span className="px-3.5 py-1.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-[900] uppercase tracking-widest border border-amber-500/30 shrink-0">
            1 HAFTA ARA
          </span>
        </div>
      )}

      <div className="client-glass border border-white/5 rounded-2xl overflow-hidden">
        {/* Week Header */}
        <div className="bg-black/60 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.8)]" />
            <h3 className="text-[#00E5FF] text-[18px] md:text-[20px] font-[900] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)] tracking-widest uppercase">
              {selectedWeek}. HAFTA
            </h3>
          </div>
        </div>

        {/* Match Rows in this Week */}
        <div className="divide-y divide-white/5">
          {weekFixtures.map((fixture) => {
            const badge = getStatusBadge(fixture);
            const { home, away, approved } = fixture;

            return (
              <div
                key={fixture.id}
                className="p-4 md:p-6 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6"
              >
                {/* Date & Status */}
                <div className="w-full md:w-36 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center shrink-0">
                  <div className="flex items-center gap-1.5 text-[13px] font-[700] text-gray-400">
                    <Calendar className="w-3.5 h-3.5 text-[#00e5ff]" />
                    <span>{fixture.dateLabel}</span>
                    {fixture.timeLabel && (
                      <span className="text-white font-bold ml-1">{fixture.timeLabel}</span>
                    )}
                  </div>
                  {badge && (
                    <span
                      className={`text-[9px] font-black tracking-widest uppercase mt-1 px-2.5 py-0.5 rounded-md ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  )}
                </div>

                {/* Teams & Score Block */}
                <div className="flex-1 flex items-center justify-center gap-3 md:gap-6 w-full max-w-[700px]">
                  {/* Home Team */}
                  <Link
                    href={home?.slug ? `/takim/${home.slug}` : '#'}
                    className="flex-1 flex items-center justify-end gap-3 group min-w-0"
                  >
                    <span className="font-[800] text-white text-[14px] md:text-[18px] lg:text-[20px] tracking-wide text-right group-hover:text-[#00e5ff] transition-colors truncate">
                      {home?.name || 'Ev Sahibi'}
                    </span>
                    <TeamLogo src={home?.logo_url} name={home?.name} size="sm" />
                  </Link>

                  {/* Score / Status Center Block */}
                  <div className="shrink-0 flex items-center justify-center">
                    {approved ? (
                      <Link
                        href={`/mac/${approved.id}`}
                        className="px-3.5 py-1.5 bg-[#060d18] hover:bg-[#00e5ff]/10 border border-[#00e5ff]/30 hover:border-[#00e5ff] rounded-xl flex items-center justify-center transition-all group/score shadow-[0_0_12px_rgba(0,229,255,0.15)]"
                        title="Maç Raporunu Gör"
                      >
                        <span className="text-[18px] md:text-[24px] font-[900] tracking-wider text-white group-hover/score:text-[#00e5ff] transition-colors">
                          {approved.homeScore} - {approved.awayScore}
                        </span>
                      </Link>
                    ) : fixture.pendingReview ? (
                      <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <span className="text-[11px] font-[900] text-amber-400 tracking-wider">
                          ONAY BEKLİYOR
                        </span>
                      </div>
                    ) : (
                      <div className="w-14 h-9 bg-[#060d18] border border-white/10 rounded-xl flex items-center justify-center">
                        <span className="text-[12px] font-[900] text-gray-500 tracking-widest">
                          VS
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Away Team */}
                  <Link
                    href={away?.slug ? `/takim/${away.slug}` : '#'}
                    className="flex-1 flex items-center justify-start gap-3 group min-w-0"
                  >
                    <TeamLogo src={away?.logo_url} name={away?.name} size="sm" />
                    <span className="font-[800] text-white text-[14px] md:text-[18px] lg:text-[20px] tracking-wide text-left group-hover:text-[#00e5ff] transition-colors truncate">
                      {away?.name || 'Deplasman'}
                    </span>
                  </Link>
                </div>

                {/* Right Action */}
                <div className="shrink-0 w-full md:w-32 flex justify-end">
                  {approved ? (
                    <Link
                      href={`/mac/${approved.id}`}
                      className="w-full md:w-auto text-center px-4 py-2 bg-white/5 hover:bg-[#00e5ff]/10 text-gray-300 hover:text-[#00e5ff] border border-white/10 hover:border-[#00e5ff]/30 text-[11px] font-[800] uppercase tracking-wider rounded-xl transition-all"
                    >
                      MAÇ RAPORU
                    </Link>
                  ) : (
                    <span className="hidden md:block w-20" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
