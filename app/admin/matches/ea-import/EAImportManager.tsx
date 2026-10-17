'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, FileCheck2, AlertTriangle } from 'lucide-react';
import { previewJsonMatchesAction, sendMatchToReviewAction } from './json-actions';

/* eslint-disable @typescript-eslint/no-explicit-any */

const input = 'bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 outline-none';
const btn = 'px-4 py-2 rounded-lg text-xs font-black transition-colors disabled:opacity-40';

// Status of each match is derived from the stored match records on the server (never from browser state).
const DELIVERY: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Taslak', cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
  SENT: { label: 'Onaya Gönderildi', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  APPROVED: { label: 'Onaylandı', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  REJECTED: { label: 'Reddedildi', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
};
const SUGGESTION: Record<string, string> = { MATCHED: 'Öneri var', UNMATCHED: 'Eşleşme yok', AMBIGUOUS: 'Belirsiz' };

function SideTable({ title, players, matchEa, onToggle }: { title: string; players: any[]; matchEa: string; onToggle: (eaPlayerId: string, profileId: string) => void }) {
  const ok = players.length === 11;
  return (
    <div className='min-w-0 flex-1'>
      <p className='mb-1 text-xs font-black uppercase tracking-wide text-cyan-400'>
        {title}{' '}
        <span className={`ml-1 normal-case font-bold ${ok ? 'text-zinc-400' : 'text-amber-400'}`} data-testid='player-count'>
          {players.length} oyuncu{ok ? '' : ' (11 değil: eksik/fazla oyuncu)'}
        </span>
      </p>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[520px] text-[11px]'>
          <thead>
            <tr className='text-left text-zinc-500'>
              <th className='pr-2'>Oyuncu</th>
              <th className='pr-2'>EA kimliği</th>
              <th className='pr-2'>Poz</th>
              <th className='pr-1 text-right'>Puan</th>
              <th className='pr-1 text-right'>G</th>
              <th className='pr-1 text-right'>A</th>
              <th className='pr-1 text-right'>Şut</th>
              <th className='pr-2 text-right'>Pas</th>
              <th>Eşleştirme</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.eaPlayerId} className='border-t border-white/5'>
                <td className='max-w-[9rem] truncate pr-2 text-white'>{p.stats.mom ? '⭐ ' : ''}{p.eaPlayerName ?? '—'}</td>
                <td className='pr-2 font-mono text-zinc-400'>{p.eaPlayerId}</td>
                <td className='pr-2 text-zinc-400'>{p.stats.position ?? '–'}</td>
                <td className='pr-1 text-right tabular-nums'>{p.stats.rating === null ? '–' : p.stats.rating.toFixed(1)}</td>
                <td className='pr-1 text-right tabular-nums'>{p.stats.goals}</td>
                <td className='pr-1 text-right tabular-nums'>{p.stats.assists}</td>
                <td className='pr-1 text-right tabular-nums'>{p.stats.shots}</td>
                <td className='pr-2 text-right tabular-nums'>{p.stats.passesMade}/{p.stats.passAttempts}</td>
                <td title={p.suggestion.warning ?? ''}>
                  <span className={p.suggestion.status === 'MATCHED' ? 'text-zinc-300' : 'font-bold text-amber-400'}>
                    {p.linkedProfileId ? 'Bağlanacak' : SUGGESTION[p.suggestion.status]}
                    {p.suggestion.username ? `: @${p.suggestion.username}` : ''}
                  </span>
                  {p.suggestion.status === 'MATCHED' && p.suggestion.profileId && (
                    <label className='ml-2 inline-flex items-center gap-1'>
                      <input type='checkbox' checked={!!p.linkedProfileId} onChange={() => onToggle(p.eaPlayerId, p.suggestion.profileId)} data-match={matchEa} />
                      bağla
                    </label>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EAImportManager({ seasons, leagues, weeksByLeague }: { seasons: any[]; leagues: any[]; weeksByLeague: Record<string, number[]> }) {
  const [seasonId, setSeasonId] = useState(seasons.find((s) => s.status === 'ACTIVE')?.id || seasons[0]?.id || '');
  const [leagueId, setLeagueId] = useState('');
  const [week, setWeek] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [oow, setOow] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<Map<string, { eaMatchId: string; eaPlayerId: string; profileId: string }>>(new Map());
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // deleted drafts (a draft is only the uploaded file; nothing is stored for it)
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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
  };

  const reset = () => {
    setPreview(null);
    setOow(new Set());
    setLinks(new Map());
    setHidden(new Set());
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
        {msg && (
          <p role={msg.type === 'err' ? 'alert' : 'status'} className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.text}</p>
        )}
      </div>

      {plan && (
        <div className='space-y-4' data-testid='file-plan'>
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
            const home = m.players.filter((p: any) => p.side === 'home');
            const away = m.players.filter((p: any) => p.side === 'away');
            const undecided = m.outOfWindow && !m.outOfWindowAccepted;
            const canSend = m.delivery === 'DRAFT' && m.errors.length === 0 && !undecided && !!m.sendHash;
            const unclear = m.players.filter((p: any) => p.suggestion.status !== 'MATCHED' && !p.linkedProfileId).length;
            return (
              <article key={m.eaMatchId} className='rounded-xl border border-white/5 bg-[#0a1628] p-5' data-testid='match-card' data-delivery={m.delivery}>
                <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-black ${d.cls}`} data-testid='delivery'>{d.label}</span>
                  <strong className='text-base'>{m.homeName} {m.homeScore} – {m.awayScore} {m.awayName}</strong>
                  <span className='text-xs text-zinc-400'>{plan.scope?.weekNumber}. hafta · {new Date(m.playedAt).toLocaleString('tr-TR')}</span>
                  <code className='text-[11px] text-zinc-500'>EA {m.eaMatchId}</code>
                  <span className='text-[11px] text-zinc-500'>fikstür {m.fixtureId.slice(0, 8)}…</span>
                  <div className='ml-auto flex gap-2'>
                    {m.delivery === 'DRAFT' ? (
                      <>
                        <button type='button' className={`${btn} bg-emerald-500 text-black hover:bg-emerald-400`} disabled={!canSend || busy !== null} onClick={() => send(m)}>
                          {busy === m.eaMatchId ? <Loader2 className='inline h-3 w-3 animate-spin' /> : null} Onaya Gönder
                        </button>
                        <button type='button' className={`${btn} border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20`} disabled={busy !== null} title='Taslağı bu görünümden kaldırır; veritabanında kayıt olmadığından hiçbir kayıt silinmez' onClick={() => setHidden(new Set(hidden).add(m.eaMatchId))}>
                          Sil
                        </button>
                      </>
                    ) : (
                      <Link href='/admin/matches' className={`${btn} border border-white/10 bg-white/5 text-zinc-200`}>Maç onay ekranında aç</Link>
                    )}
                  </div>
                </div>

                {m.delivery === 'DRAFT' && m.errors.map((e: any, i: number) => (
                  <p key={i} className='mt-2 flex items-start gap-1 text-xs text-red-300'><AlertTriangle className='mt-0.5 h-3 w-3 shrink-0' /><span><b>{e.code}</b> — {e.message}</span></p>
                ))}
                {m.delivery === 'DRAFT' && m.warnings.map((w: any, i: number) => (
                  <p key={i} className='mt-1 text-xs text-amber-300'>{w.message}</p>
                ))}
                {m.delivery === 'DRAFT' && unclear > 0 && (
                  <p className='mt-1 text-xs font-bold text-amber-400' data-testid='unclear-players'>{unclear} oyuncunun profili eşleşmedi/belirsiz: gönderildikten sonra Maç Onay ve İnceleme Merkezi&apos;nden elle atanmalı (profil sessizce seçilmez).</p>
                )}
                {m.delivery === 'DRAFT' && m.outOfWindow && (
                  <label className='mt-2 flex items-center gap-2 text-xs'>
                    <input type='checkbox' checked={m.outOfWindowAccepted} onChange={() => toggleOow(m.eaMatchId)} />
                    Zaman aralığı dışında olduğunu biliyorum; yine de gönder
                  </label>
                )}

                <div className='mt-4 flex flex-col gap-4 lg:flex-row'>
                  <SideTable title={m.homeName} players={home} matchEa={m.eaMatchId} onToggle={(pid, prof) => toggleLink(m.eaMatchId, pid, prof)} />
                  <SideTable title={m.awayName} players={away} matchEa={m.eaMatchId} onToggle={(pid, prof) => toggleLink(m.eaMatchId, pid, prof)} />
                </div>
              </article>
            );
          })}
          {visible.length === 0 && plan.status !== 'REJECTED' && <p className='text-sm text-zinc-500'>Gösterilecek maç kalmadı.</p>}
        </div>
      )}
    </div>
  );
}
