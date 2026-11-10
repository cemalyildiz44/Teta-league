'use client';

import { useState } from 'react';
import type { LockedTotwWeek, PostTheme } from '@/lib/social-posts/data';

export interface WeeklyPostLeague {
  id: string;
  name: string;
  theme: PostTheme;
  suggestedWeek: number;
  totwWeeks: LockedTotwWeek[];
}

const MAX_WEEK = 60;

function imageUrl(params: Record<string, string | number>) {
  return `/admin/paylasim/gorsel?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
}

function WeekInput({ value, onChange, id }: { value: number; onChange: (week: number) => void; id: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
      Hafta
      <input
        id={id}
        type="number"
        min={1}
        max={MAX_WEEK}
        value={value}
        onChange={(e) => onChange(Math.min(MAX_WEEK, Math.max(1, Number(e.target.value) || 1)))}
        className="w-20 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold text-white focus:border-[#00e5ff] focus:outline-none"
      />
    </label>
  );
}

function PostPreview({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {loaded !== src && <div className="absolute inset-0 animate-pulse bg-white/5" aria-hidden="true" />}
        {/* eslint-disable-next-line @next/next/no-img-element -- generated on demand by the admin image route */}
        <img src={src} alt={title} onLoad={() => setLoaded(src)} className="relative h-full w-full object-contain" />
      </div>
      <a
        href={`${src}&indir=1`}
        download
        className="flex min-h-[44px] items-center justify-center rounded-xl bg-[#00e5ff] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[#050a0f] transition-colors hover:bg-[#7fffd4]"
      >
        PNG indir (2160×2700)
      </a>
    </div>
  );
}

function LeaguePosts({ league }: { league: WeeklyPostLeague }) {
  const [standingsWeek, setStandingsWeek] = useState(league.suggestedWeek);
  const [totwId, setTotwId] = useState(league.totwWeeks[0]?.id ?? '');
  const selectedTotw = league.totwWeeks.find((w) => w.id === totwId);
  const [totwWeek, setTotwWeek] = useState(league.totwWeeks[0]?.weekNumber ?? 1);
  const accent = league.theme === 'superlig' ? 'text-[#5a8fff]' : 'text-[#ff4545]';

  return (
    <section className="rounded-2xl border border-white/5 bg-[#0a1628] p-5 sm:p-6">
      <h2 className={`mb-5 text-lg font-black uppercase tracking-wider ${accent}`}>{league.name}</h2>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Puan Durumu</h3>
            <WeekInput id={`puan-${league.id}`} value={standingsWeek} onChange={setStandingsWeek} />
          </div>
          <PostPreview
            title={`${league.name} puan durumu`}
            src={imageUrl({ tur: 'puan', lig: league.id, hafta: standingsWeek })}
          />
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Haftanın Takımı</h3>
            {league.totwWeeks.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  aria-label="Kilitli TOTW haftası"
                  value={totwId}
                  onChange={(e) => {
                    setTotwId(e.target.value);
                    const week = league.totwWeeks.find((w) => w.id === e.target.value);
                    if (week) setTotwWeek(Math.min(MAX_WEEK, week.weekNumber));
                  }}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold text-white focus:border-[#00e5ff] focus:outline-none"
                >
                  {league.totwWeeks.map((w) => (
                    <option key={w.id} value={w.id}>
                      TOTW #{w.weekNumber}
                    </option>
                  ))}
                </select>
                <WeekInput id={`totw-${league.id}`} value={totwWeek} onChange={setTotwWeek} />
              </div>
            )}
          </div>
          {selectedTotw ? (
            <>
              {selectedTotw.formation !== '3-5-2' && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300">
                  Bu hafta {selectedTotw.formation} dizilişiyle kaydedilmiş; tasarım 3-5-2 için. Oyuncular sırayla kartlara yerleşir.
                </p>
              )}
              <PostPreview
                title={`${league.name} haftanın takımı`}
                src={imageUrl({ tur: 'totw', lig: league.id, hafta: totwWeek, totw: selectedTotw.id })}
              />
            </>
          ) : (
            <p className="rounded-xl border border-white/10 bg-black/20 p-6 text-sm text-gray-400">
              Bu lig için kilitlenmiş bir haftanın takımı yok. Önce TOTW sayfasından haftayı kaydedip kilitleyin.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function WeeklyPostsClient({ leagues }: { leagues: WeeklyPostLeague[] }) {
  if (leagues.length === 0) {
    return <p className="text-sm text-gray-400">Aktif sezonda lig bulunamadı.</p>;
  }
  return (
    <div className="space-y-8">
      {leagues.map((league) => (
        <LeaguePosts key={league.id} league={league} />
      ))}
    </div>
  );
}
