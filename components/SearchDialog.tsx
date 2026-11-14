'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamLogo from '@/components/TeamLogo';
import { avatarSrc } from '@/lib/avatar';
import type { SearchIndex } from '@/app/api/search-index/route';

// Site search: the index (players + teams) is fetched once on first open and filtered in the browser.
let indexPromise: Promise<SearchIndex> | null = null;
function loadIndex(): Promise<SearchIndex> {
  if (!indexPromise) {
    indexPromise = fetch('/api/search-index')
      .then((res) => {
        if (!res.ok) throw new Error('search index');
        return res.json() as Promise<SearchIndex>;
      })
      .catch((error) => {
        indexPromise = null; // allow a retry on the next open
        throw error;
      });
  }
  return indexPromise;
}

// Lower-case and fold Turkish letters so "izmir" finds "İZMİR" and "kirac" finds "KIRAÇ"
function fold(text: string) {
  return text
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[̀-ͯ]/g, '');
}

function rank(haystack: string, query: string) {
  const index = haystack.indexOf(query);
  if (index < 0) return -1;
  return index === 0 ? 0 : haystack[index - 1] === ' ' ? 1 : 2;
}

type Result =
  | { kind: 'team'; key: string; href: string; title: string; sub: string; logo: string | null }
  | { kind: 'player'; key: string; href: string; title: string; sub: string; avatar: string | null };

const LIMIT = 6;

export default function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setActive(0);
    setFailed(false);
    inputRef.current?.focus();
    loadIndex().then(setIndex).catch(() => setFailed(true));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus?.();
    };
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = fold(query.trim());
    if (!index || q.length === 0) return [];

    const teams = index.teams
      .map((team) => ({ team, score: rank(fold(team.n), q) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score || a.team.n.localeCompare(b.team.n, 'tr'))
      .slice(0, LIMIT)
      .map<Result>(({ team }) => ({
        kind: 'team',
        key: `t-${team.s}`,
        href: `/takim/${team.s}`,
        title: team.n,
        sub: 'Takım',
        logo: team.l,
      }));

    const players = index.players
      .map((player) => ({ player, score: rank(fold(player.u), q) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score || a.player.u.localeCompare(b.player.u, 'tr'))
      .slice(0, LIMIT)
      .map<Result>(({ player }) => ({
        kind: 'player',
        key: `p-${player.u}`,
        href: `/oyuncular/${encodeURIComponent(player.u)}`,
        title: player.u,
        sub: [player.p, player.t].filter(Boolean).join(' · ') || 'Oyuncu',
        avatar: player.a,
      }));

    return [...teams, ...players];
  }, [index, query]);

  if (!open) return null;

  const go = (result: Result | undefined) => {
    if (!result) return;
    onClose();
    router.push(result.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (results.length ? (i + results.length - 1) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[active]);
    }
  };

  const teamResults = results.filter((r) => r.kind === 'team');
  const playerResults = results.filter((r) => r.kind === 'player');
  const hasQuery = query.trim().length > 0;

  const renderRow = (result: Result) => {
    const position = results.indexOf(result);
    const selected = position === active;
    return (
      <li key={result.key} role="option" id={`search-opt-${position}`} aria-selected={selected}>
        <button
          type="button"
          onClick={() => go(result)}
          onMouseMove={() => setActive(position)}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
            selected ? 'bg-[#00e5ff]/10' : 'hover:bg-white/5'
          }`}
        >
          {result.kind === 'team' ? (
            <TeamLogo src={result.logo} name={result.title} className="w-8 h-8" />
          ) : result.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- tiny avatar already resized by avatarSrc
            <img src={avatarSrc(result.avatar, 64)} alt="" className="h-8 w-8 rounded-full object-cover bg-black" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-xs font-black text-[#00e5ff]">
              {result.title.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-black uppercase tracking-wide text-white">{result.title}</span>
            <span className="block truncate text-[11px] font-bold text-gray-500">{result.sub}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Arama"
        onKeyDown={onKeyDown}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#00e5ff]/20 bg-[#060d18] shadow-[0_0_50px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-3 border-b border-white/5 px-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="search-results"
            aria-activedescendant={results.length ? `search-opt-${active}` : undefined}
            placeholder="Oyuncu veya takım ara…"
            autoComplete="off"
            className="h-14 w-full bg-transparent text-[15px] font-bold text-white placeholder-gray-500 outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-black text-gray-500 sm:block">ESC</kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {failed ? (
            <p className="px-3 py-8 text-center text-sm font-bold text-gray-400">Arama şu an yüklenemedi. Biraz sonra tekrar deneyin.</p>
          ) : !index ? (
            <div className="space-y-2 p-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-white/5" />
                  <div className="h-3 w-40 animate-pulse rounded bg-white/5" />
                </div>
              ))}
            </div>
          ) : !hasQuery ? (
            <p className="px-3 py-8 text-center text-sm font-bold text-gray-500">Bir oyuncu ya da takım adı yazın.</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm font-bold text-gray-400">“{query.trim()}” için sonuç bulunamadı.</p>
          ) : (
            <ul id="search-results" role="listbox" aria-label="Arama sonuçları" className="space-y-1">
              {teamResults.length > 0 && (
                <li role="presentation" className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Takımlar</li>
              )}
              {teamResults.map(renderRow)}
              {playerResults.length > 0 && (
                <li role="presentation" className="px-3 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Oyuncular</li>
              )}
              {playerResults.map(renderRow)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
