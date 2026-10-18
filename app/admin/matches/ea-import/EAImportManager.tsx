'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, FileCheck2, AlertTriangle, ChevronDown, ChevronUp, Search, Check } from 'lucide-react';
import { getReviewMatchAction, previewJsonMatchesAction, sendMatchToReviewAction } from './json-actions';
import { assignPlayerStatsProfileAction, searchProfilesAction, updateMatchScoreAction, updatePlayerStatsAction } from '../actions';

/* eslint-disable @typescript-eslint/no-explicit-any */

const input = 'bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 outline-none';
const small = 'bg-[#060d18] border border-white/10 rounded px-1.5 py-1 text-white text-[11px] outline-none focus:border-cyan-500/50';
const btn = 'px-4 py-2 rounded-lg text-xs font-black transition-colors disabled:opacity-40';
const mini = 'px-2 py-1 rounded text-[10px] font-bold transition-colors disabled:opacity-40';

// Status of each match is derived from the stored match records on the server (never from browser state).
const DELIVERY: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Taslak', cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
  SENT: { label: 'Onaya Gönderildi', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  APPROVED: { label: 'Onaylandı', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  REJECTED: { label: 'Reddedildi', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
};
type Feedback = { type: 'ok' | 'err'; text: string } | null;
type StoredSummary = { status: string; homeScore: number | null; awayScore: number | null; players: number; linked: number };

function Note({ fb }: { fb: Feedback }) {
  if (!fb) return null;
  return (
    <p role={fb.type === 'err' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-xs ${fb.type === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
      {fb.text}
    </p>
  );
}

function MatchBadge({ status, username, suggestion }: { status: 'LINKED' | 'TO_LINK' | 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS'; username?: string | null; suggestion?: string | null }) {
  if (status === 'LINKED') return <span className='font-bold text-emerald-400' data-testid='match-state' data-state='LINKED'>✓ @{username}</span>;
  if (status === 'TO_LINK') return <span className='font-bold text-emerald-400' data-testid='match-state' data-state='TO_LINK'>✓ Bağlanacak: @{suggestion}</span>;
  if (status === 'MATCHED') return <span className='text-cyan-300' data-testid='match-state' data-state='MATCHED'>Öneri: @{suggestion}</span>;
  if (status === 'AMBIGUOUS') return <span className='font-bold text-amber-400' data-testid='match-state' data-state='AMBIGUOUS'>⚠ Belirsiz</span>;
  return <span className='font-bold text-amber-400' data-testid='match-state' data-state='UNMATCHED'>⚠ Eşleşmedi</span>;
}

const StatHead = () => (
  <thead>
    <tr className='text-left text-zinc-500'>
      <th className='pr-2 font-bold'>Oyuncu</th>
      <th className='pr-2 font-bold'>Poz</th>
      <th className='pr-1 text-right font-bold'>Puan</th>
      <th className='pr-1 text-right font-bold'>G</th>
      <th className='pr-1 text-right font-bold'>A</th>
      <th className='pr-2 text-right font-bold'>Şut</th>
      <th className='font-bold'>Eşleşme</th>
    </tr>
  </thead>
);

function SideHeader({ title, count, side }: { title: string; count: number; side: 'home' | 'away' }) {
  const ok = count === 11;
  return (
    <p className='mb-1 text-xs font-black uppercase tracking-wide text-cyan-400'>
      {side === 'home' ? 'Ev sahibi · ' : 'Deplasman · '}
      {title}{' '}
      <span className={`ml-1 normal-case font-bold ${ok ? 'text-zinc-400' : 'text-amber-400'}`} data-testid='player-count'>
        {count} oyuncu{ok ? '' : ' (11 değil: eksik/fazla oyuncu)'}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------- draft (file content, nothing stored yet)
function DraftPanel({ m, onToggleLink, onToggleOow, onSend, onDelete, busy }: { m: any; onToggleLink: (eaPlayerId: string, profileId: string) => void; onToggleOow: () => void; onSend: () => void; onDelete: () => void; busy: string | null }) {
  const undecided = m.outOfWindow && !m.outOfWindowAccepted;
  const canSend = m.errors.length === 0 && !undecided && !!m.sendHash;
  const side = (s: 'home' | 'away', title: string) => {
    const players = m.players.filter((p: any) => p.side === s);
    return (
      <div className='min-w-0 flex-1' data-testid={`side-${s}`}>
        <SideHeader title={title} count={players.length} side={s} />
        <table className='w-full text-[11px]'>
          <StatHead />
          <tbody>
            {players.map((p: any) => {
              const st = p.linkedProfileId ? 'TO_LINK' : p.suggestion.status;
              return (
                <tr key={p.eaPlayerId} className='border-t border-white/5' data-testid='player-row' data-state={st} title={p.suggestion.warning ?? ''}>
                  <td className='max-w-[9rem] truncate py-1 pr-2 text-white'>{p.stats.mom ? '⭐ ' : ''}{p.eaPlayerName ?? '—'}</td>
                  <td className='pr-2 text-zinc-400'>{p.stats.position ?? '–'}</td>
                  <td className='pr-1 text-right tabular-nums'>{p.stats.rating === null ? '–' : p.stats.rating.toFixed(1)}</td>
                  <td className='pr-1 text-right tabular-nums'>{p.stats.goals}</td>
                  <td className='pr-1 text-right tabular-nums'>{p.stats.assists}</td>
                  <td className='pr-2 text-right tabular-nums'>{p.stats.shots}</td>
                  <td>
                    <MatchBadge status={st} suggestion={p.suggestion.username} />
                    {p.suggestion.status === 'MATCHED' && p.suggestion.profileId && (
                      <label className='ml-2 inline-flex items-center gap-1 text-zinc-300'>
                        <input type='checkbox' checked={!!p.linkedProfileId} onChange={() => onToggleLink(p.eaPlayerId, p.suggestion.profileId)} data-match={m.eaMatchId} />
                        öneriyi kabul et
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <div className='mt-4 space-y-3 border-t border-white/5 pt-4' data-testid='review-panel' data-kind='draft'>
      {m.errors.map((e: any, i: number) => (
        <p key={i} className='flex items-start gap-1 text-xs text-red-300'><AlertTriangle className='mt-0.5 h-3 w-3 shrink-0' /><span><b>{e.code}</b> — {e.message}</span></p>
      ))}
      {m.warnings.map((w: any, i: number) => (
        <p key={i} className='text-xs text-amber-300'>{w.message}</p>
      ))}
      <p className='rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400'>
        Taslak, doğrulanmış dosya içeriğidir ve değiştirilemez. Yalnızca sunucunun kesin önerilerini kabul edebilirsiniz; eşleşmeyen/belirsiz oyuncular için profil araması, skor ve istatistik düzenleme maç onaya gönderildikten sonra bu panelde açılır.
      </p>
      <div className='flex flex-col gap-4 lg:flex-row'>
        {side('home', m.homeName)}
        {side('away', m.awayName)}
      </div>
      {m.outOfWindow && (
        <label className='flex items-center gap-2 text-xs'>
          <input type='checkbox' checked={m.outOfWindowAccepted} onChange={onToggleOow} />
          Zaman aralığı dışında olduğunu biliyorum; yine de gönder
        </label>
      )}
      <div className='flex flex-wrap gap-2'>
        <button type='button' className={`${btn} bg-emerald-500 text-black hover:bg-emerald-400`} disabled={!canSend || busy !== null} onClick={onSend}>
          {busy === m.eaMatchId ? <Loader2 className='inline h-3 w-3 animate-spin' /> : null} Onaya Gönder
        </button>
        <button type='button' className={`${btn} border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20`} disabled={busy !== null} title='Taslağı bu görünümden kaldırır; veritabanında kayıt olmadığından hiçbir kayıt silinmez' onClick={onDelete}>
          Sil
        </button>
        <span className='self-center text-[11px] text-zinc-500'>Onaya Gönder maçı yalnızca PENDING_REVIEW yapar; nihai onay Maç Onay ekranındadır.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- stored match (sent / reviewed): edits go through the existing admin actions
const EDIT_FIELDS: [string, string][] = [['goals', 'G'], ['assists', 'A'], ['shots', 'Şut'], ['passes_made', 'Pas'], ['pass_attempts', 'Pas den.']];
const INT_FIELDS = ['goals', 'assists', 'shots', 'passes_made', 'pass_attempts', 'tackles_made', 'tackle_attempts', 'saves', 'goals_conceded', 'cleansheets_gk', 'cleansheets_def', 'red_cards'];

function PlayerSearch({ row, onSaved, setFb }: { row: any; onSaved: () => void; setFb: (f: Feedback) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [picked, setPicked] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    setBusy(true);
    const res: any = await searchProfilesAction(q);
    setBusy(false);
    if (res.error) return setFb({ type: 'err', text: res.error });
    setResults(res.data);
  };
  const save = async () => {
    if (!picked) return;
    setBusy(true);
    const res: any = await assignPlayerStatsProfileAction(row.id, picked.id, 'EA JSON inceleme paneli');
    setBusy(false);
    if (res.error) return setFb({ type: 'err', text: res.error });
    setFb({ type: 'ok', text: res.success });
    onSaved();
  };
  return (
    <div className='mt-1 space-y-1 rounded border border-white/10 bg-[#060d18] p-2' data-testid='profile-search'>
      <div className='flex gap-1'>
        <input
          aria-label='Profil ara'
          className={`${small} flex-1`}
          placeholder='Kullanıcı adı veya ad (en az 2 harf)'
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }}
        />
        <button type='button' className={`${mini} bg-white/10 text-white hover:bg-white/20`} disabled={busy || q.trim().length < 2} onClick={search}>
          <Search className='inline h-3 w-3' /> Ara
        </button>
      </div>
      {results && (
        <ul className='max-h-32 overflow-y-auto' data-testid='profile-results'>
          {results.length === 0 && <li className='text-zinc-500'>Sonuç yok.</li>}
          {results.map((p) => (
            <li key={p.id}>
              <button type='button' className={`w-full rounded px-1 py-0.5 text-left hover:bg-white/10 ${picked?.id === p.id ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-200'}`} onClick={() => setPicked(p)}>
                @{p.username}{p.full_name ? ` · ${p.full_name}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <div className='flex items-center gap-2'>
          <span className='text-zinc-300' data-testid='picked-profile'>Seçilen: <b className='text-white'>@{picked.username}</b></span>
          <button type='button' className={`${mini} bg-cyan-500 text-black hover:bg-cyan-400`} disabled={busy} onClick={save}>
            <Check className='inline h-3 w-3' /> Profili Kaydet
          </button>
        </div>
      )}
    </div>
  );
}

function StatsEditor({ row, onSaved, onCancel, setFb }: { row: any; onSaved: () => void; onCancel: () => void; setFb: (f: Feedback) => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields: Record<string, unknown> = {};
    for (const k of INT_FIELDS) fields[k] = fd.has(k) ? Number(fd.get(k)) : row[k] ?? 0; // fields not shown keep their stored value
    const ratingRaw = String(fd.get('rating') ?? '').trim();
    fields.rating = ratingRaw === '' ? null : Number(ratingRaw);
    fields.is_mom = !!row.is_mom;
    setBusy(true);
    const res: any = await updatePlayerStatsAction(row.id, fields);
    setBusy(false);
    if (res.error) return setFb({ type: 'err', text: res.error });
    setFb({ type: 'ok', text: res.success });
    onSaved();
  };
  return (
    <form onSubmit={submit} className='mt-1 flex flex-wrap items-end gap-1 rounded border border-white/10 bg-[#060d18] p-2' data-testid='stats-editor'>
      <label className='text-zinc-500'>Puan<input name='rating' type='number' step='0.01' min='0' max='10' defaultValue={row.rating ?? ''} className={`${small} block w-14`} /></label>
      {EDIT_FIELDS.map(([k, label]) => (
        <label key={k} className='text-zinc-500'>{label}<input name={k} type='number' min='0' max='1000' required defaultValue={row[k] ?? 0} className={`${small} block w-12`} /></label>
      ))}
      <button type='submit' className={`${mini} bg-cyan-500 text-black hover:bg-cyan-400`} disabled={busy}>İstatistiği Kaydet</button>
      <button type='button' className={`${mini} text-zinc-400 hover:text-white`} onClick={onCancel}>Vazgeç</button>
    </form>
  );
}

function StoredPanel({ m, recordId, onChanged }: { m: any; recordId: string; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [version, setVersion] = useState(0);
  const [fb, setFb] = useState<Feedback>(null);
  const [edit, setEdit] = useState<{ id: string; kind: 'profile' | 'stats' } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getReviewMatchAction(recordId).then((res: any) => { if (alive) setData(res); });
    return () => { alive = false; };
  }, [recordId, version]);

  const reload = () => { setEdit(null); setVersion((v) => v + 1); onChanged(); };

  if (!data) return <p className='mt-4 text-xs text-zinc-400'><Loader2 className='inline h-3 w-3 animate-spin' /> Maç kaydı yükleniyor…</p>;
  if (data.error) return <div className='mt-4'><Note fb={{ type: 'err', text: data.error }} /></div>;

  const { match, players } = data;
  const editable = match.status !== 'APPROVED';
  const saveScore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const res: any = await updateMatchScoreAction(match.id, Number(fd.get('home_score')), Number(fd.get('away_score')));
    setBusy(false);
    if (res.error) return setFb({ type: 'err', text: res.error });
    setFb({ type: 'ok', text: res.success });
    reload();
  };
  const sum = (s: string) => players.filter((p: any) => p.side === s).reduce((a: number, p: any) => a + (p.goals || 0), 0);

  const side = (s: 'home' | 'away', title: string) => {
    const list = players.filter((p: any) => p.side === s);
    return (
      <div className='min-w-0 flex-1' data-testid={`side-${s}`}>
        <SideHeader title={title} count={list.length} side={s} />
        <table className='w-full text-[11px]'>
          <StatHead />
          <tbody>
            {list.map((p: any) => {
              const st = p.player_id ? 'LINKED' : p.identifierStatus === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'UNMATCHED';
              const open = edit?.id === p.id;
              return (
                <tr key={p.id} className='border-t border-white/5 align-top' data-testid='player-row' data-state={st}>
                  <td className='max-w-[9rem] truncate py-1 pr-2 text-white'>{p.is_mom ? '⭐ ' : ''}{p.ea_player_name ?? '—'}</td>
                  <td className='py-1 pr-2 text-zinc-400'>{p.position ?? '–'}</td>
                  <td className='py-1 pr-1 text-right tabular-nums'>{p.rating === null ? '–' : Number(p.rating).toFixed(1)}</td>
                  <td className='py-1 pr-1 text-right tabular-nums'>{p.goals}</td>
                  <td className='py-1 pr-1 text-right tabular-nums'>{p.assists}</td>
                  <td className='py-1 pr-2 text-right tabular-nums'>{p.shots}</td>
                  <td className='py-1'>
                    <MatchBadge status={st} username={p.username} />
                    {editable && (
                      <span className='ml-2 inline-flex gap-1'>
                        <button type='button' className={`${mini} bg-white/5 text-zinc-300 hover:text-cyan-400`} onClick={() => setEdit(open && edit?.kind === 'profile' ? null : { id: p.id, kind: 'profile' })}>
                          {p.player_id ? 'Değiştir' : 'Profil Ara'}
                        </button>
                        <button type='button' className={`${mini} bg-white/5 text-zinc-300 hover:text-cyan-400`} onClick={() => setEdit(open && edit?.kind === 'stats' ? null : { id: p.id, kind: 'stats' })}>
                          Düzenle
                        </button>
                      </span>
                    )}
                    {open && edit?.kind === 'profile' && <PlayerSearch row={p} onSaved={reload} setFb={setFb} />}
                    {open && edit?.kind === 'stats' && <StatsEditor row={p} onSaved={reload} onCancel={() => setEdit(null)} setFb={setFb} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className='mt-4 space-y-3 border-t border-white/5 pt-4' data-testid='review-panel' data-kind='stored'>
      <Note fb={fb} />
      <div className='flex flex-wrap items-center gap-3 text-xs'>
        {editable ? (
          <form onSubmit={saveScore} className='flex items-center gap-2' data-testid='score-editor' key={`${match.home_score}-${match.away_score}`}>
            <span className='text-zinc-400'>Skor</span>
            <input aria-label='Ev sahibi skoru' name='home_score' type='number' min='0' required defaultValue={match.home_score ?? 0} className={`${small} w-14 text-center`} />
            <span>–</span>
            <input aria-label='Deplasman skoru' name='away_score' type='number' min='0' required defaultValue={match.away_score ?? 0} className={`${small} w-14 text-center`} />
            <button type='submit' className={`${mini} bg-cyan-500 text-black hover:bg-cyan-400`} disabled={busy}>Skoru Kaydet</button>
          </form>
        ) : (
          <span className='text-zinc-400'>Onaylanmış maç burada düzenlenemez; değişiklik için Maç Onay ekranını kullanın.</span>
        )}
        <span className={sum('home') === match.home_score && sum('away') === match.away_score ? 'text-emerald-400' : 'text-amber-400'} data-testid='goal-check'>
          Gol toplamları: {sum('home')} – {sum('away')} (skor {match.home_score} – {match.away_score})
        </span>
        <Link href='/admin/matches' className='ml-auto text-cyan-400 hover:underline'>Maç Onay ekranında aç (nihai onay)</Link>
      </div>
      <div className='flex flex-col gap-4 lg:flex-row'>
        {side('home', m.homeName)}
        {side('away', m.awayName)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page
export function EAImportManager({ seasons, leagues, weeksByLeague }: { seasons: any[]; leagues: any[]; weeksByLeague: Record<string, number[]> }) {
  const [seasonId, setSeasonId] = useState(seasons.find((s) => s.status === 'ACTIVE')?.id || seasons[0]?.id || '');
  const [leagueId, setLeagueId] = useState('');
  const [week, setWeek] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [oow, setOow] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<Map<string, { eaMatchId: string; eaPlayerId: string; profileId: string }>>(new Map());
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // deleted drafts (a draft is only the uploaded file; nothing is stored for it)
  const [preview, setPreview] = useState<any>(null);
  const [records, setRecords] = useState<Record<string, StoredSummary>>({});
  const [openId, setOpenId] = useState<string | null>(null); // one review panel at a time
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Feedback>(null);

  const availableLeagues = useMemo(() => leagues.filter((l) => l.season_id === seasonId), [leagues, seasonId]);
  const weeks = weeksByLeague[leagueId] ?? [];
  const plan = preview?.plans?.[0];

  const form = (o: Set<string>, l: Map<string, any>) => {
    const fd = new FormData();
    fd.set('seasonId', seasonId);
    fd.set('leagueId', leagueId);
    fd.set('week', week);
    if (file) fd.set('file', file);
    o.forEach((id) => fd.append('oow', id));
    fd.set('links', JSON.stringify([...l.values()]));
    return fd;
  };

  const run = async (o: Set<string> = oow, l: Map<string, any> = links, keepMsg = false) => {
    setBusy('preview');
    if (!keepMsg) setMsg(null);
    const res: any = await previewJsonMatchesAction(form(o, l));
    setBusy(null);
    if (res.error) {
      setPreview(null);
      return setMsg({ type: 'err', text: res.error });
    }
    setPreview(res.preview);
    setRecords(res.records ?? {});
  };

  const reset = () => {
    setPreview(null);
    setRecords({});
    setOow(new Set());
    setLinks(new Map());
    setHidden(new Set());
    setOpenId(null);
    setMsg(null);
  };
  const toggleOow = (id: string) => {
    const next = new Set(oow);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOow(next);
    void run(next, links);
  };
  const toggleLink = (eaMatchId: string, eaPlayerId: string, profileId: string) => {
    const key = `${eaMatchId}:${eaPlayerId}`;
    const next = new Map(links);
    if (next.has(key)) next.delete(key);
    else next.set(key, { eaMatchId, eaPlayerId, profileId });
    setLinks(next);
    void run(oow, next);
  };

  const send = async (m: any) => {
    setBusy(m.eaMatchId);
    const fd = form(oow, links);
    fd.set('eaMatchId', m.eaMatchId);
    fd.set('sendHash', m.sendHash ?? '');
    const res: any = await sendMatchToReviewAction(fd);
    setBusy(null);
    if (res.error) {
      setMsg({ type: 'err', text: res.error });
      return run(oow, links, true);
    }
    setMsg({ type: 'ok', text: `EA maçı #${m.eaMatchId} onaya gönderildi (PENDING_REVIEW). Diğer maçlar taslak olarak kaldı.` });
    await run(oow, links, true);
  };

  const visible = (plan?.matches ?? []).filter((m: any) => !hidden.has(m.eaMatchId));

  return (
    <div className='text-white space-y-6'>
      <div className='rounded-xl border border-white/5 bg-[#0a1628] p-6'>
        <h2 className='mb-4 text-xs font-black uppercase tracking-widest text-cyan-400'>Dosya ve hedef</h2>
        <div className='flex flex-wrap items-end gap-4'>
          <label className='block text-[10px] font-bold uppercase tracking-widest text-zinc-500'>
            Sezon
            <select aria-label='Sezon' className={`${input} mt-1 block`} value={seasonId} onChange={(e) => { setSeasonId(e.target.value); setLeagueId(''); setWeek(''); reset(); }}>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className='block text-[10px] font-bold uppercase tracking-widest text-zinc-500'>
            Lig
            <select aria-label='Lig' className={`${input} mt-1 block`} value={leagueId} onChange={(e) => { setLeagueId(e.target.value); setWeek(''); reset(); }}>
              <option value=''>Lig seçin…</option>
              {availableLeagues.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <label className='block text-[10px] font-bold uppercase tracking-widest text-zinc-500'>
            Hafta
            <select aria-label='Hafta' className={`${input} mt-1 block`} value={week} onChange={(e) => { setWeek(e.target.value); reset(); }} disabled={!leagueId}>
              <option value=''>Hafta seçin…</option>
              {weeks.map((w) => (
                <option key={w} value={w}>{w}. hafta</option>
              ))}
            </select>
          </label>
          <label className='block text-[10px] font-bold uppercase tracking-widest text-zinc-500'>
            JSON dosyası
            <input aria-label='JSON dosyası' type='file' accept='application/json,.json' className='mt-1 block text-sm text-zinc-300' onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} />
          </label>
          <button type='button' className={`${btn} bg-cyan-500 text-black hover:bg-cyan-400`} disabled={busy !== null || !leagueId || !week || !file} onClick={() => { setHidden(new Set()); void run(); }}>
            {busy === 'preview' ? <Loader2 className='inline h-4 w-4 animate-spin' /> : <FileCheck2 className='inline h-4 w-4' />} Doğrula ve Eşleştir
          </button>
        </div>
        <p className='mt-3 text-xs text-zinc-500'>
          Dosyanın şeması, checksum&apos;ı ve kimliği sunucuda doğrulanır; hedef sezon/lig/hafta seçiminizle karşılaştırılır. Takım, EA kulüp kimliği, fikstür güncelliği ve maç zamanı canlı kayıtlarla denetlenir. Doğrulama hiçbir şey yazmaz.
        </p>
        {msg && <div className='mt-3'><Note fb={msg} /></div>}
      </div>

      {plan && (
        <div className='space-y-3' data-testid='file-plan'>
          {preview.batchErrors.map((e: string, i: number) => (
            <p key={i} role='alert' className='rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300'>{e}</p>
          ))}
          {plan.rejections.map((r: string, i: number) => (
            <p key={i} role='alert' className='rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300'>{r}</p>
          ))}
          {plan.warnings.map((w: string, i: number) => (
            <p key={i} className='rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300'>{w}</p>
          ))}
          {plan.scope && (
            <p className='text-sm text-zinc-300' data-testid='plan-summary'>
              {plan.fileName} · {plan.scope.leagueName} · {plan.scope.weekNumber}. hafta · {visible.length} maç
            </p>
          )}

          {hidden.size > 0 && (
            <p className='rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400' data-testid='hidden-note'>
              {hidden.size} taslak bu görünümden kaldırıldı. Taslaklar veritabanında kayıtlı değildir; &ldquo;Doğrula ve Eşleştir&rdquo; ile ya da dosyayı yeniden seçerek geri getirebilirsiniz.
            </p>
          )}

          {visible.map((m: any) => {
            const d = DELIVERY[m.delivery];
            const rec: StoredSummary | undefined = m.recordId ? records[m.recordId] : undefined;
            const homeScore = rec ? rec.homeScore : m.homeScore;
            const awayScore = rec ? rec.awayScore : m.awayScore;
            const total = rec ? rec.players : m.players.length;
            const linked = rec ? rec.linked : m.players.filter((p: any) => p.linkedProfileId).length;
            const suggested = rec ? 0 : m.players.filter((p: any) => p.suggestion.status === 'MATCHED' && !p.linkedProfileId).length;
            const unclear = total - linked - suggested;
            const isOpen = openId === m.eaMatchId;
            const draftIssues = m.delivery === 'DRAFT' && (m.errors.length > 0 || (m.outOfWindow && !m.outOfWindowAccepted));
            return (
              <article key={m.eaMatchId} className={`rounded-xl border bg-[#0a1628] p-4 ${isOpen ? 'border-cyan-500/40' : 'border-white/5'}`} data-testid='match-card' data-delivery={m.delivery}>
                <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-black ${d.cls}`} data-testid='delivery'>{d.label}</span>
                  <div className='flex items-center gap-2 text-sm font-black' data-testid='card-score'>
                    <span data-testid='home-name'>{m.homeName}</span>
                    <span className='rounded bg-white/5 px-2 tabular-nums' data-testid='home-score'>{homeScore ?? '–'}</span>
                    <span className='text-zinc-500'>–</span>
                    <span className='rounded bg-white/5 px-2 tabular-nums' data-testid='away-score'>{awayScore ?? '–'}</span>
                    <span data-testid='away-name'>{m.awayName}</span>
                  </div>
                  <span className='text-xs text-zinc-400' data-testid='card-date'>{plan.scope?.weekNumber}. hafta · {new Date(m.playedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</span>
                  <span className={`text-xs ${unclear > 0 ? 'text-amber-400' : 'text-emerald-400'}`} data-testid='card-players'>
                    {total} oyuncu · {linked} eşleşti{suggested ? ` · ${suggested} öneri` : ''}{unclear > 0 ? ` · ${unclear} eşleşmedi/belirsiz` : ''}
                  </span>
                  {draftIssues && <span className='text-xs font-bold text-red-300'><AlertTriangle className='inline h-3 w-3' /> Gönderilemez: incelemeyi açın</span>}
                  <button type='button' aria-expanded={isOpen} className={`${btn} ml-auto border border-white/10 bg-white/5 text-zinc-200 hover:text-cyan-400`} onClick={() => setOpenId(isOpen ? null : m.eaMatchId)}>
                    {isOpen ? <ChevronUp className='inline h-3 w-3' /> : <ChevronDown className='inline h-3 w-3' />} {isOpen ? 'Kapat' : 'İncele'}
                  </button>
                </div>

                {isOpen && m.delivery === 'DRAFT' && (
                  <DraftPanel
                    m={m}
                    busy={busy}
                    onToggleLink={(pid, prof) => toggleLink(m.eaMatchId, pid, prof)}
                    onToggleOow={() => toggleOow(m.eaMatchId)}
                    onSend={() => send(m)}
                    onDelete={() => { setHidden(new Set(hidden).add(m.eaMatchId)); setOpenId(null); }}
                  />
                )}
                {isOpen && m.delivery !== 'DRAFT' && m.recordId && <StoredPanel m={m} recordId={m.recordId} onChanged={() => void run(oow, links, true)} />}
              </article>
            );
          })}
          {visible.length === 0 && plan.status !== 'REJECTED' && <p className='text-sm text-zinc-500'>Gösterilecek maç kalmadı.</p>}
        </div>
      )}
    </div>
  );
}
