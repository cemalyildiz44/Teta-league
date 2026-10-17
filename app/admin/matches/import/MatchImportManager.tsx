'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyMatchImportAction, previewMatchImportAction } from './actions';

/* eslint-disable @typescript-eslint/no-explicit-any */

const card = 'bg-[#0a1628] border border-white/5 rounded-xl p-5 mb-6';
const input = 'bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-sm text-white';
const btn = 'px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40';

const STATUS_LABEL: Record<string, string> = {
  READY: 'Hazır',
  NOOP: 'Zaten uygulanmış',
  NEEDS_DECISION: 'Yönetici kararı gerekli',
  BLOCKED: 'Engellendi',
  REJECTED: 'Reddedildi',
};
const SUGGESTION_LABEL: Record<string, string> = { MATCHED: 'Öneri var', UNMATCHED: 'Eşleşme yok', AMBIGUOUS: 'Belirsiz' };

export function MatchImportManager({ seasons, leagues, history }: { seasons: any[]; leagues: any[]; history: any[] }) {
  const router = useRouter();
  const [seasonId, setSeasonId] = useState(seasons[0]?.id ?? '');
  const seasonLeagues = useMemo(() => leagues.filter((l) => l.season_id === seasonId), [leagues, seasonId]);
  const [leagueId, setLeagueId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [oow, setOow] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<Map<string, { eaMatchId: string; eaPlayerId: string; profileId: string }>>(new Map());
  const [preview, setPreview] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const leagueName = (id: string) => leagues.find((l) => l.id === id)?.name ?? id;
  const summary = useMemo(() => {
    const plans: any[] = preview?.plans ?? [];
    const ms = plans.flatMap((p) => p.matches);
    return {
      files: plans.length,
      matches: ms.length,
      players: ms.reduce((n, m) => n + m.players.length, 0),
      linked: ms.reduce((n, m) => n + m.players.filter((x: any) => x.linkedProfileId).length, 0),
      undecided: ms.filter((m) => m.outOfWindow && !m.outOfWindowAccepted).length,
      blocked: plans.filter((p) => p.status === 'REJECTED' || p.status === 'BLOCKED').length,
    };
  }, [preview]);

  const buildForm = (o: Set<string>, l: Map<string, any>) => {
    const fd = new FormData();
    fd.set('seasonId', seasonId);
    fd.set('leagueId', leagueId);
    files.forEach((f) => fd.append('files', f));
    o.forEach((id) => fd.append('oow', id));
    fd.set('links', JSON.stringify([...l.values()]));
    return fd;
  };

  const runPreview = async (o: Set<string> = oow, l: Map<string, any> = links, keepMsg = false) => {
    setBusy(true);
    if (!keepMsg) setMsg(null);
    setConfirm(false);
    const res: any = await previewMatchImportAction(buildForm(o, l));
    setBusy(false);
    if (res.error) return setMsg({ type: 'err', text: res.error });
    setPreview(res.preview);
  };

  const toggleOow = (eaMatchId: string) => {
    const next = new Set(oow);
    if (next.has(eaMatchId)) next.delete(eaMatchId);
    else next.add(eaMatchId);
    setOow(next);
    void runPreview(next, links);
  };
  const toggleLink = (eaMatchId: string, eaPlayerId: string, profileId: string) => {
    const key = `${eaMatchId}:${eaPlayerId}`;
    const next = new Map(links);
    if (next.has(key)) next.delete(key);
    else next.set(key, { eaMatchId, eaPlayerId, profileId });
    setLinks(next);
    void runPreview(oow, next);
  };

  const apply = async () => {
    setBusy(true);
    const fd = buildForm(oow, links);
    const hashes: Record<string, string | null> = {};
    preview.plans.forEach((p: any) => (hashes[p.fileName] = p.planHash));
    fd.set('planHashes', JSON.stringify(hashes));
    fd.set('confirm', 'yes');
    const res: any = await applyMatchImportAction(fd);
    setBusy(false);
    if (res.error) {
      setMsg({ type: 'err', text: res.error });
      await runPreview(oow, links, true);
      return;
    }
    const n = res.applied.reduce((s: number, a: any) => s + a.matches, 0);
    setMsg({ type: 'ok', text: `${n} maç inceleme bekliyor (PENDING_REVIEW) olarak eklendi. Onay için maç inceleme ekranını kullanın.` });
    setPreview(null);
    setFiles([]);
    setOow(new Set());
    setLinks(new Map());
    router.refresh();
  };

  return (
    <div className="text-white">
      <div className={card}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <select
            className={input}
            value={seasonId}
            onChange={(e) => {
              setSeasonId(e.target.value);
              setLeagueId('');
              setPreview(null);
            }}
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className={input} value={leagueId} onChange={(e) => { setLeagueId(e.target.value); setPreview(null); }}>
            <option value="">Lig seçin…</option>
            {seasonLeagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <input
            type="file"
            accept="application/json,.json"
            multiple
            className="text-sm"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
              setPreview(null);
              setOow(new Set());
              setLinks(new Map());
            }}
          />
          <button type="button" className={`${btn} bg-[#00e5ff] text-black`} disabled={busy || !leagueId || files.length === 0} onClick={() => runPreview()}>
            {busy ? 'Kontrol ediliyor…' : 'Önizle'}
          </button>
        </div>
        <p className="text-xs text-zinc-500">Önizleme hiçbir şey yazmaz. Takım, EA kulüp kimliği, fikstür durumu ve zaman aralığı canlı kayıtlarla karşılaştırılır; dosyaya güvenilmez.</p>
        {msg && <p role={msg.type === 'err' ? 'alert' : 'status'} className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.text}</p>}
      </div>

      {preview && (
        <div className={card}>
          <h2 className="font-black tracking-widest text-sm text-[#00e5ff] mb-3">ÖNİZLEME</h2>
          {preview.batchErrors.map((e: string, i: number) => (
            <p key={i} className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{e}</p>
          ))}
          <p className="mb-3 rounded-lg bg-white/5 px-3 py-2 text-sm" data-testid="plan-summary" aria-live="polite">
            {summary.files} dosya · {summary.matches} maç · {summary.players} oyuncu satırı · <b>{summary.linked}</b> profil bağlantısı seçildi · {summary.undecided} maç yönetici kararı bekliyor · {summary.blocked} dosya engelli/reddedildi
          </p>
          {preview.plans.map((p: any) => (
            <section key={p.fileName} className="mb-5 rounded-lg border border-white/10 p-3" data-testid="file-plan">
              <div className="flex flex-wrap items-center gap-3 mb-2 text-sm">
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold">{STATUS_LABEL[p.status] ?? p.status}</span>
                <strong>{p.fileName}</strong>
                {p.scope && <span className="text-zinc-400">{leagueName(p.scope.leagueId)} · {p.scope.weekNumber}. hafta · {p.matches.length} maç</span>}
              </div>
              {p.rejections.map((r: string, i: number) => (
                <p key={i} className="text-sm text-red-300">{r}</p>
              ))}
              {p.warnings.map((w: string, i: number) => (
                <p key={i} className="text-xs text-amber-300">{w}</p>
              ))}
              {p.matches.map((m: any) => (
                <article key={m.eaMatchId} className="mt-3 rounded-lg bg-black/20 p-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <strong>{m.homeName} {m.homeScore} – {m.awayScore} {m.awayName}</strong>
                    <code className="text-xs text-zinc-400">EA {m.eaMatchId}</code>
                    <span className="text-xs text-zinc-400">fikstür {m.fixtureId.slice(0, 8)}…</span>
                  </div>
                  {m.errors.map((e: any, i: number) => (
                    <p key={i} className="mt-1 text-xs text-red-300"><b>{e.code}</b> — {e.message}</p>
                  ))}
                  {m.warnings.map((w: any, i: number) => (
                    <p key={i} className="mt-1 text-xs text-amber-300">{w.message}</p>
                  ))}
                  {m.outOfWindow && (
                    <label className="mt-2 flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={m.outOfWindowAccepted} onChange={() => toggleOow(m.eaMatchId)} />
                      Zaman aralığı dışında olduğunu biliyorum; yine de ekle
                    </label>
                  )}
                  <table className="mt-2 w-full text-xs">
                    <thead>
                      <tr className="text-left text-zinc-500">
                        <th className="pr-2">Oyuncu (EA adı)</th>
                        <th className="pr-2">EA anahtarı</th>
                        <th className="pr-2">Poz</th>
                        <th className="pr-1 text-right">Puan</th>
                        <th className="pr-1 text-right">G</th>
                        <th className="pr-1 text-right">A</th>
                        <th className="pr-1 text-right">Şut</th>
                        <th className="pr-1 text-right">Pas</th>
                        <th className="pr-2 text-right">Kurt.</th>
                        <th className="pr-2">Profil önerisi</th>
                        <th>Bağla</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.players.map((pl: any) => (
                        <tr key={pl.eaPlayerId} className="border-t border-white/5">
                          <td className="pr-2">{pl.eaPlayerName ?? '—'}</td>
                          <td className="pr-2 font-mono text-zinc-400">{pl.eaPlayerId}</td>
                          <td className="pr-2 text-zinc-400">{pl.stats.position ?? '–'}</td>
                          <td className="pr-1 text-right tabular-nums">{pl.stats.rating === null ? '–' : pl.stats.rating.toFixed(1)}</td>
                          <td className="pr-1 text-right tabular-nums" data-stat="goals">{pl.stats.goals}</td>
                          <td className="pr-1 text-right tabular-nums">{pl.stats.assists}</td>
                          <td className="pr-1 text-right tabular-nums">{pl.stats.shots}</td>
                          <td className="pr-1 text-right tabular-nums">{pl.stats.passesMade}/{pl.stats.passAttempts}</td>
                          <td className="pr-2 text-right tabular-nums">{pl.stats.saves}</td>
                          <td className="pr-2" title={pl.suggestion.warning ?? ''}>
                            {SUGGESTION_LABEL[pl.suggestion.status]}
                            {pl.suggestion.username ? `: @${pl.suggestion.username}` : ''}
                          </td>
                          <td>
                            {pl.suggestion.status === 'MATCHED' && pl.suggestion.profileId ? (
                              <label className="flex items-center gap-1">
                                <input type="checkbox" checked={!!pl.linkedProfileId} onChange={() => toggleLink(m.eaMatchId, pl.eaPlayerId, pl.suggestion.profileId)} />
                                bağla
                              </label>
                            ) : (
                              <span className="text-zinc-500">bağlanmaz</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>
              ))}
            </section>
          ))}
          <p className="mb-3 text-xs text-zinc-400">
            Oyuncu bağlantısı varsayılan olarak <strong>boş</strong> kalır; öneri yalnızca kutuyu işaretlerseniz uygulanır. Bağlanmayan oyuncular maç inceleme ekranından elle atanabilir.
          </p>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} disabled={!preview.canApply} />
            Bu önizlemeyi onaylıyorum: maçlar <b>PENDING_REVIEW</b> olarak eklenecek (onaylanmayacak).
          </label>
          <button type="button" className={`${btn} bg-emerald-500 text-black`} disabled={busy || !preview.canApply || !confirm} onClick={apply}>
            İçe aktar
          </button>
        </div>
      )}

      <div className={card}>
        <h2 className="font-black tracking-widest text-sm text-[#00e5ff] mb-3">SON İÇE AKTARMALAR</h2>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-500">Kayıt yok.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-3 text-zinc-300">
                <span className={h.result === 'APPLIED' ? 'text-emerald-300' : 'text-red-300'}>{h.result === 'APPLIED' ? 'Uygulandı' : 'Reddedildi'}</span>
                <span>{new Date(h.created_at).toLocaleString('tr-TR')}</span>
                <span>{leagueName(h.league_id)} · {h.week_number}. hafta</span>
                <span className="font-mono text-zinc-500">{h.export_id}</span>
                {h.error_message && <span className="text-red-300">{h.error_message}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
