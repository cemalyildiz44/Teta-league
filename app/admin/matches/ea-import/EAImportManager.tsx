'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, FileCheck2, AlertTriangle, ChevronDown, ChevronUp, Check, Edit3, Users } from 'lucide-react';
import { assignReviewMatchPlayerAction, getReviewMatchAction, previewJsonMatchesAction, sendMatchToReviewAction } from './json-actions';
import { updateMatchScoreAction, updatePlayerStatsAction } from '../actions';

/* eslint-disable @typescript-eslint/no-explicit-any */

const inputCls = 'bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 outline-none';
const smallInputCls = 'bg-[#060d18] border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs outline-none focus:border-cyan-500/50';
const btnCls = 'px-4 py-2 rounded-lg text-xs font-black transition-colors disabled:opacity-40';
const miniBtnCls = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40';

// Status of each match is derived from the stored match records on the server (never from browser state).
const DELIVERY: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Taslak', cls: 'bg-zinc-500/15 text-zinc-200 border-zinc-500/30' },
  SENT: { label: 'Onay Kuyruğunda (PENDING_REVIEW)', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  APPROVED: { label: 'Onaylandı', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  REJECTED: { label: 'Reddedildi', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

type Feedback = { type: 'ok' | 'err'; text: string } | null;
type StoredSummary = { status: string; homeScore: number | null; awayScore: number | null; players: number; linked: number };
type RosterCandidate = { id: string; username: string; fullName: string | null };

function Note({ fb }: { fb: Feedback }) {
  if (!fb) return null;
  return (
    <p
      role={fb.type === 'err' ? 'alert' : 'status'}
      className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
        fb.type === 'ok'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          : 'border-red-500/30 bg-red-500/10 text-red-200'
      }`}
    >
      {fb.text}
    </p>
  );
}

/**
 * Clear status badges:
 * - Eşleşti: green badge
 * - Eşleşmedi: orange badge
 * - Belirsiz: yellow warning badge
 */
function MatchBadge({
  status,
  username,
}: {
  status: 'LINKED' | 'TO_LINK' | 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS';
  username?: string | null;
}) {
  if (status === 'LINKED' || status === 'TO_LINK' || status === 'MATCHED') {
    return (
      <span
        className='inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300'
        data-testid='match-state'
        data-state={status}
      >
        <span>✓ Eşleşti</span>
        {username && <span className='text-emerald-100'>· @{username}</span>}
      </span>
    );
  }
  if (status === 'AMBIGUOUS') {
    return (
      <span
        className='inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300'
        data-testid='match-state'
        data-state='AMBIGUOUS'
      >
        ⚠ Belirsiz
      </span>
    );
  }
  return (
    <span
      className='inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/15 px-2.5 py-1 text-xs font-bold text-orange-300'
      data-testid='match-state'
      data-state='UNMATCHED'
    >
      Eşleşmedi
    </span>
  );
}

function SideHeader({ title, count, side, rosterCount }: { title: string; count: number; side: 'home' | 'away'; rosterCount: number }) {
  const ok = count === 11;
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3'>
      <div>
        <span className='text-[11px] font-black uppercase tracking-wider text-cyan-400'>
          {side === 'home' ? 'Ev Sahibi' : 'Deplasman'}
        </span>
        <h3 className='text-base font-black text-white'>{title}</h3>
      </div>
      <div className='flex flex-wrap items-center gap-2 text-xs'>
        <span className='inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-300'>
          <Users className='h-3.5 w-3.5 text-cyan-400' />
          Kadro: {rosterCount} kayıtlı oyuncu
        </span>
        <span
          className={`rounded-md border px-2.5 py-1 font-bold ${
            ok
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}
          data-testid='player-count'
        >
          {count} oyuncu{ok ? '' : ' (11 değil)'}
        </span>
      </div>
    </div>
  );
}

function PlayerStatPills({
  position,
  rating,
  goals,
  assists,
  shots,
}: {
  position: string | null | undefined;
  rating: number | string | null | undefined;
  goals: number | null | undefined;
  assists: number | null | undefined;
  shots: number | null | undefined;
}) {
  const formattedRating = rating === null || rating === undefined || rating === '' ? '–' : Number(rating).toFixed(1);
  return (
    <div className='flex flex-wrap items-center gap-1.5 text-xs'>
      <span className='rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-bold uppercase text-cyan-300'>
        {position || '–'}
      </span>
      <span className='rounded-md border border-white/10 bg-[#060d18] px-2 py-0.5 text-zinc-300 tabular-nums'>
        Puan: <b className='text-white'>{formattedRating}</b>
      </span>
      <span className='rounded-md border border-white/10 bg-[#060d18] px-2 py-0.5 text-zinc-300 tabular-nums'>
        G: <b className='text-white'>{goals ?? 0}</b>
      </span>
      <span className='rounded-md border border-white/10 bg-[#060d18] px-2 py-0.5 text-zinc-300 tabular-nums'>
        A: <b className='text-white'>{assists ?? 0}</b>
      </span>
      <span className='rounded-md border border-white/10 bg-[#060d18] px-2 py-0.5 text-zinc-300 tabular-nums'>
        Şut: <b className='text-white'>{shots ?? 0}</b>
      </span>
    </div>
  );
}

function TeamRosterDropdown({
  roster,
  currentProfileId,
  usedProfileIds,
  busy,
  onSave,
  onCancel,
}: {
  roster: RosterCandidate[];
  currentProfileId: string | null;
  usedProfileIds: Set<string>;
  busy: boolean;
  onSave: (profileId: string) => void;
  onCancel?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(currentProfileId ?? '');

  const isDuplicate = !!selectedId && selectedId !== currentProfileId && usedProfileIds.has(selectedId);
  const canSave = !!selectedId && !isDuplicate && !busy;

  return (
    <div className='mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#060d18] p-2.5' data-testid='team-roster-picker'>
      <select
        aria-label='Oyuncu seç'
        className={`${smallInputCls} min-w-[14rem] flex-1`}
        value={selectedId}
        disabled={busy}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        <option value=''>Oyuncu seç…</option>
        {roster.map((candidate) => {
          const takenByOther = candidate.id !== currentProfileId && usedProfileIds.has(candidate.id);
          return (
            <option key={candidate.id} value={candidate.id} disabled={takenByOther}>
              @{candidate.username}
              {candidate.fullName ? ` (${candidate.fullName})` : ''}
              {takenByOther ? ' — Bu maçta başka oyuncuya atandı' : ''}
            </option>
          );
        })}
      </select>
      <button
        type='button'
        className={`${miniBtnCls} bg-cyan-500 text-black hover:bg-cyan-400`}
        disabled={!canSave}
        onClick={() => {
          if (selectedId) onSave(selectedId);
        }}
      >
        {busy ? <Loader2 className='inline h-3.5 w-3.5 animate-spin' /> : <Check className='inline h-3.5 w-3.5' />}{' '}
        Eşleştirmeyi kaydet
      </button>
      {onCancel && (
        <button type='button' className={`${miniBtnCls} border border-white/10 bg-white/5 text-zinc-300 hover:text-white`} onClick={onCancel}>
          Vazgeç
        </button>
      )}
      {roster.length === 0 && (
        <span className='w-full text-[11px] text-amber-300'>
          Bu takımın seçili sezonda aktif kadro üyeliği bulunamadı.
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- draft (file content before sending to review)
function DraftPanel({
  m,
  onSaveLink,
  onToggleOow,
  onSend,
  onDelete,
  busy,
}: {
  m: any;
  onSaveLink: (eaPlayerId: string, profileId: string) => void;
  onToggleOow: () => void;
  onSend: () => void;
  onDelete: () => void;
  busy: string | null;
}) {
  const [changingId, setChangingId] = useState<string | null>(null);
  const undecided = m.outOfWindow && !m.outOfWindowAccepted;
  const canSend = m.errors.length === 0 && !undecided && !!m.sendHash;

  const usedProfileIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of m.players ?? []) {
      const activeId = p.linkedProfileId ?? (p.suggestion?.status === 'MATCHED' ? p.suggestion.profileId : null);
      if (activeId) set.add(activeId);
    }
    return set;
  }, [m.players]);

  const renderSide = (s: 'home' | 'away', title: string, roster: RosterCandidate[]) => {
    const players = m.players.filter((p: any) => p.side === s);
    return (
      <div className='min-w-0 rounded-xl border border-white/10 bg-[#07101f] p-4 space-y-3' data-testid={`side-${s}`}>
        <SideHeader title={title} count={players.length} side={s} rosterCount={roster.length} />
        <div className='space-y-2.5'>
          {players.map((p: any) => {
            const isLinked = !!p.linkedProfileId;
            const st: 'TO_LINK' | 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS' = isLinked
              ? 'TO_LINK'
              : p.suggestion.status;
            const matchedUsername = p.linkedUsername ?? p.suggestion.username ?? null;
            const currentProfileId = p.linkedProfileId ?? (p.suggestion.status === 'MATCHED' ? p.suggestion.profileId : null);
            const needsSelection = !isLinked && p.suggestion.status !== 'MATCHED';
            const showPicker = needsSelection || changingId === p.eaPlayerId;

            return (
              <div
                key={p.eaPlayerId}
                className='rounded-lg border border-white/10 bg-[#0b172a] p-3.5 space-y-2'
                data-testid='player-row'
                data-state={st}
              >
                <div className='flex flex-wrap items-start justify-between gap-2'>
                  <div className='min-w-0 space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='text-sm font-bold text-white'>
                        {p.stats.mom ? '⭐ ' : ''}
                        {p.eaPlayerName ?? '—'}
                      </span>
                    </div>
                    <PlayerStatPills
                      position={p.stats.position}
                      rating={p.stats.rating}
                      goals={p.stats.goals}
                      assists={p.stats.assists}
                      shots={p.stats.shots}
                    />
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <MatchBadge status={st} username={matchedUsername} />
                    {!needsSelection && (
                      <button
                        type='button'
                        className={`${miniBtnCls} border border-white/10 bg-white/5 text-zinc-300 hover:text-cyan-300`}
                        onClick={() => setChangingId(changingId === p.eaPlayerId ? null : p.eaPlayerId)}
                      >
                        {changingId === p.eaPlayerId ? 'Kapat' : 'Değiştir'}
                      </button>
                    )}
                  </div>
                </div>

                {p.suggestion.warning && !isLinked && (
                  <p className='text-xs text-amber-300'>{p.suggestion.warning}</p>
                )}

                {showPicker && (
                  <TeamRosterDropdown
                    roster={roster}
                    currentProfileId={currentProfileId}
                    usedProfileIds={usedProfileIds}
                    busy={busy !== null}
                    onSave={(profileId) => {
                      setChangingId(null);
                      onSaveLink(p.eaPlayerId, profileId);
                    }}
                    onCancel={!needsSelection ? () => setChangingId(null) : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className='mt-5 space-y-4 border-t border-white/10 pt-5' data-testid='review-panel' data-kind='draft'>
      {m.errors.map((e: any, i: number) => (
        <p key={i} className='flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200'>
          <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-red-400' />
          <span>
            <b>{e.code}</b> — {e.message}
          </span>
        </p>
      ))}
      {m.warnings.map((w: any, i: number) => (
        <p key={i} className='rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200'>
          {w.message}
        </p>
      ))}

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        {renderSide('home', m.homeName, m.homeRoster ?? [])}
        {renderSide('away', m.awayName, m.awayRoster ?? [])}
      </div>

      {m.outOfWindow && (
        <label className='flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200'>
          <input type='checkbox' checked={m.outOfWindowAccepted} onChange={onToggleOow} />
          Zaman aralığı dışında olduğunu biliyorum; yine de onay kuyruğuna gönder
        </label>
      )}

      <div className='flex flex-wrap items-center gap-3 pt-1'>
        <button
          type='button'
          className={`${btnCls} bg-emerald-500 text-black hover:bg-emerald-400`}
          disabled={!canSend || busy !== null}
          onClick={onSend}
        >
          {busy === m.eaMatchId ? <Loader2 className='inline h-3.5 w-3.5 animate-spin mr-1' /> : null}
          Onaya Gönder
        </button>
        <button
          type='button'
          className={`${btnCls} border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20`}
          disabled={busy !== null}
          title='Taslağı bu görünümden kaldırır; veritabanında kayıt olmadığından hiçbir kayıt silinmez'
          onClick={onDelete}
        >
          Listeden Kaldır
        </button>
        <span className='text-xs text-zinc-400'>
          Onaya Gönder maçı yalnızca <b>PENDING_REVIEW</b> durumuna taşır; nihai onay Maç Onay ekranındadır.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- stored match (PENDING_REVIEW / REJECTED / APPROVED)
const EDIT_FIELDS: [string, string][] = [
  ['goals', 'G'],
  ['assists', 'A'],
  ['shots', 'Şut'],
  ['passes_made', 'Pas'],
  ['pass_attempts', 'Pas den.'],
];
const INT_FIELDS = [
  'goals',
  'assists',
  'shots',
  'passes_made',
  'pass_attempts',
  'tackles_made',
  'tackle_attempts',
  'saves',
  'goals_conceded',
  'cleansheets_gk',
  'cleansheets_def',
  'red_cards',
];

function StatsEditor({
  row,
  onSaved,
  onCancel,
  setFb,
}: {
  row: any;
  onSaved: (updatedFields: Record<string, unknown>) => void;
  onCancel: () => void;
  setFb: (f: Feedback) => void;
}) {
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields: Record<string, unknown> = {};
    for (const k of INT_FIELDS) fields[k] = fd.has(k) ? Number(fd.get(k)) : row[k] ?? 0;
    const ratingRaw = String(fd.get('rating') ?? '').trim();
    fields.rating = ratingRaw === '' ? null : Number(ratingRaw);
    fields.is_mom = !!row.is_mom;
    setBusy(true);
    const res: any = await updatePlayerStatsAction(row.id, fields);
    setBusy(false);
    if (res.error) return setFb({ type: 'err', text: res.error });
    setFb({ type: 'ok', text: res.success ?? 'Oyuncu istatistikleri güncellendi.' });
    onSaved(fields);
  };
  return (
    <form
      onSubmit={submit}
      className='mt-2.5 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-[#060d18] p-3'
      data-testid='stats-editor'
    >
      <label className='text-xs text-zinc-400'>
        Puan
        <input
          name='rating'
          type='number'
          step='0.01'
          min='0'
          max='10'
          defaultValue={row.rating ?? ''}
          className={`${smallInputCls} mt-1 block w-16`}
        />
      </label>
      {EDIT_FIELDS.map(([k, label]) => (
        <label key={k} className='text-xs text-zinc-400'>
          {label}
          <input
            name={k}
            type='number'
            min='0'
            max='1000'
            required
            defaultValue={row[k] ?? 0}
            className={`${smallInputCls} mt-1 block w-14`}
          />
        </label>
      ))}
      <button type='submit' className={`${miniBtnCls} bg-cyan-500 text-black hover:bg-cyan-400`} disabled={busy}>
        {busy ? <Loader2 className='inline h-3.5 w-3.5 animate-spin' /> : null} İstatistiği Kaydet
      </button>
      <button type='button' className={`${miniBtnCls} border border-white/10 bg-white/5 text-zinc-300 hover:text-white`} onClick={onCancel}>
        Vazgeç
      </button>
    </form>
  );
}

function StoredPanel({ m, recordId, onChanged }: { m: any; recordId: string; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [fb, setFb] = useState<Feedback>(null);
  const [editStatsId, setEditStatsId] = useState<string | null>(null);
  const [changeProfileId, setChangeProfileId] = useState<string | null>(null);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [scoreBusy, setScoreBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getReviewMatchAction(recordId).then((res: any) => {
      if (alive) setData(res);
    });
    return () => {
      alive = false;
    };
  }, [recordId]);

  const usedProfileIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of data?.players ?? []) {
      if (p.player_id) set.add(p.player_id);
    }
    return set;
  }, [data?.players]);

  if (!data) {
    return (
      <p className='mt-4 text-xs text-zinc-400'>
        <Loader2 className='inline h-3.5 w-3.5 animate-spin mr-1' /> Maç detayları yükleniyor…
      </p>
    );
  }
  if (data.error) {
    return (
      <div className='mt-4'>
        <Note fb={{ type: 'err', text: data.error }} />
      </div>
    );
  }

  const { match, players, homeRoster = [], awayRoster = [] } = data;
  const editable = match.status !== 'APPROVED';

  const saveScore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nextHome = Number(fd.get('home_score'));
    const nextAway = Number(fd.get('away_score'));
    setScoreBusy(true);
    const res: any = await updateMatchScoreAction(match.id, nextHome, nextAway);
    setScoreBusy(false);
    if (res.error) return setFb({ type: 'err', text: res.error });
    setFb({ type: 'ok', text: res.success ?? 'Maç skoru güncellendi.' });
    setData((prev: any) =>
      prev ? { ...prev, match: { ...prev.match, home_score: nextHome, away_score: nextAway } } : prev
    );
    onChanged();
  };

  const handleSaveRosterPlayer = async (rowId: string, profileId: string) => {
    setSavingRowId(rowId);
    const res = await assignReviewMatchPlayerAction(rowId, profileId);
    setSavingRowId(null);
    if ('error' in res && res.error) {
      setFb({ type: 'err', text: res.error });
      return;
    }
    if ('success' in res && res.success) {
      setChangeProfileId(null);
      setFb({ type: 'ok', text: `Oyuncu eşleştirmesi kaydedildi: @${res.profile.username}` });
      setData((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p: any) =>
            p.id === rowId
              ? {
                  ...p,
                  player_id: res.profile.id,
                  username: res.profile.username,
                  fullName: res.profile.fullName,
                  identifierStatus: 'MATCHED',
                }
              : p
          ),
        };
      });
      onChanged();
    }
  };

  const sum = (s: string) => players.filter((p: any) => p.side === s).reduce((a: number, p: any) => a + (p.goals || 0), 0);

  const renderSide = (s: 'home' | 'away', title: string, roster: RosterCandidate[]) => {
    const list = players.filter((p: any) => p.side === s);
    return (
      <div className='min-w-0 rounded-xl border border-white/10 bg-[#07101f] p-4 space-y-3' data-testid={`side-${s}`}>
        <SideHeader title={title} count={list.length} side={s} rosterCount={roster.length} />
        <div className='space-y-2.5'>
          {list.map((p: any) => {
            const st: 'LINKED' | 'AMBIGUOUS' | 'UNMATCHED' = p.player_id
              ? 'LINKED'
              : p.identifierStatus === 'AMBIGUOUS'
              ? 'AMBIGUOUS'
              : 'UNMATCHED';
            const isUnmatched = !p.player_id;
            const showRosterDropdown = editable && (isUnmatched || changeProfileId === p.id);
            const showStatsEditor = editable && editStatsId === p.id;

            return (
              <div
                key={p.id}
                className='rounded-lg border border-white/10 bg-[#0b172a] p-3.5 space-y-2'
                data-testid='player-row'
                data-state={st}
              >
                <div className='flex flex-wrap items-start justify-between gap-2'>
                  <div className='min-w-0 space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='text-sm font-bold text-white'>
                        {p.is_mom ? '⭐ ' : ''}
                        {p.ea_player_name ?? '—'}
                      </span>
                    </div>
                    <PlayerStatPills
                      position={p.position}
                      rating={p.rating}
                      goals={p.goals}
                      assists={p.assists}
                      shots={p.shots}
                    />
                  </div>

                  <div className='flex flex-wrap items-center gap-2'>
                    <MatchBadge status={st} username={p.username} />
                    {editable && !isUnmatched && (
                      <button
                        type='button'
                        className={`${miniBtnCls} border border-white/10 bg-white/5 text-zinc-300 hover:text-cyan-300`}
                        onClick={() => setChangeProfileId(changeProfileId === p.id ? null : p.id)}
                      >
                        {changeProfileId === p.id ? 'Kapat' : 'Değiştir'}
                      </button>
                    )}
                    {editable && (
                      <button
                        type='button'
                        className={`${miniBtnCls} border border-white/10 bg-white/5 text-zinc-300 hover:text-cyan-300`}
                        onClick={() => setEditStatsId(editStatsId === p.id ? null : p.id)}
                      >
                        <Edit3 className='inline h-3 w-3 mr-1' />
                        İstatistik
                      </button>
                    )}
                  </div>
                </div>

                {showRosterDropdown && (
                  <TeamRosterDropdown
                    roster={roster}
                    currentProfileId={p.player_id ?? null}
                    usedProfileIds={usedProfileIds}
                    busy={savingRowId === p.id}
                    onSave={(profileId) => void handleSaveRosterPlayer(p.id, profileId)}
                    onCancel={!isUnmatched ? () => setChangeProfileId(null) : undefined}
                  />
                )}

                {showStatsEditor && (
                  <StatsEditor
                    row={p}
                    onSaved={(updatedFields) => {
                      setEditStatsId(null);
                      setData((prev: any) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          players: prev.players.map((row: any) =>
                            row.id === p.id ? { ...row, ...updatedFields } : row
                          ),
                        };
                      });
                      onChanged();
                    }}
                    onCancel={() => setEditStatsId(null)}
                    setFb={setFb}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className='mt-5 space-y-4 border-t border-white/10 pt-5' data-testid='review-panel' data-kind='stored'>
      <Note fb={fb} />
      <div className='flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#07101f] px-4 py-3 text-xs'>
        {editable ? (
          <form
            onSubmit={saveScore}
            className='flex flex-wrap items-center gap-2'
            data-testid='score-editor'
            key={`${match.home_score}-${match.away_score}`}
          >
            <span className='font-bold text-zinc-300'>Maç Skoru:</span>
            <input
              aria-label='Ev sahibi skoru'
              name='home_score'
              type='number'
              min='0'
              required
              defaultValue={match.home_score ?? 0}
              className={`${smallInputCls} w-16 text-center font-bold`}
            />
            <span className='font-bold text-zinc-500'>–</span>
            <input
              aria-label='Deplasman skoru'
              name='away_score'
              type='number'
              min='0'
              required
              defaultValue={match.away_score ?? 0}
              className={`${smallInputCls} w-16 text-center font-bold`}
            />
            <button type='submit' className={`${miniBtnCls} bg-cyan-500 text-black hover:bg-cyan-400`} disabled={scoreBusy}>
              {scoreBusy ? <Loader2 className='inline h-3.5 w-3.5 animate-spin' /> : null} Skoru Kaydet
            </button>
          </form>
        ) : (
          <span className='text-zinc-400'>
            Onaylanmış (APPROVED) maç salt okunurdur; değişiklik için Maç Onay ekranını kullanın.
          </span>
        )}
        <span
          className={`font-semibold ${
            sum('home') === match.home_score && sum('away') === match.away_score ? 'text-emerald-400' : 'text-amber-400'
          }`}
          data-testid='goal-check'
        >
          Oyuncu gol toplamı: {sum('home')} – {sum('away')} (Skor: {match.home_score} – {match.away_score})
        </span>
        <Link href='/admin/matches' className='ml-auto font-bold text-cyan-400 hover:underline'>
          Maç Onay ekranında aç (nihai onay) →
        </Link>
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        {renderSide('home', m.homeName, homeRoster)}
        {renderSide('away', m.awayName, awayRoster)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- main screen
export function EAImportManager({
  seasons,
  leagues,
  weeksByLeague,
}: {
  seasons: any[];
  leagues: any[];
  weeksByLeague: Record<string, number[]>;
}) {
  const [seasonId, setSeasonId] = useState(seasons.find((s) => s.status === 'ACTIVE')?.id || seasons[0]?.id || '');
  const [leagueId, setLeagueId] = useState('');
  const [week, setWeek] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [oow, setOow] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<Map<string, { eaMatchId: string; eaPlayerId: string; profileId: string }>>(new Map());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<any>(null);
  const [records, setRecords] = useState<Record<string, StoredSummary>>({});
  const [openId, setOpenId] = useState<string | null>(null); // only one match open at a time
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

  const collectAutoMatchedLinks = (p: any) => {
    const next = new Map<string, { eaMatchId: string; eaPlayerId: string; profileId: string }>();
    for (const pl of p?.plans ?? []) {
      for (const m of pl.matches ?? []) {
        for (const pp of m.players ?? []) {
          if (pp.suggestion?.status === 'MATCHED' && pp.suggestion.profileId) {
            const key = `${m.eaMatchId}:${pp.eaPlayerId}`;
            next.set(key, { eaMatchId: m.eaMatchId, eaPlayerId: pp.eaPlayerId, profileId: pp.suggestion.profileId });
          }
        }
      }
    }
    return next;
  };

  const run = async (o: Set<string> = oow, l: Map<string, any> = links, keepMsg = false, seedAutoLinks = false) => {
    setBusy('preview');
    if (!keepMsg) setMsg(null);
    const res: any = await previewJsonMatchesAction(form(o, l));
    if (res.error) {
      setBusy(null);
      setPreview(null);
      return setMsg({ type: 'err', text: res.error });
    }
    if (seedAutoLinks) {
      const autoLinks = collectAutoMatchedLinks(res.preview);
      if (autoLinks.size > 0) {
        setLinks(autoLinks);
        const seededRes: any = await previewJsonMatchesAction(form(o, autoLinks));
        setBusy(null);
        if (!seededRes.error) {
          setPreview(seededRes.preview);
          setRecords(seededRes.records ?? {});
          return;
        }
      }
    }
    setBusy(null);
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
    void run(next, links, true);
  };

  const saveDraftLink = async (eaMatchId: string, eaPlayerId: string, profileId: string) => {
    const key = `${eaMatchId}:${eaPlayerId}`;
    const next = new Map(links);
    next.set(key, { eaMatchId, eaPlayerId, profileId });
    setLinks(next);
    await run(oow, next, true);
    setMsg({ type: 'ok', text: 'Oyuncu eşleştirmesi sunucuda doğrulandı ve kaydedildi.' });
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
    setMsg({ type: 'ok', text: `${m.homeName} – ${m.awayName} maçı onay kuyruğuna gönderildi (PENDING_REVIEW).` });
    await run(oow, links, true);
  };

  const visible = (plan?.matches ?? []).filter((m: any) => !hidden.has(m.eaMatchId));

  return (
    <div className='text-white space-y-6'>
      <div className='rounded-xl border border-white/10 bg-[#0a1628] p-6'>
        <h2 className='mb-4 text-xs font-black uppercase tracking-widest text-cyan-400'>Dosya ve Hedef Seçimi</h2>
        <div className='flex flex-wrap items-end gap-4'>
          <label className='block text-[10px] font-bold uppercase tracking-widest text-zinc-400'>
            Sezon
            <select
              aria-label='Sezon'
              className={`${inputCls} mt-1 block`}
              value={seasonId}
              onChange={(e) => {
                setSeasonId(e.target.value);
                setLeagueId('');
                setWeek('');
                reset();
              }}
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className='block text-[10px] font-bold uppercase tracking-widest text-zinc-400'>
            Lig
            <select
              aria-label='Lig'
              className={`${inputCls} mt-1 block`}
              value={leagueId}
              onChange={(e) => {
                setLeagueId(e.target.value);
                setWeek('');
                reset();
              }}
            >
              <option value=''>Lig seçin…</option>
              {availableLeagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className='block text-[10px] font-bold uppercase tracking-widest text-zinc-400'>
            Hafta
            <select
              aria-label='Hafta'
              className={`${inputCls} mt-1 block`}
              value={week}
              onChange={(e) => {
                setWeek(e.target.value);
                reset();
              }}
              disabled={!leagueId}
            >
              <option value=''>Hafta seçin…</option>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  {w}. hafta
                </option>
              ))}
            </select>
          </label>
          <label className='block text-[10px] font-bold uppercase tracking-widest text-zinc-400'>
            JSON dosyası
            <input
              aria-label='JSON dosyası'
              type='file'
              accept='application/json,.json'
              className='mt-1 block text-sm text-zinc-300'
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                reset();
              }}
            />
          </label>
          <button
            type='button'
            className={`${btnCls} bg-cyan-500 text-black hover:bg-cyan-400`}
            disabled={busy !== null || !leagueId || !week || !file}
            onClick={() => {
              setHidden(new Set());
              void run(new Set(), new Map(), false, true);
            }}
          >
            {busy === 'preview' ? (
              <Loader2 className='inline h-4 w-4 animate-spin mr-1' />
            ) : (
              <FileCheck2 className='inline h-4 w-4 mr-1' />
            )}
            Doğrula ve Eşleştir
          </button>
        </div>
        <p className='mt-3 text-xs text-zinc-400'>
          Dosyanın şeması, checksum&apos;ı ve kimliği sunucuda doğrulanır; hedef sezon/lig/hafta seçiminizle karşılaştırılır.
        </p>
        {msg && (
          <div className='mt-3'>
            <Note fb={msg} />
          </div>
        )}
      </div>

      {plan && (
        <div className='space-y-4' data-testid='file-plan'>
          {preview.batchErrors.map((e: string, i: number) => (
            <p key={i} role='alert' className='rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200'>
              {e}
            </p>
          ))}
          {plan.rejections.map((r: string, i: number) => (
            <p key={i} role='alert' className='rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200'>
              {r}
            </p>
          ))}
          {plan.warnings.map((w: string, i: number) => (
            <p key={i} className='rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200'>
              {w}
            </p>
          ))}
          {plan.scope && (
            <p className='text-sm font-medium text-zinc-300' data-testid='plan-summary'>
              {plan.fileName} · {plan.scope.leagueName} · {plan.scope.weekNumber}. hafta · {visible.length} maç
            </p>
          )}

          {hidden.size > 0 && (
            <p className='rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-zinc-300' data-testid='hidden-note'>
              {hidden.size} taslak bu görünümden kaldırıldı. &ldquo;Doğrula ve Eşleştir&rdquo; ile geri getirebilirsiniz.
            </p>
          )}

          <div className='space-y-4'>
            {visible.map((m: any) => {
              const d = DELIVERY[m.delivery] ?? DELIVERY.DRAFT;
              const rec: StoredSummary | undefined = m.recordId ? records[m.recordId] : undefined;
              const homeScore = rec ? rec.homeScore : m.homeScore;
              const awayScore = rec ? rec.awayScore : m.awayScore;
              const total = rec ? rec.players : m.players.length;
              const matchedCount = rec
                ? rec.linked
                : m.players.filter((p: any) => p.linkedProfileId || p.suggestion?.status === 'MATCHED').length;
              const unmatchedCount = Math.max(0, total - matchedCount);
              const isOpen = openId === m.eaMatchId;
              const draftIssues = m.delivery === 'DRAFT' && (m.errors.length > 0 || (m.outOfWindow && !m.outOfWindowAccepted));

              return (
                <article
                  key={m.eaMatchId}
                  className={`rounded-xl border bg-[#0a1628] p-5 transition-colors ${
                    isOpen ? 'border-cyan-500/50 shadow-lg shadow-cyan-950/20' : 'border-white/10'
                  }`}
                  data-testid='match-card'
                  data-delivery={m.delivery}
                >
                  <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                    {/* Left: Week, Date, Match Status */}
                    <div className='flex flex-wrap items-center gap-2.5 lg:w-1/4'>
                      <span className={`rounded-md border px-2.5 py-1 text-xs font-black ${d.cls}`} data-testid='delivery'>
                        {d.label}
                      </span>
                      <span className='text-xs text-zinc-300' data-testid='card-date'>
                        {plan.scope?.weekNumber}. Hafta ·{' '}
                        {new Date(m.playedAt).toLocaleString('tr-TR', {
                          timeZone: 'Europe/Istanbul',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Center: Prominent Scoreboard */}
                    <div
                      className='flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#060d18] px-5 py-3 lg:flex-1'
                      data-testid='card-score'
                    >
                      <span className='flex-1 text-right text-sm font-black text-white sm:text-base' data-testid='home-name'>
                        {m.homeName}
                      </span>
                      <div className='flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1.5 text-lg font-black text-white tabular-nums'>
                        <span data-testid='home-score'>{homeScore ?? '–'}</span>
                        <span className='text-cyan-400'>:</span>
                        <span data-testid='away-score'>{awayScore ?? '–'}</span>
                      </div>
                      <span className='flex-1 text-left text-sm font-black text-white sm:text-base' data-testid='away-name'>
                        {m.awayName}
                      </span>
                    </div>

                    {/* Right: Matched/Unmatched Counts & Single İncele Button */}
                    <div className='flex flex-wrap items-center justify-between gap-3 lg:w-auto lg:justify-end'>
                      <div className='flex flex-wrap items-center gap-2 text-xs' data-testid='card-players'>
                        <span className='rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-300'>
                          {matchedCount} eşleşen
                        </span>
                        <span
                          className={`rounded-md border px-2.5 py-1 font-bold ${
                            unmatchedCount > 0
                              ? 'border-orange-500/30 bg-orange-500/15 text-orange-300'
                              : 'border-white/10 bg-white/5 text-zinc-400'
                          }`}
                        >
                          {unmatchedCount} eşleşmeyen
                        </span>
                        {draftIssues && (
                          <span className='inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-bold text-red-300'>
                            <AlertTriangle className='h-3.5 w-3.5' /> Karar/Hata var
                          </span>
                        )}
                      </div>

                      <button
                        type='button'
                        aria-expanded={isOpen}
                        className={`${btnCls} border ${
                          isOpen
                            ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                            : 'border-white/15 bg-white/5 text-white hover:border-cyan-500/40 hover:text-cyan-300'
                        }`}
                        onClick={() => setOpenId(isOpen ? null : m.eaMatchId)}
                      >
                        {isOpen ? (
                          <ChevronUp className='inline h-4 w-4 mr-1' />
                        ) : (
                          <ChevronDown className='inline h-4 w-4 mr-1' />
                        )}
                        İncele
                      </button>
                    </div>
                  </div>

                  {isOpen && m.delivery === 'DRAFT' && (
                    <DraftPanel
                      m={m}
                      busy={busy}
                      onSaveLink={(pid, prof) => void saveDraftLink(m.eaMatchId, pid, prof)}
                      onToggleOow={() => toggleOow(m.eaMatchId)}
                      onSend={() => void send(m)}
                      onDelete={() => {
                        setHidden(new Set(hidden).add(m.eaMatchId));
                        setOpenId(null);
                      }}
                    />
                  )}
                  {isOpen && m.delivery !== 'DRAFT' && m.recordId && (
                    <StoredPanel m={m} recordId={m.recordId} onChanged={() => void run(oow, links, true)} />
                  )}
                </article>
              );
            })}
          </div>
          {visible.length === 0 && plan.status !== 'REJECTED' && (
            <p className='text-sm text-zinc-400'>Gösterilecek maç kalmadı.</p>
          )}
        </div>
      )}
    </div>
  );
}
