'use client';

import { useState, useActionState, useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ArrowRight,
  Users,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { submitMatchAction } from '../actions';
import { MatchScreenshotUpload } from './MatchScreenshotUpload';
import { STARTING_LINEUP_COUNT, getRequiredLineupCount, type ReportPosition } from '@/lib/match-reporting';

interface SubmitMatchFormProps {
  fixture: any;
  homeTeam: any;
  awayTeam: any;
  teamId: string;
}

interface RosterPlayer {
  player_id: string;
  username: string;
  full_name: string | null;
  primary_position: ReportPosition;
}

interface LineupSlotStat {
  slotIndex: number;
  player_id: string;
  position: ReportPosition;
  rating: string;
  goals: number;
  assists: number;
  shots: number;
  passes_made: number;
  pass_attempts: number;
  tackles_made: number;
  tackle_attempts: number;
  saves: number;
  goals_conceded: number;
  cleansheets_gk: number;
  cleansheets_def: number;
  red_cards: number;
  is_mom: boolean;
}

const POSITIONS: ReportPosition[] = ['GK', 'DEF', 'MID', 'FWD'];

function createDefaultSlots(
  roster: RosterPlayer[],
  previousReportPlayers?: any[]
): LineupSlotStat[] {
  const targetSlotCount = getRequiredLineupCount(roster.length || STARTING_LINEUP_COUNT);
  if (Array.isArray(previousReportPlayers) && previousReportPlayers.length === targetSlotCount) {
    return previousReportPlayers.map((rp, idx) => ({
      slotIndex: idx,
      player_id: rp.player_id || '',
      position: (rp.position as ReportPosition) || 'MID',
      rating: rp.rating !== null && rp.rating !== undefined ? String(rp.rating) : '',
      goals: Number(rp.goals ?? 0),
      assists: Number(rp.assists ?? 0),
      shots: Number(rp.shots ?? 0),
      passes_made: Number(rp.passes_made ?? 0),
      pass_attempts: Number(rp.pass_attempts ?? 0),
      tackles_made: Number(rp.tackles_made ?? 0),
      tackle_attempts: Number(rp.tackle_attempts ?? 0),
      saves: Number(rp.saves ?? 0),
      goals_conceded: Number(rp.goals_conceded ?? 0),
      cleansheets_gk: Number(rp.cleansheets_gk ?? 0),
      cleansheets_def: Number(rp.cleansheets_def ?? 0),
      red_cards: Number(rp.red_cards ?? 0),
      is_mom: Boolean(rp.is_mom),
    }));
  }

  return Array.from({ length: targetSlotCount }, (_, idx) => {
    const prefilled = roster[idx];
    return {
      slotIndex: idx,
      player_id: prefilled ? prefilled.player_id : '',
      position: prefilled?.primary_position || (idx === 0 ? 'GK' : idx < 5 ? 'DEF' : idx < 8 ? 'MID' : 'FWD'),
      rating: '',
      goals: 0,
      assists: 0,
      shots: 0,
      passes_made: 0,
      pass_attempts: 0,
      tackles_made: 0,
      tackle_attempts: 0,
      saves: 0,
      goals_conceded: 0,
      cleansheets_gk: 0,
      cleansheets_def: 0,
      red_cards: 0,
      is_mom: false,
    };
  });
}

export function SubmitMatchForm({ fixture, homeTeam, awayTeam, teamId }: SubmitMatchFormProps) {
  const roster: RosterPlayer[] = useMemo(() => fixture?.teamRoster || [], [fixture?.teamRoster]);
  const myLatestReport = fixture?.myLatestReport || null;
  const opponentReport = fixture?.opponentReport || null;
  const existingMatch = fixture?.existingMatch || null;

  const isHomeCaptain = fixture.home_team_id === teamId;
  const myTeamName = isHomeCaptain ? homeTeam?.name : awayTeam?.name;
  const opponentTeamName = isHomeCaptain ? awayTeam?.name : homeTeam?.name;

  const [state, formAction, isPending] = useActionState(
    submitMatchAction as any,
    { error: '', success: '', matchId: '' } as any
  );

  const [homeScore, setHomeScore] = useState<string>(
    myLatestReport?.home_score !== undefined
      ? String(myLatestReport.home_score)
      : existingMatch?.home_score !== undefined
      ? String(existingMatch.home_score)
      : ''
  );
  const [awayScore, setAwayScore] = useState<string>(
    myLatestReport?.away_score !== undefined
      ? String(myLatestReport.away_score)
      : existingMatch?.away_score !== undefined
      ? String(existingMatch.away_score)
      : ''
  );
  const [screenshotUrl, setScreenshotUrl] = useState<string>(
    myLatestReport?.screenshot_url || ''
  );
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);

  const [slots, setSlots] = useState<LineupSlotStat[]>(() =>
    createDefaultSlots(roster, myLatestReport?.report_players)
  );

  const rosterMap = useMemo(() => {
    const map = new Map<string, RosterPlayer>();
    for (const p of roster) {
      map.set(p.player_id, p);
    }
    return map;
  }, [roster]);

  const selectedPlayerIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of slots) {
      if (s.player_id) set.add(s.player_id);
    }
    return set;
  }, [slots]);

  const selectedCount = selectedPlayerIds.size;
  const requiredLineupCount = getRequiredLineupCount(roster.length || STARTING_LINEUP_COUNT);

  const totalEnteredGoals = useMemo(
    () => slots.reduce((sum, s) => sum + (Number(s.goals) || 0), 0),
    [slots]
  );

  const myTargetTeamScore = isHomeCaptain
    ? parseInt(homeScore, 10)
    : parseInt(awayScore, 10);

  const handlePlayerSelect = (slotIdx: number, newPlayerId: string) => {
    setSlots((prev) => {
      // Prevent selecting a player already picked in another slot
      if (
        newPlayerId &&
        prev.some((s, i) => i !== slotIdx && s.player_id === newPlayerId)
      ) {
        return prev;
      }
      const rosterPlayer = rosterMap.get(newPlayerId);
      return prev.map((s, i) =>
        i === slotIdx
          ? {
              ...s,
              player_id: newPlayerId,
              position: rosterPlayer?.primary_position || s.position,
            }
          : s
      );
    });
  };

  const handleQuickToggleRosterPlayer = (player: RosterPlayer) => {
    setSlots((prev) => {
      const existingSlotIdx = prev.findIndex((s) => s.player_id === player.player_id);
      if (existingSlotIdx !== -1) {
        // Remove from that slot
        return prev.map((s, idx) =>
          idx === existingSlotIdx
            ? {
                ...s,
                player_id: '',
                goals: 0,
                assists: 0,
                rating: '',
                shots: 0,
                passes_made: 0,
                pass_attempts: 0,
                tackles_made: 0,
                tackle_attempts: 0,
                saves: 0,
                goals_conceded: 0,
                cleansheets_gk: 0,
                cleansheets_def: 0,
                red_cards: 0,
                is_mom: false,
              }
            : s
        );
      }

      // Find first empty slot
      const emptySlotIdx = prev.findIndex((s) => !s.player_id);
      if (emptySlotIdx === -1) return prev;

      return prev.map((s, idx) =>
        idx === emptySlotIdx
          ? {
              ...s,
              player_id: player.player_id,
              position: player.primary_position || s.position,
            }
          : s
      );
    });
  };

  const handleStatChange = (
    slotIdx: number,
    field: keyof LineupSlotStat,
    value: any
  ) => {
    setSlots((prev) =>
      prev.map((s, idx) => {
        if (field === 'is_mom') {
          return {
            ...s,
            is_mom: idx === slotIdx ? Boolean(value) : false,
          };
        }
        if (idx !== slotIdx) return s;

        if (field === 'position' || field === 'rating') {
          return { ...s, [field]: value };
        }

        const num = Math.max(0, Math.min(1000, parseInt(String(value), 10) || 0));
        return { ...s, [field]: num };
      })
    );
  };

  const handleAutoFillFirst11 = () => {
    setSlots(createDefaultSlots(roster));
  };

  const handleClearLineup = () => {
    setSlots((prev) =>
      prev.map((s) => ({
        ...s,
        player_id: '',
        rating: '',
        goals: 0,
        assists: 0,
        shots: 0,
        passes_made: 0,
        pass_attempts: 0,
        tackles_made: 0,
        tackle_attempts: 0,
        saves: 0,
        goals_conceded: 0,
        cleansheets_gk: 0,
        cleansheets_def: 0,
        red_cards: 0,
        is_mom: false,
      }))
    );
  };

  const serializedPlayers = useMemo(() => {
    const payload = slots
      .filter((s) => s.player_id)
      .map((s) => ({
        player_id: s.player_id,
        position: s.position,
        rating: s.rating !== '' ? Number(s.rating) : null,
        goals: s.goals,
        assists: s.assists,
        shots: s.shots,
        passes_made: s.passes_made,
        pass_attempts: s.pass_attempts,
        tackles_made: s.tackles_made,
        tackle_attempts: s.tackle_attempts,
        saves: s.saves,
        goals_conceded: s.goals_conceded,
        cleansheets_gk: s.cleansheets_gk,
        cleansheets_def: s.cleansheets_def,
        red_cards: s.red_cards,
        is_mom: s.is_mom,
      }));
    return JSON.stringify(payload);
  }, [slots]);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="fixture_id" value={fixture.id} />
      <input type="hidden" name="screenshot_url" value={screenshotUrl} />
      <input type="hidden" name="players_json" value={serializedPlayers} />

      {/* Dual-Reporting Context Banner */}
      <div className="bg-[#0b172a] border border-[#20b2aa]/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#20b2aa] shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-black text-white uppercase tracking-wider">
              RAPOR GÖNDEREN TAKIM: <span className="text-[#20b2aa]">{myTeamName}</span> ({isHomeCaptain ? 'EV SAHİBİ' : 'DEPLASMAN'})
            </div>
            <p className="text-[11px] font-bold text-gray-400 mt-0.5">
              Her iki takım kaptanı da bağımsız rapor gönderebilir. Yalnızca kendi takımınızın ({myTeamName}) ilk 11 kadrosunu ve oyuncu istatistiklerini girin.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded bg-white/5 border border-white/10 text-gray-300">
            Rakip ({opponentTeamName}):{' '}
            {opponentReport?.status === 'APPROVED' ? (
              <span className="text-emerald-400">Rapor Onaylandı</span>
            ) : opponentReport?.status === 'PENDING_REVIEW' ? (
              <span className="text-yellow-400">Rapor Gönderdi (İncelemede)</span>
            ) : (
              <span className="text-gray-400">Henüz Rapor Göndermedi</span>
            )}
          </span>
        </div>
      </div>

      {/* Rejected Report Alert if Re-submitting */}
      {myLatestReport?.status === 'REJECTED' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-black text-red-400 uppercase tracking-widest">
              ÖNCEKİ RAPORUNUZ REDDEDİLDİ — YENİDEN GÖNDERİM
            </div>
            <p className="text-xs font-bold text-gray-300 mt-1">
              Red Gerekçesi: {myLatestReport.rejection_reason || 'Belirtilmedi'}
            </p>
          </div>
        </div>
      )}

      {/* 1. Scoreboard & Match Info */}
      <div className="card-surface p-6 rounded-xl border border-white/5 space-y-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h2 className="text-sm font-black text-white uppercase tracking-widest">
            1. MAÇ SKORU VE KANIT BİLGİLERİ
          </h2>
          {fixture.matchday && (
            <span className="text-[10px] font-black text-[#00e5ff] uppercase tracking-widest px-2.5 py-1 bg-[#00e5ff]/10 rounded">
              {fixture.matchday}. HAFTA
            </span>
          )}
        </div>

        {/* Scoreboard Input */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 bg-[#0a1628] p-6 rounded-xl border border-white/5">
          <div className="flex flex-col items-center flex-1 text-center">
            <div className="text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest">
              Ev Sahibi {isHomeCaptain && <span className="text-[#20b2aa]">(SİZİN TAKIMINIZ)</span>}
            </div>
            <div className="font-bold text-white text-lg">{homeTeam?.name}</div>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="number"
              name="home_score"
              min="0"
              max="99"
              required
              value={homeScore}
              onChange={(e) => setHomeScore(e.target.value)}
              placeholder="0"
              className="w-16 h-16 text-center text-2xl font-black bg-[#060d18] border border-[#00e5ff]/50 rounded-xl text-white focus:outline-none focus:border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)]"
            />
            <span className="text-xl font-black text-gray-600">-</span>
            <input
              type="number"
              name="away_score"
              min="0"
              max="99"
              required
              value={awayScore}
              onChange={(e) => setAwayScore(e.target.value)}
              placeholder="0"
              className="w-16 h-16 text-center text-2xl font-black bg-[#060d18] border border-[#00e5ff]/50 rounded-xl text-white focus:outline-none focus:border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)]"
            />
          </div>

          <div className="flex flex-col items-center flex-1 text-center">
            <div className="text-[10px] font-black text-gray-500 mb-1 uppercase tracking-widest">
              Deplasman {!isHomeCaptain && <span className="text-[#20b2aa]">(SİZİN TAKIMINIZ)</span>}
            </div>
            <div className="font-bold text-white text-lg">{awayTeam?.name}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                Maç Tarihi / Saati
              </label>
              <input
                type="datetime-local"
                name="played_at"
                defaultValue={
                  myLatestReport?.played_at
                    ? new Date(myLatestReport.played_at).toISOString().slice(0, 16)
                    : fixture.scheduled_at
                    ? fixture.scheduled_at.slice(0, 16)
                    : ''
                }
                required
                className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-3 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                Notlar / Açıklama (Opsiyonel)
              </label>
              <textarea
                name="notes"
                rows={4}
                defaultValue={myLatestReport?.notes || ''}
                className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-3 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none resize-none"
                placeholder="Maçla ilgili belirtmek istediğiniz açıklama, beraberlik notu veya itiraz konusu varsa yazın..."
              />
            </div>
          </div>

          {/* Screenshot Upload Component */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Maç Sonu Performans / Kanıt Ekran Görüntüsü
            </label>
            <MatchScreenshotUpload
              teamId={teamId}
              value={screenshotUrl}
              onChange={(url) => setScreenshotUrl(url)}
              onUploadingChange={(uploading) => setIsUploadingScreenshot(uploading)}
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      {/* 2. Starting 11 Selection & Player Statistics */}
      <div className="card-surface p-6 rounded-xl border border-white/5 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00e5ff]" />
              <h2 className="text-sm font-black text-white uppercase tracking-widest">
                2. İLK 11 SEÇİMİ VE OYUNCU İSTATİSTİKLERİ ({myTeamName})
              </h2>
            </div>
            <p className="text-xs font-bold text-gray-400 mt-1">
              Takım kadronuzdan maçta oynayan 11 oyuncuyu seçin ve istatistiklerini girin. Aynı oyuncu birden fazla kez seçilemez.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-wider border ${
                selectedCount === requiredLineupCount
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400'
              }`}
            >
              Seçilen İlk 11: {selectedCount} / {requiredLineupCount}
            </span>
            {!Number.isNaN(myTargetTeamScore) && (
              <span
                className={`px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-wider border ${
                  totalEnteredGoals <= myTargetTeamScore
                    ? 'bg-[#00e5ff]/10 border-[#00e5ff]/30 text-[#00e5ff]'
                    : 'bg-red-500/10 border-red-500/40 text-red-400'
                }`}
              >
                Oyuncu Golleri: {totalEnteredGoals} / {myTargetTeamScore}
              </span>
            )}
          </div>
        </div>

        {/* Quick Roster Picker Pills */}
        {roster.length > 0 ? (
          <div className="bg-[#0a1628] border border-white/5 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                HIZLI KADRO SEÇİMİ (AKTİF KADRO: {roster.length} OYUNCU)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoFillFirst11}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#20b2aa]/15 border border-[#20b2aa]/40 text-[#20b2aa] text-[10px] font-black uppercase tracking-wider rounded hover:bg-[#20b2aa]/25 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  İlk 11&apos;i Otomatik Doldur
                </button>
                <button
                  type="button"
                  onClick={handleClearLineup}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 text-gray-400 text-[10px] font-black uppercase tracking-wider rounded hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Temizle
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {roster.map((player) => {
                const isSelected = selectedPlayerIds.has(player.player_id);
                return (
                  <button
                    key={player.player_id}
                    type="button"
                    onClick={() => handleQuickToggleRosterPlayer(player)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                      isSelected
                        ? 'bg-[#20b2aa]/20 border-[#20b2aa] text-white shadow-[0_0_10px_rgba(32,178,170,0.2)]'
                        : 'bg-[#060d18] border-white/10 text-gray-400 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white/10 text-[#00e5ff]">
                      {player.primary_position}
                    </span>
                    <span>@{player.username}</span>
                    {player.full_name && (
                      <span className="text-[10px] text-gray-400 hidden sm:inline">
                        ({player.full_name})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-xs font-bold">
            Takımınızın bu sezon için aktif kadrosunda kayıtlı oyuncu bulunamadı.
          </div>
        )}

        {/* 11 Starting Player Stat Cards (Mobile & Desktop Friendly) */}
        <div className="space-y-3">
          {slots.map((slot, idx) => {
            const selectedPlayer = rosterMap.get(slot.player_id);
            return (
              <div
                key={slot.slotIndex}
                className={`p-4 rounded-xl border transition-all ${
                  slot.player_id
                    ? 'bg-[#0a1628] border-white/10'
                    : 'bg-[#060d18]/60 border-dashed border-white/10'
                }`}
              >
                {/* Top Row: Slot #, Player Select, Team Badge, Position, Rating, MOM */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center mb-3 pb-3 border-b border-white/5">
                  <div className="sm:col-span-5 flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] text-xs font-black flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                        Oyuncu Seçimi ({myTeamName})
                      </label>
                      <select
                        value={slot.player_id}
                        onChange={(e) => handlePlayerSelect(idx, e.target.value)}
                        className="w-full bg-[#060d18] border border-white/15 rounded-lg px-2.5 py-2 text-xs font-bold text-white focus:border-[#00e5ff] focus:outline-none"
                      >
                        <option value="">-- {idx + 1}. Oyuncuyu Seçin --</option>
                        {roster.map((rp) => {
                          const takenElsewhere =
                            selectedPlayerIds.has(rp.player_id) &&
                            slot.player_id !== rp.player_id;
                          return (
                            <option
                              key={rp.player_id}
                              value={rp.player_id}
                              disabled={takenElsewhere}
                            >
                              @{rp.username}
                              {rp.full_name ? ` (${rp.full_name})` : ''} — {rp.primary_position}
                              {takenElsewhere ? ' [Seçildi]' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  <div className="sm:col-span-3 flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                        Mevki
                      </label>
                      <select
                        value={slot.position}
                        onChange={(e) =>
                          handleStatChange(idx, 'position', e.target.value as ReportPosition)
                        }
                        className="w-full bg-[#060d18] border border-white/15 rounded-lg px-2.5 py-2 text-xs font-black text-[#00e5ff] focus:border-[#00e5ff] focus:outline-none"
                      >
                        {POSITIONS.map((pos) => (
                          <option key={pos} value={pos}>
                            {pos}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-24">
                      <label className="block text-[9px] font-black text-yellow-400 uppercase tracking-widest mb-0.5">
                        Reyting
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        placeholder="7.5"
                        value={slot.rating}
                        onChange={(e) => handleStatChange(idx, 'rating', e.target.value)}
                        className="w-full bg-[#060d18] border border-yellow-500/30 rounded-lg px-2 py-2 text-xs font-black text-center text-yellow-400 focus:border-yellow-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4 flex items-center justify-between sm:justify-end gap-3">
                    {selectedPlayer && (
                      <div className="text-left sm:text-right truncate">
                        <div className="text-xs font-black text-white truncate">
                          @{selectedPlayer.username}
                        </div>
                        <div className="text-[10px] font-bold text-[#20b2aa] truncate">
                          {selectedPlayer.full_name || myTeamName}
                        </div>
                      </div>
                    )}

                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={slot.is_mom}
                        onChange={(e) => handleStatChange(idx, 'is_mom', e.target.checked)}
                        className="w-3.5 h-3.5 accent-yellow-400"
                      />
                      <span className="text-[10px] font-black text-yellow-400 uppercase tracking-wider">
                        ★ MOM
                      </span>
                    </label>
                  </div>
                </div>

                {/* Bottom Row: All Existing match_player_stats Numeric Inputs */}
                <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2">
                  <div>
                    <label className="block text-[9px] font-black text-emerald-400 uppercase tracking-wider mb-0.5">
                      Gol
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={slot.goals}
                      onChange={(e) => handleStatChange(idx, 'goals', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-emerald-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-sky-400 uppercase tracking-wider mb-0.5">
                      Asist
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={slot.assists}
                      onChange={(e) => handleStatChange(idx, 'assists', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-sky-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                      Şut
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={slot.shots}
                      onChange={(e) => handleStatChange(idx, 'shots', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-[#00e5ff] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                      İsb. Pas
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={slot.passes_made}
                      onChange={(e) => handleStatChange(idx, 'passes_made', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-[#00e5ff] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                      Top. Pas
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={slot.pass_attempts}
                      onChange={(e) => handleStatChange(idx, 'pass_attempts', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-[#00e5ff] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                      Bşr. Çalma
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={slot.tackles_made}
                      onChange={(e) => handleStatChange(idx, 'tackles_made', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-[#00e5ff] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                      Çalma Gir.
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={slot.tackle_attempts}
                      onChange={(e) => handleStatChange(idx, 'tackle_attempts', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-[#00e5ff] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-purple-400 uppercase tracking-wider mb-0.5">
                      Kurtarış
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={slot.saves}
                      onChange={(e) => handleStatChange(idx, 'saves', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-purple-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-orange-400 uppercase tracking-wider mb-0.5">
                      Yen. Gol
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={slot.goals_conceded}
                      onChange={(e) => handleStatChange(idx, 'goals_conceded', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-orange-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-teal-400 uppercase tracking-wider mb-0.5">
                      CS (GK)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      value={slot.cleansheets_gk}
                      onChange={(e) => handleStatChange(idx, 'cleansheets_gk', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-teal-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-teal-400 uppercase tracking-wider mb-0.5">
                      CS (DEF)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      value={slot.cleansheets_def}
                      onChange={(e) => handleStatChange(idx, 'cleansheets_def', e.target.value)}
                      className="w-full bg-[#060d18] border border-white/10 rounded px-2 py-1.5 text-xs font-bold text-center text-white focus:border-teal-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-red-400 uppercase tracking-wider mb-0.5">
                      Kırmızı
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      value={slot.red_cards}
                      onChange={(e) => handleStatChange(idx, 'red_cards', e.target.value)}
                      className="w-full bg-[#060d18] border border-red-500/20 rounded px-2 py-1.5 text-xs font-bold text-center text-red-400 focus:border-red-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {state?.error && (
        <div className="text-red-500 text-xs font-bold p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          {state.error}
        </div>
      )}

      {state?.success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{state.success}</span>
          </div>
          {state.matchId && (
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href={`/takim/yonet/maclar/${state.matchId}`}
                className="px-5 py-2.5 bg-[#00e5ff] text-black text-xs font-black rounded-lg tracking-widest hover:bg-[#00b8d4] transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] inline-flex items-center gap-2"
              >
                <span>OYUNCU İSTATİSTİKLERİNİ GİR / İNCELE</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/takim/yonet/maclar"
                className="px-4 py-2 bg-white/5 border border-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/10 transition-colors"
              >
                Maç Listesine Dön
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs font-bold text-gray-400">
          {selectedCount < requiredLineupCount ? (
            <span className="text-yellow-400">
              * Raporu göndermek için kadronuzdan tam {requiredLineupCount} oyuncu seçmelisiniz ({requiredLineupCount - selectedCount} eksik).
            </span>
          ) : (
            <span className="text-emerald-400">
              ✓ İlk 11 kadrosu tamamlandı ({requiredLineupCount}/{requiredLineupCount}). Onaya göndermeye hazır.
            </span>
          )}
        </div>

        <button
          disabled={isPending || isUploadingScreenshot}
          type="submit"
          className="w-full sm:w-auto px-8 py-3.5 bg-[#00e5ff] text-black text-xs font-black rounded-lg tracking-widest hover:bg-[#00b8d4] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(0,229,255,0.3)] cursor-pointer disabled:cursor-not-allowed"
        >
          {isPending
            ? 'GÖNDERİLİYOR...'
            : isUploadingScreenshot
            ? 'GÖRSEL YÜKLENİYOR...'
            : 'RAPORU VE SONUCU GÖNDER'}
        </button>
      </div>
    </form>
  );
}
