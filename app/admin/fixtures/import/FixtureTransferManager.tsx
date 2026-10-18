'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { exportFormError } from '@/lib/fixture-export-form';
import { applyFixtureImportAction, previewFixtureImportAction } from './actions';

/* eslint-disable @typescript-eslint/no-explicit-any */

const card = 'bg-[#0a1628] border border-white/5 rounded-xl p-5 mb-6';
const input = 'bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-sm text-white';
const btn = 'px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40';

const STATUS_LABEL: Record<string, string> = {
  READY: 'Hazır',
  NOOP: 'Değişiklik yok',
  NEEDS_DECISION: 'Yönetici kararı gerekli',
  BLOCKED: 'Engellendi',
  REJECTED: 'Reddedildi',
};
const RELATED_LABEL: Record<string, string> = {
  OLD_TEAM_OTHER_WEEK_FIXTURES: 'Bu haftadan çıkan takımın diğer fikstürleri',
  NEW_TEAM_OTHER_WEEK_FIXTURES: 'Bu haftaya giren takımın diğer fikstürleri',
  INACTIVE_TEAM_FIXTURES: 'Ligde pasif takımın fikstürleri',
};
const REASON_LABEL: Record<string, string> = {
  PLAYED_FIXTURE: 'Oynanmış/maçı olan fikstür',
  LIVE_CHANGED_SINCE_EXPORT: 'Dışa aktarmadan sonra canlıda değişmiş',
};

export function FixtureTransferManager({ seasons, leagues, history }: { seasons: any[]; leagues: any[]; history: any[] }) {
  const router = useRouter();
  const [seasonId, setSeasonId] = useState(seasons[0]?.id ?? '');
  const seasonLeagues = useMemo(() => leagues.filter((l) => l.season_id === seasonId), [leagues, seasonId]);

  // export
  const [exLeagues, setExLeagues] = useState<string[]>([]);
  const [exMode, setExMode] = useState<'single' | 'range' | 'all'>('single');
  const [week, setWeek] = useState('1');
  const [weekFrom, setWeekFrom] = useState('1');
  const [weekTo, setWeekTo] = useState('10');

  const exportUrl = useMemo(() => {
    const p = new URLSearchParams({ seasonId });
    exLeagues.forEach((id) => p.append('leagueId', id));
    if (exMode === 'single') p.set('week', week);
    if (exMode === 'range') {
      p.set('weekFrom', weekFrom);
      p.set('weekTo', weekTo);
    }
    return `/admin/fixtures/export/weekly?${p.toString()}`;
  }, [seasonId, exLeagues, exMode, week, weekFrom, weekTo]);

  const [exBusy, setExBusy] = useState(false);
  const [exMsg, setExMsg] = useState<{ type: 'ok' | 'err'; text: string; notices?: string[] } | null>(null);

  const exportError = exportFormError({ leagueCount: exLeagues.length, mode: exMode, week, weekFrom, weekTo });

  // Fetch (instead of a bare link) so server-side errors and notices are shown here, not as a raw JSON page.
  const downloadExport = async () => {
    if (exportError) return setExMsg({ type: 'err', text: exportError });
    setExBusy(true);
    setExMsg(null);
    try {
      const res = await fetch(exportUrl, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) {
        let body: any = null;
        try { body = await res.json(); } catch { /* not JSON */ }
        setExMsg({ type: 'err', text: body?.error ?? `Dışa aktarma başarısız (HTTP ${res.status}).`, notices: body?.notices });
        return;
      }
      let notices: string[] = [];
      try { notices = JSON.parse(decodeURIComponent(res.headers.get('X-Export-Notices') ?? '[]')); } catch { /* ignore */ }
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'teta-fixtures.json';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExMsg({ type: 'ok', text: `${name} indirildi.`, notices });
    } catch {
      setExMsg({ type: 'err', text: 'Sunucuya ulaşılamadı.' });
    } finally {
      setExBusy(false);
    }
  };

  // import
  const [leagueId, setLeagueId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const [removalMode, setRemovalMode] = useState<'' | 'cancel' | 'keep'>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const buildForm = (acc: Set<string>, rm: string = removalMode) => {
    const fd = new FormData();
    if (rm) fd.set('removalMode', rm);
    fd.set('seasonId', seasonId);
    fd.set('leagueId', leagueId);
    files.forEach((f) => fd.append('files', f));
    acc.forEach((id) => fd.append('accepted', id));
    return fd;
  };

  const runPreview = async (acc: Set<string> = accepted, rm: string = removalMode, keepMsg = false) => {
    setBusy(true);
    if (!keepMsg) setMsg(null);
    setConfirm(false);
    const res: any = await previewFixtureImportAction(buildForm(acc, rm));
    setBusy(false);
    if (res.error) return setMsg({ type: 'err', text: res.error });
    setPreview(res.preview);
  };

  const toggleDecision = (id: string) => {
    const next = new Set(accepted);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAccepted(next);
    runPreview(next);
  };

  const apply = async () => {
    setBusy(true);
    const fd = buildForm(accepted);
    const hashes: Record<string, string | null> = {};
    preview.plans.forEach((p: any) => (hashes[p.fileName] = p.planHash));
    fd.set('planHashes', JSON.stringify(hashes));
    fd.set('confirm', 'yes');
    const res: any = await applyFixtureImportAction(fd);
    setBusy(false);
    if (res.error) {
      // Nothing was written. Re-run the (read-only) preview so the admin sees the current live state.
      setMsg({ type: 'err', text: res.error });
      await runPreview(accepted, removalMode, true);
      return;
    }
    setMsg({ type: 'ok', text: `${res.applied.length} dosya uygulandı.` });
    setPreview(null);
    setFiles([]);
    setAccepted(new Set());
    router.refresh();
  };

  const leagueName = (id: string) => leagues.find((l) => l.id === id)?.name ?? id;

  return (
    <div className="text-white">
      <div className={card}>
        <label className="text-xs text-zinc-400 block mb-1">Sezon</label>
        <select
          className={input}
          value={seasonId}
          onChange={(e) => {
            setSeasonId(e.target.value);
            setExLeagues([]);
            setLeagueId('');
            setPreview(null);
          }}
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* ---------------- EXPORT ---------------- */}
      <div className={card}>
        <h2 className="font-black tracking-widest text-sm text-[#00e5ff] mb-3">DIŞA AKTAR</h2>
        <div className="flex flex-wrap gap-3 mb-3">
          {seasonLeagues.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={exLeagues.includes(l.id)}
                onChange={(e) => setExLeagues(e.target.checked ? [...exLeagues, l.id] : exLeagues.filter((x) => x !== l.id))}
              />
              {l.name}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <select className={input} value={exMode} onChange={(e) => setExMode(e.target.value as any)}>
            <option value="single">Tek hafta</option>
            <option value="range">Hafta aralığı</option>
            <option value="all">Tüm haftalar</option>
          </select>
          {exMode === 'single' && <input className={`${input} w-24`} type="number" min={1} value={week} onChange={(e) => setWeek(e.target.value)} />}
          {exMode === 'range' && (
            <>
              <input className={`${input} w-24`} type="number" min={1} value={weekFrom} onChange={(e) => setWeekFrom(e.target.value)} />
              <span>–</span>
              <input className={`${input} w-24`} type="number" min={1} value={weekTo} onChange={(e) => setWeekTo(e.target.value)} />
            </>
          )}
        </div>
        <button type="button" onClick={downloadExport} disabled={exBusy || !!exportError} className={`${btn} bg-[#00e5ff] text-black`}>
          {exBusy ? 'Hazırlanıyor…' : 'İndir'}
        </button>
        {exportError && <span className="ml-3 text-xs text-zinc-400">{exportError}</span>}
        {exMsg && (
          <div role={exMsg.type === 'err' ? 'alert' : 'status'} className={`mt-3 rounded-lg px-3 py-2 text-sm ${exMsg.type === 'err' ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
            <p>{exMsg.text}</p>
            {!!exMsg.notices?.length && (
              <ul className="mt-1 list-disc pl-5 text-xs text-amber-200">
                {exMsg.notices.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-xs text-zinc-500 mt-2">
          Tek dosya JSON olarak iner. Birden fazla hafta/lig seçilirse her biri ayrı JSON dosyası olarak tek bir ZIP içinde gelir
          (tarayıcılar art arda çoklu indirmeyi engellediği için).
        </p>
      </div>

      {/* ---------------- IMPORT ---------------- */}
      <div className={card}>
        <h2 className="font-black tracking-widest text-sm text-[#00e5ff] mb-3">İÇE AKTAR</h2>
        <div className="flex flex-wrap items-center gap-3 mb-3">
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
            onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setPreview(null); setAccepted(new Set()); setRemovalMode(''); }}
          />
          <button className={`${btn} bg-white/10`} disabled={busy || !leagueId || !files.length} onClick={() => runPreview()}>
            Önizle (yazmaz)
          </button>
        </div>

        {msg && <div className={`text-sm mb-3 ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</div>}

        {preview && (
          <div>
            {preview.batchErrors.map((e: string, i: number) => (
              <div key={i} className="text-sm text-red-400 mb-1">• {e}</div>
            ))}
            {preview.plans.map((p: any) => (
              <div key={p.fileName} className="border border-white/10 rounded-lg p-4 my-3">
                <div className="flex justify-between flex-wrap gap-2">
                  <div className="font-bold text-sm">{p.fileName}</div>
                  <div className="text-xs font-black">{STATUS_LABEL[p.status] ?? p.status}</div>
                </div>
                {p.scope && (
                  <div className="text-xs text-zinc-400">
                    {p.scope.leagueName} · Hafta {p.scope.weekNumber} · {p.exportId}
                  </div>
                )}
                {p.rejections.map((r: string, i: number) => (
                  <div key={i} className="text-xs text-red-400 mt-1">Reddedildi: {r}</div>
                ))}
                {p.warnings.map((w: string, i: number) => (
                  <div key={i} className="text-xs text-yellow-400 mt-1">⚠ {w}</div>
                ))}
                {p.conflicts.map((c: any, i: number) => (
                  <div key={i} className="text-xs text-red-400 mt-1">
                    Çakışma{c.blocking ? ' (engelleyici)' : ''}: {c.message}
                  </div>
                ))}

                {p.adds.length > 0 && (
                  <Section title={`Eklenecek (${p.adds.length})`}>
                    {p.adds.map((a: any) => (
                      <Row key={a.fixtureId} id={a.fixtureId} text={`${a.after.scheduledAt} · ${a.after.status}`} />
                    ))}
                  </Section>
                )}
                {p.changes.length > 0 && (
                  <Section title={`Değişecek (${p.changes.length})`}>
                    {p.changes.map((c: any) => (
                      <div key={c.fixtureId} className="text-xs py-1 border-t border-white/5">
                        <div className="font-mono text-zinc-400">{c.fixtureId}</div>
                        {c.fields.map((f: string) => (
                          <div key={f}>
                            {f}: <span className="text-red-300">{nm(p, c.before[f])}</span> → <span className="text-green-300">{nm(p, c.after[f])}</span>
                          </div>
                        ))}
                        {c.reasons.length > 0 && (
                          <label className="flex items-center gap-2 mt-1 text-yellow-300">
                            <input type="checkbox" checked={accepted.has(c.fixtureId)} onChange={() => toggleDecision(c.fixtureId)} />
                            Açıkça onaylıyorum: {c.reasons.map((r: string) => REASON_LABEL[r] ?? r).join(', ')}
                          </label>
                        )}
                      </div>
                    ))}
                  </Section>
                )}
                {p.removalDecisionRequired && (
                  <div className="mt-3 text-xs border border-yellow-500/40 rounded p-3 text-yellow-300">
                    Bu dosyada olmayan oynanmamış fikstürler var. Dosyada yer almaması iptal isteği olarak yorumlanmaz; seçim yapın (tüm dosyalar için geçerli):
                    <div className="flex gap-2 mt-2">
                      <button className={`${btn} bg-red-500/80 text-white`} onClick={() => { setRemovalMode('cancel'); runPreview(accepted, 'cancel'); }}>
                        Dosyada olmayan fikstürleri İPTAL et
                      </button>
                      <button className={`${btn} bg-white/10`} onClick={() => { setRemovalMode('keep'); runPreview(accepted, 'keep'); }}>
                        İptal etme, koru
                      </button>
                    </div>
                  </div>
                )}
                {p.removals.length > 0 && (
                  <Section title={p.removalDecisionRequired ? `Dosyada olmayan fikstürler (${p.removals.filter((r: any) => !r.played).length}) — karar bekliyor, henüz iptal edilmeyecek` : `Dosyada olmayan fikstürler: ${p.ops.some((o: any) => o.op === 'cancel') ? 'İPTAL edilecek (silinmez)' : 'korunacak'} (${p.removals.filter((r: any) => !r.played).length}); oynanmış, dokunulmayacak (${p.removals.filter((r: any) => r.played).length})`}>
                    {p.removals.map((r: any) => (
                      <Row key={r.fixtureId} id={r.fixtureId} text={`${r.before.scheduledAt}${r.played ? ' · OYNANMIŞ, dokunulmayacak' : ''}`} />
                    ))}
                  </Section>
                )}
                {p.relatedWeeks.length > 0 && (
                  <Section title={`İlişkili diğer haftalar (${p.relatedWeeks.length}) — otomatik değiştirilmez`}>
                    {p.relatedWeeks.map((r: any, i: number) => (
                      <Row key={i} id={`Hafta ${r.weekNumber}`} text={`${RELATED_LABEL[r.reason] ?? r.reason} · ${nm(p, r.teamId)} · ${r.unplayedFixtureIds.length} oynanmamış fikstür`} />
                    ))}
                  </Section>
                )}
                <div className="text-xs text-zinc-500 mt-2">Değişmeyen fikstür: {p.unchanged}</div>
              </div>
            ))}

            <label className="flex items-center gap-2 text-sm my-3">
              <input type="checkbox" checked={confirm} disabled={!preview.canApply} onChange={(e) => setConfirm(e.target.checked)} />
              Yukarıdaki değişiklikleri inceledim ve canlı fikstürlere uygulanmasını onaylıyorum.
            </label>
            <button className={`${btn} bg-green-500 text-black`} disabled={busy || !preview.canApply || !confirm} onClick={apply}>
              Onayla ve uygula
            </button>
          </div>
        )}
      </div>

      {/* ---------------- HISTORY ---------------- */}
      <div className={card}>
        <h2 className="font-black tracking-widest text-sm text-[#00e5ff] mb-3">AKTARIM GEÇMİŞİ</h2>
        {history.length === 0 && <div className="text-sm text-zinc-500">Henüz aktarım yok.</div>}
        {history.map((h) => (
          <div key={h.id} className="text-xs border-t border-white/5 py-2">
            <span className="font-bold">{h.result === 'APPLIED' ? 'Uygulandı' : 'Reddedildi'}</span> · {leagueName(h.league_id)} · Hafta{' '}
            {h.week_number} · {new Date(h.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
            <div className="text-zinc-500 font-mono">{h.file_name} · {h.export_id} · {String(h.checksum).slice(0, 12)}…</div>
            {h.error_message && <div className="text-red-400">{h.error_message}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

const nm = (p: any, v: unknown) => (typeof v === 'string' && p.teamNames?.[v]) || String(v);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="text-xs font-black text-zinc-300">{title}</div>
      {children}
    </div>
  );
}
function Row({ id, text }: { id: string; text: string }) {
  return (
    <div className="text-xs py-1 border-t border-white/5">
      <span className="font-mono text-zinc-400">{id}</span> · {text}
    </div>
  );
}
