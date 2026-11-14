'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

// Colours the matched part of a title (skipped if folding changed the text length)
function Highlight({ text, query }: { text: string; query: string }) {
  const folded = fold(text);
  const at = query && folded.length === text.length ? folded.indexOf(query) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-[#00e5ff]">{text.slice(at, at + query.length)}</span>
      {text.slice(at + query.length)}
    </>
  );
}

type Result =
  | { kind: 'team'; key: string; href: string; title: string; sub: string; logo: string | null }
  | { kind: 'player'; key: string; href: string; title: string; sub: string; avatar: string | null };

const LIMIT = 6;
const QUICK_LINKS = [
  { label: 'Ligler', href: '/ligler' },
  { label: 'Takımlar', href: '/takimlar' },
  { label: 'Oyuncular', href: '/oyuncular' },
  { label: 'Haberler', href: '/haberler' },
];

function playerResult(player: SearchIndex['players'][number]): Result {
  return {
    kind: 'player',
    key: `p-${player.u}`,
    href: `/oyuncular/${encodeURIComponent(player.u)}`,
    title: player.u,
    sub: [player.p, player.t].filter(Boolean).join(' · ') || 'Oyuncu',
    avatar: player.a,
  };
}

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

  const folded = fold(query.trim());
  const hasQuery = folded.length > 0;

  const results = useMemo<Result[]>(() => {
    if (!index) return [];
    if (!hasQuery) return [];

    const teams = index.teams
      .map((team) => ({ team, score: rank(fold(team.n), folded) }))
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
      .map((player) => ({ player, score: rank(fold(player.u), folded) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score || a.player.u.localeCompare(b.player.u, 'tr'))
      .slice(0, LIMIT)
      .map<Result>(({ player }) => playerResult(player));

    return [...teams, ...players];
  }, [index, folded, hasQuery]);

  if (!open) return null;

  const go = (href: string | undefined) => {
    if (!href) return;
    onClose();
    router.push(href);
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
      go(results[active]?.href);
    }
  };

  const teamResults = results.filter((r) => r.kind === 'team');
  const playerResults = results.filter((r) => r.kind === 'player');

  const renderRow = (result: Result) => {
    const position = results.indexOf(result);
    const selected = position === active;
    return (
      <li key={result.key} role="option" id={`search-opt-${position}`} aria-selected={selected}>
        <button
          type="button"
          onClick={() => go(result.href)}
          onMouseMove={() => setActive(position)}
          className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
            selected ? 'bg-[#00e5ff]/10' : 'hover:bg-white/5'
          }`}
        >
          {selected && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.8)]" aria-hidden="true" />}
          {result.kind === 'team' ? (
            <TeamLogo src={result.logo} name={result.title} className="w-9 h-9" />
          ) : result.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- tiny avatar already resized by avatarSrc
            <img src={avatarSrc(result.avatar, 72)} alt="" className="h-9 w-9 rounded-full object-cover bg-black ring-1 ring-white/10" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-sm font-black text-[#00e5ff] ring-1 ring-white/10">
              {result.title.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-black uppercase tracking-wide text-white">
              {hasQuery ? <Highlight text={result.title} query={folded} /> : result.title}
            </span>
            <span className="block truncate text-[11px] font-bold text-gray-500">{result.sub}</span>
          </span>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
              result.kind === 'team' ? 'border-amber-400/30 text-amber-300/80' : 'border-[#00e5ff]/30 text-[#00e5ff]/80'
            }`}
          >
            {result.kind === 'team' ? 'Takım' : 'Oyuncu'}
          </span>
        </button>
      </li>
    );
  };

  // Rendered into <body>: the header uses backdrop-filter, which would otherwise make this "fixed" overlay
  // cover only the header instead of the whole screen (and clicks outside would never reach it).
  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-black/70 px-4 pt-[10vh] backdrop-blur-md sm:pt-[14vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Arama"
        onKeyDown={onKeyDown}
        className="fade-in-up w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0b1628] to-[#060d18] shadow-[0_0_80px_rgba(0,229,255,0.08),0_30px_70px_rgba(0,0,0,0.65)]"
      >
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#00e5ff]/60 to-transparent" aria-hidden="true" />
        <div className="flex items-center gap-3 border-b border-white/5 px-5">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#00e5ff]" aria-hidden="true">
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
            className="h-16 w-full bg-transparent text-[17px] font-bold text-white placeholder-gray-500 outline-none"
          />
          <kbd className="hidden shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black text-gray-400 sm:block">ESC</kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {failed ? (
            <p className="px-3 py-10 text-center text-sm font-bold text-gray-400">Arama şu an yüklenemedi. Biraz sonra tekrar deneyin.</p>
          ) : !index ? (
            <div className="space-y-3 p-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-white/5" />
                  <div className="space-y-1.5">
                    <div className="h-3 w-40 animate-pulse rounded bg-white/5" />
                    <div className="h-2.5 w-24 animate-pulse rounded bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasQuery ? null : results.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-bold text-gray-300">“{query.trim()}” için sonuç bulunamadı.</p>
              <p className="mt-1 text-xs font-bold text-gray-500">Yazımı değiştirip tekrar deneyin.</p>
            </div>
          ) : (
            <ul id="search-results" role="listbox" aria-label="Arama sonuçları" className="space-y-1">
              {teamResults.length > 0 && (
                <li role="presentation" className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Takımlar</li>
              )}
              {teamResults.map(renderRow)}
              {hasQuery && playerResults.length > 0 && (
                <li role="presentation" className="px-3 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Oyuncular</li>
              )}
              {playerResults.map(renderRow)}
            </ul>
          )}

          {!hasQuery && index && !failed && (
            <div className="px-3 pb-3 pt-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Hızlı erişim</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_LINKS.map((link) => (
                  <button
                    key={link.href}
                    type="button"
                    onClick={() => go(link.href)}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-gray-300 transition-colors hover:border-[#00e5ff]/40 hover:text-[#00e5ff]"
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
