'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm, useToast } from '@/components/feedback/FeedbackProvider';
import { applyTeamReplacement, previewTeamReplacement, type ReplacementSummary } from './actions';

export interface ReplacementTeam {
  id: string;
  name: string;
}

export interface ReplacementLeague {
  id: string;
  name: string;
  teams: ReplacementTeam[];
}

const selectClass =
  'w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white focus:border-[#00e5ff] focus:outline-none disabled:opacity-50';

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <label className='block space-y-2'>
      <span className='text-xs font-black uppercase tracking-widest text-zinc-400'>
        {n}. {label}
      </span>
      {children}
    </label>
  );
}

function weekRange(weeks: number[]) {
  if (weeks.length === 0) return '';
  const sorted = [...weeks].sort((a, b) => a - b);
  const contiguous = sorted.every((w, i) => i === 0 || w === sorted[i - 1] + 1);
  return contiguous && sorted.length > 1 ? `${sorted[0]}–${sorted[sorted.length - 1]}. haftalar` : `${sorted.join(', ')}. hafta`;
}

export default function TeamReplacementClient({
  leagues,
  candidates,
}: {
  leagues: ReplacementLeague[];
  candidates: ReplacementTeam[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [leagueId, setLeagueId] = useState('');
  const [outTeamId, setOutTeamId] = useState('');
  const [inTeamId, setInTeamId] = useState('');
  const [summary, setSummary] = useState<ReplacementSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [applying, startApplying] = useTransition();

  const league = leagues.find((l) => l.id === leagueId);
  const outTeam = league?.teams.find((t) => t.id === outTeamId);
  const inTeam = candidates.find((t) => t.id === inTeamId);

  useEffect(() => {
    setSummary(null);
    setError(null);
    if (!leagueId || !outTeamId || !inTeamId) return;
    startLoading(async () => {
      const res = await previewTeamReplacement(leagueId, outTeamId, inTeamId);
      if ('error' in res) setError(res.error);
      else setSummary(res.summary);
    });
  }, [leagueId, outTeamId, inTeamId]);

  const blocked = !summary || summary.blockers.length > 0;
  const s = summary?.carried_stats || {};
  const goalDiff = (s.goals_for ?? 0) - (s.goals_against ?? 0);

  const apply = async () => {
    if (!outTeam || !inTeam || !league || blocked) return;
    const ok = await confirm({
      title: 'Takım değişimi',
      message:
        `${league.name}: ${outTeam.name} ligden çekilecek, yerine ${inTeam.name} girecek.\n\n` +
        `${summary!.fixture_count} fikstür ${inTeam.name} adına geçecek. Bu işlemin geri alma düğmesi yok.`,
      confirmLabel: 'Değiştir',
      danger: true,
    });
    if (!ok) return;
    startApplying(async () => {
      const res = await applyTeamReplacement(league.id, outTeam.id, inTeam.id);
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      if (!res.summary.applied) {
        setSummary(res.summary);
        toast.error('Değişim yapılamadı, engelleri kontrol edin.');
        return;
      }
      toast.success(`${inTeam.name}, ${outTeam.name} yerine lige alındı.`);
      setLeagueId('');
      setOutTeamId('');
      setInTeamId('');
      router.refresh();
    });
  };

  return (
    <div className='space-y-6 rounded-2xl border border-white/5 bg-[#0a1628] p-5 sm:p-6'>
      <Step n={1} label='Lig seç'>
        <select
          className={selectClass}
          value={leagueId}
          onChange={(e) => {
            setLeagueId(e.target.value);
            setOutTeamId('');
          }}
        >
          <option value=''>Lig seçin</option>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Step>

      <Step n={2} label='Çekilen takımı seç'>
        <select className={selectClass} value={outTeamId} disabled={!league} onChange={(e) => setOutTeamId(e.target.value)}>
          <option value=''>Ligdeki aktif takımlardan seçin</option>
          {league?.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Step>

      <Step n={3} label='Giren takımı seç'>
        <select className={selectClass} value={inTeamId} onChange={(e) => setInTeamId(e.target.value)}>
          <option value=''>Bu sezon hiçbir ligde olmayan aktif takımlardan seçin</option>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Step>

      {loading && <div className='h-40 animate-pulse rounded-xl bg-white/5' aria-hidden='true' />}

      {error && <p className='rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300'>{error}</p>}

      {summary && !loading && outTeam && inTeam && (
        <div className='space-y-4'>
          <h2 className='text-xs font-black uppercase tracking-widest text-zinc-400'>4. Özet</h2>

          {summary.blockers.length > 0 && (
            <ul className='space-y-1 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300'>
              {summary.blockers.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          )}

          <dl className='grid gap-3 sm:grid-cols-2'>
            <div className='rounded-xl border border-white/5 bg-black/20 p-4'>
              <dt className='text-[11px] font-bold uppercase tracking-wider text-zinc-500'>Devredilecek fikstür</dt>
              <dd className='mt-1 text-2xl font-black text-white'>{summary.fixture_count}</dd>
              <dd className='text-xs text-zinc-400'>{weekRange(summary.fixture_weeks)}</dd>
            </div>
            <div className='rounded-xl border border-white/5 bg-black/20 p-4'>
              <dt className='text-[11px] font-bold uppercase tracking-wider text-zinc-500'>Fesih edilecek aktif oyuncu</dt>
              <dd className='mt-1 text-2xl font-black text-white'>{summary.released_players}</dd>
              <dd className='text-xs text-zinc-400'>{outTeam.name} kadrosundan</dd>
            </div>
          </dl>

          <div className='rounded-xl border border-white/5 bg-black/20 p-4'>
            <p className='text-[11px] font-bold uppercase tracking-wider text-zinc-500'>
              Puan tablosunda {inTeam.name} adına geçecek istatistik
            </p>
            <p className='mt-2 text-sm font-bold text-white'>
              {s.matches_played ?? 0} maç · {s.wins ?? 0}G {s.draws ?? 0}B {s.losses ?? 0}M · {s.goals_for ?? 0} atılan, {s.goals_against ?? 0} yenilen ·
              averaj {goalDiff > 0 ? `+${goalDiff}` : goalDiff} · <span className='text-[#00e5ff]'>{s.points ?? 0} puan</span>
            </p>
          </div>

          <ul className='space-y-1 text-xs text-zinc-400'>
            <li>• {outTeam.name} puan tablosundan çıkar; oynanmış maçları, oyuncu kariyerleri ve tüm zamanlar puanı aynen kalır.</li>
            <li>• {inTeam.name} tüm zamanlar sıralamasına 0 puanla başlar. Kaptanı ve oyuncuları değişimden sonra elle eklenir.</li>
            <li>• Transfer slotları değişmez.</li>
          </ul>

          <button
            type='button'
            onClick={apply}
            disabled={blocked || applying}
            className='flex min-h-[44px] w-full items-center justify-center rounded-xl bg-amber-400 px-5 py-3 text-xs font-black uppercase tracking-widest text-[#050a0f] transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40'
          >
            {applying ? 'Değiştiriliyor…' : 'Değiştir'}
          </button>
        </div>
      )}
    </div>
  );
}
