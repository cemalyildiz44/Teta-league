'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  FORMATIONS,
  FORMATION_KEYS,
  ROLE_GROUP_LABELS,
  isPlayerCompatibleWithSlot,
  selectAutoTotwLineup,
  type FormationKey,
  type FormationSlot,
  type RoleGroup,
  type TotwPlayerCandidate,
} from '@/lib/totw';
import {
  loadTotwWeekDataAction,
  submitAndLockTotwAction,
  type LoadTotwWeekResult,
} from './actions';

export interface TotwSeasonOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface TotwLeagueOption {
  id: string;
  season_id: string;
  name: string;
  slug: string;
  tier_order: number;
  is_active: boolean;
}

export interface TotwTrophyOption {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  category: string;
  target_type: string;
  season_id: string | null;
  season_name: string | null;
}

export interface LockedWeekSummary {
  seasonId: string;
  leagueId: string;
  weekNumber: number;
  formation: string;
  trophyId: string;
  isLocked: boolean;
  submittedAt: string;
}

export interface DraftLineupSlot {
  slot: FormationSlot;
  player: TotwPlayerCandidate | null;
  isManualOverride: boolean;
}

interface TotwManagerProps {
  seasons: TotwSeasonOption[];
  leagues: TotwLeagueOption[];
  weeksBySeasonLeague: Record<string, number[]>;
  trophies: TotwTrophyOption[];
  initialLockedWeeks: LockedWeekSummary[];
  initialSchemaPending: boolean;
}

const ROLE_BADGE_STYLES: Record<RoleGroup, string> = {
  GK: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  DEF: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  MID: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  FWD: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

export default function TotwManager({
  seasons,
  leagues,
  weeksBySeasonLeague,
  trophies,
  initialLockedWeeks,
  initialSchemaPending,
}: TotwManagerProps) {
  const defaultSeasonId = useMemo(() => {
    const active = seasons.find((s) => s.status === 'ACTIVE');
    return active?.id || seasons[0]?.id || '';
  }, [seasons]);

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(defaultSeasonId);

  const seasonLeagues = useMemo(
    () => leagues.filter((l) => l.season_id === selectedSeasonId),
    [leagues, selectedSeasonId]
  );

  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(() => {
    const first = leagues.find((l) => l.season_id === defaultSeasonId);
    return first?.id || '';
  });

  const availableWeeks = useMemo(() => {
    if (!selectedSeasonId || !selectedLeagueId) return [];
    return weeksBySeasonLeague[`${selectedSeasonId}:${selectedLeagueId}`] || [];
  }, [weeksBySeasonLeague, selectedSeasonId, selectedLeagueId]);

  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number | null>(null);
  const [selectedFormation, setSelectedFormation] = useState<FormationKey>('4-3-3');
  const [selectedTrophyId, setSelectedTrophyId] = useState<string>('');

  // Server data for the selected week
  const [weekData, setWeekData] = useState<LoadTotwWeekResult | null>(null);
  const [isLoadingWeek, setIsLoadingWeek] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Active 11 slots on pitch
  const [lineupSlots, setLineupSlots] = useState<DraftLineupSlot[]>([]);

  // Persisted locked weeks list (synced from server)
  const [lockedWeeks, setLockedWeeks] = useState<LockedWeekSummary[]>(initialLockedWeeks);

  // Replacement modal state
  const [replacingSlotKey, setReplacingSlotKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyCompatibleFilter, setOnlyCompatibleFilter] = useState<boolean>(true);

  // Confirmation modal & submission state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Filter trophies eligible for players and matching season (or global trophies without season restriction)
  const eligibleTrophies = useMemo(() => {
    return trophies.filter((t) => {
      if (t.target_type !== 'PLAYER' && t.target_type !== 'BOTH') return false;
      if (t.season_id && selectedSeasonId && t.season_id !== selectedSeasonId) return false;
      return true;
    });
  }, [trophies, selectedSeasonId]);

  // Auto-select a default TOTW trophy if available and none selected
  useEffect(() => {
    if (weekData?.lockedTotw) {
      setSelectedTrophyId(weekData.lockedTotw.trophyId);
      return;
    }
    if (selectedTrophyId && eligibleTrophies.some((t) => t.id === selectedTrophyId)) {
      return;
    }
    const totwNamed = eligibleTrophies.find((t) =>
      /totw|haftanın|haftanin|team of the week/i.test(t.title)
    );
    if (totwNamed) {
      setSelectedTrophyId(totwNamed.id);
    } else if (eligibleTrophies.length === 1) {
      setSelectedTrophyId(eligibleTrophies[0].id);
    } else {
      setSelectedTrophyId('');
    }
  }, [eligibleTrophies, selectedTrophyId, weekData?.lockedTotw]);

  const handleSeasonChange = (newSeasonId: string) => {
    setSelectedSeasonId(newSeasonId);
    const nextLeagues = leagues.filter((l) => l.season_id === newSeasonId);
    const nextLeagueId = nextLeagues[0]?.id || '';
    setSelectedLeagueId(nextLeagueId);
    setSelectedWeekNumber(null);
    setWeekData(null);
    setLineupSlots([]);
    setFeedbackBanner(null);
  };

  const handleLeagueChange = (newLeagueId: string) => {
    setSelectedLeagueId(newLeagueId);
    setSelectedWeekNumber(null);
    setWeekData(null);
    setLineupSlots([]);
    setFeedbackBanner(null);
  };

  const handleWeekChange = (weekVal: string) => {
    const parsed = parseInt(weekVal, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setSelectedWeekNumber(null);
      setWeekData(null);
      setLineupSlots([]);
    } else {
      setSelectedWeekNumber(parsed);
    }
    setFeedbackBanner(null);
  };

  const buildAutoSlots = useCallback(
    (candidates: TotwPlayerCandidate[], formation: FormationKey): DraftLineupSlot[] => {
      const auto = selectAutoTotwLineup(candidates, formation);
      return auto.assignments.map((s) => ({
        slot: s.slot,
        player: s.player,
        isManualOverride: false,
      }));
    },
    []
  );

  const buildLockedSlots = useCallback(
    (locked: NonNullable<LoadTotwWeekResult['lockedTotw']>): DraftLineupSlot[] => {
      const fKey = FORMATION_KEYS.includes(locked.formation) ? locked.formation : '4-3-3';
      const fSlots = FORMATIONS[fKey];
      return fSlots.map((fSlot) => {
        const saved = locked.slots.find(
          (s) => s.slotKey === fSlot.slotKey || s.slotIndex === fSlot.slotIndex
        );
        return {
          slot: saved
            ? {
                ...fSlot,
                slotKey: saved.slotKey,
                slotIndex: saved.slotIndex,
                roleGroup: saved.roleGroup,
                positionLabel: saved.positionLabel,
              }
            : fSlot,
          player: saved ? saved.player : null,
          isManualOverride: saved ? saved.isManualOverride : false,
        };
      });
    },
    []
  );

  // Fetch week data from server; if locked, directly hydrate from persisted DB record without recalculating
  const fetchWeekData = useCallback(
    async (
      seasonId: string,
      leagueId: string,
      weekNumber: number,
      currentFormation: FormationKey
    ): Promise<LoadTotwWeekResult | null> => {
      setIsLoadingWeek(true);
      setLoadError(null);
      try {
        const res = await loadTotwWeekDataAction({ seasonId, leagueId, weekNumber });
        if (!res.ok) {
          setLoadError(res.error || 'Hafta verisi yüklenemedi.');
          setWeekData(res);
          setLineupSlots([]);
          return res;
        }
        setWeekData(res);

        if (res.lockedTotw) {
          const locked = res.lockedTotw;
          setSelectedFormation(locked.formation);
          setSelectedTrophyId(locked.trophyId);
          setLineupSlots(buildLockedSlots(locked));
          // Sync lockedWeeks state from authoritative server record
          setLockedWeeks((prev) => [
            ...prev.filter(
              (lw) =>
                !(
                  lw.seasonId === locked.seasonId &&
                  lw.leagueId === locked.leagueId &&
                  lw.weekNumber === locked.weekNumber
                )
            ),
            {
              seasonId: locked.seasonId,
              leagueId: locked.leagueId,
              weekNumber: locked.weekNumber,
              formation: locked.formation,
              trophyId: locked.trophyId,
              isLocked: true,
              submittedAt: locked.submittedAt,
            },
          ]);
        } else {
          setLineupSlots(buildAutoSlots(res.candidates, currentFormation));
        }
        return res;
      } catch (err: any) {
        setLoadError(err?.message || 'Beklenmeyen bir hata oluştu.');
        return null;
      } finally {
        setIsLoadingWeek(false);
      }
    },
    [buildAutoSlots, buildLockedSlots]
  );

  useEffect(() => {
    if (!selectedSeasonId || !selectedLeagueId || !selectedWeekNumber) {
      setWeekData(null);
      setLineupSlots([]);
      return;
    }
    fetchWeekData(selectedSeasonId, selectedLeagueId, selectedWeekNumber, selectedFormation);
    // Only re-fetch from server when season/league/week changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeasonId, selectedLeagueId, selectedWeekNumber, fetchWeekData]);

  // When formation changes on an unlocked week, recalculate lineup immediately in client
  const handleFormationChange = (newFormation: FormationKey) => {
    if (weekData?.lockedTotw) return;
    setSelectedFormation(newFormation);
    if (weekData && weekData.ok) {
      setLineupSlots(buildAutoSlots(weekData.candidates, newFormation));
    }
  };

  const handleResetToAuto = () => {
    if (!weekData || weekData.lockedTotw) return;
    setLineupSlots(buildAutoSlots(weekData.candidates, selectedFormation));
    setFeedbackBanner(null);
  };

  const isLocked = Boolean(weekData?.lockedTotw);
  const hasValidFilterSelection = Boolean(
    selectedSeasonId && selectedLeagueId && selectedWeekNumber !== null
  );

  const filledSlotsCount = useMemo(
    () => lineupSlots.filter((s) => s.player !== null).length,
    [lineupSlots]
  );
  const missingSlotsCount = Math.max(0, 11 - filledSlotsCount);
  const hasManualOverrides = useMemo(
    () => lineupSlots.some((s) => s.isManualOverride),
    [lineupSlots]
  );

  const squadAvgRating = useMemo(() => {
    const filled = lineupSlots.filter((s) => s.player && s.player.effectiveRating > 0);
    if (filled.length === 0) return null;
    const sum = filled.reduce((acc, s) => acc + (s.player?.effectiveRating || 0), 0);
    return (sum / filled.length).toFixed(2);
  }, [lineupSlots]);

  const selectedPlayerIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of lineupSlots) {
      if (s.player?.playerId) set.add(s.player.playerId);
    }
    return set;
  }, [lineupSlots]);

  const activeReplacingSlot = useMemo(
    () => lineupSlots.find((s) => s.slot.slotKey === replacingSlotKey) || null,
    [lineupSlots, replacingSlotKey]
  );

  const modalCandidates = useMemo(() => {
    if (!weekData?.candidates || !activeReplacingSlot) return [];
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');

    return weekData.candidates.filter((c) => {
      if (onlyCompatibleFilter) {
        const compat = isPlayerCompatibleWithSlot(c, activeReplacingSlot.slot);
        if (!compat.compatible) return false;
      }
      if (!q) return true;
      const uMatch = c.username.toLocaleLowerCase('tr-TR').includes(q);
      const fMatch = (c.fullName || '').toLocaleLowerCase('tr-TR').includes(q);
      const tMatch = (c.teamName || '').toLocaleLowerCase('tr-TR').includes(q);
      const pMatch = (c.primaryPosition || '').toLocaleLowerCase('tr-TR').includes(q);
      return uMatch || fMatch || tMatch || pMatch;
    });
  }, [weekData?.candidates, activeReplacingSlot, searchQuery, onlyCompatibleFilter]);

  const handleOpenReplaceModal = (slotKey: string) => {
    if (isLocked) return;
    setReplacingSlotKey(slotKey);
    setSearchQuery('');
    setOnlyCompatibleFilter(true);
  };

  const handleSelectReplacementPlayer = (candidate: TotwPlayerCandidate) => {
    if (!activeReplacingSlot || isLocked) return;

    const existingSlot = lineupSlots.find(
      (s) =>
        s.slot.slotKey !== activeReplacingSlot.slot.slotKey &&
        s.player?.playerId === candidate.playerId
    );
    if (existingSlot) return;

    const compat = isPlayerCompatibleWithSlot(candidate, activeReplacingSlot.slot);
    if (!compat.compatible) return;

    setLineupSlots((prev) =>
      prev.map((item) =>
        item.slot.slotKey === activeReplacingSlot.slot.slotKey
          ? {
              ...item,
              player: candidate,
              isManualOverride: true,
            }
          : item
      )
    );
    setReplacingSlotKey(null);
  };

  const selectedSeasonObj = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) || null,
    [seasons, selectedSeasonId]
  );
  const selectedLeagueObj = useMemo(
    () => leagues.find((l) => l.id === selectedLeagueId) || null,
    [leagues, selectedLeagueId]
  );
  const selectedTrophyObj = useMemo(() => {
    if (weekData?.lockedTotw && weekData.lockedTotw.trophyId === selectedTrophyId) {
      const fromList = trophies.find((t) => t.id === selectedTrophyId);
      if (fromList) return fromList;
      return {
        id: weekData.lockedTotw.trophyId,
        title: weekData.lockedTotw.trophyTitle,
        description: null,
        image_url: weekData.lockedTotw.trophyImageUrl,
        category: weekData.lockedTotw.trophyCategory,
        target_type: 'PLAYER',
        season_id: selectedSeasonId,
        season_name: selectedSeasonObj?.name || null,
      };
    }
    return trophies.find((t) => t.id === selectedTrophyId) || null;
  }, [trophies, selectedTrophyId, weekData?.lockedTotw, selectedSeasonId, selectedSeasonObj]);

  const canSubmitTotw =
    hasValidFilterSelection &&
    !isLocked &&
    !isLoadingWeek &&
    lineupSlots.length === 11 &&
    missingSlotsCount === 0 &&
    Boolean(selectedTrophyId);

  const handleConfirmAndSendRewards = async () => {
    if (!canSubmitTotw || !selectedWeekNumber) return;
    setIsSubmitting(true);
    setFeedbackBanner(null);

    try {
      const payload = {
        seasonId: selectedSeasonId,
        leagueId: selectedLeagueId,
        weekNumber: selectedWeekNumber,
        formation: selectedFormation,
        trophyId: selectedTrophyId,
        slots: lineupSlots.map((s) => ({
          slotKey: s.slot.slotKey,
          slotIndex: s.slot.slotIndex,
          playerId: s.player!.playerId,
          isManualOverride: s.isManualOverride,
        })),
      };

      const result = await submitAndLockTotwAction(payload);
      if (!result.ok) {
        setFeedbackBanner({
          type: 'error',
          text: result.error || 'Ödüller gönderilirken bir hata oluştu.',
        });
        setIsConfirmModalOpen(false);
        return;
      }

      setIsConfirmModalOpen(false);

      // Reload authoritative persisted record from server and derive locked UI state from it
      const freshWeekData = await fetchWeekData(
        selectedSeasonId,
        selectedLeagueId,
        selectedWeekNumber,
        selectedFormation
      );

      if (freshWeekData?.lockedTotw) {
        setFeedbackBanner({
          type: 'success',
          text:
            result.message ||
            `${selectedWeekNumber}. Hafta TOTW ödülleri 11 oyuncuya başarıyla gönderildi ve hafta kapatıldı.`,
        });
      } else {
        setFeedbackBanner({
          type: 'error',
          text: 'Gönderim sonrası sunucu kaydı doğrulanamadı. Lütfen sayfayı yenileyin.',
        });
      }
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err?.message || 'Beklenmeyen bir hata oluştu.',
      });
      setIsConfirmModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isWeekLockedInSummary = useCallback(
    (weekNum: number) =>
      lockedWeeks.some(
        (lw) =>
          lw.seasonId === selectedSeasonId &&
          lw.leagueId === selectedLeagueId &&
          lw.weekNumber === weekNum
      ),
    [lockedWeeks, selectedSeasonId, selectedLeagueId]
  );

  return (
    <div className="space-y-4">
      {/* Unified Top Panel: Header + Filters + Week Status Strip */}
      <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
        {/* Compact Title Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-lg shrink-0">
              ⚽
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  TOTW (Haftanın Takımı)
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  İÇERİK YÖNETİMİ
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Haftalık onaylı maç performanslarına göre en iyi 11&apos;i belirleyin ve seçilen ödülü 11 oyuncuya dağıtın.
              </p>
            </div>
          </div>

          <Link
            href="/admin/achievements"
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-yellow-400 transition-colors whitespace-nowrap"
          >
            🏆 Başarı Yönetimi
          </Link>
        </div>

        {/* 4 Filters in One Clean Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Season Select (Always enabled) */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
              Sezon
            </label>
            <select
              value={selectedSeasonId}
              onChange={(e) => handleSeasonChange(e.target.value)}
              className="w-full bg-[#060d18] border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-[#00e5ff]"
            >
              <option value="">Sezon Seçin...</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.status === 'ACTIVE' ? '(Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 2. League Select (Always enabled when season is selected) */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
              Lig
            </label>
            <select
              value={selectedLeagueId}
              onChange={(e) => handleLeagueChange(e.target.value)}
              disabled={!selectedSeasonId || seasonLeagues.length === 0}
              className="w-full bg-[#060d18] border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-[#00e5ff] disabled:opacity-50"
            >
              <option value="">Lig Seçin...</option>
              {seasonLeagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Week Select (Always enabled when league is selected) */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
              Hafta
            </label>
            <select
              value={selectedWeekNumber ?? ''}
              onChange={(e) => handleWeekChange(e.target.value)}
              disabled={!selectedLeagueId || availableWeeks.length === 0}
              className="w-full bg-[#060d18] border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-[#00e5ff] disabled:opacity-50"
            >
              <option value="">
                {availableWeeks.length === 0
                  ? 'Fikstür Haftası Yok'
                  : 'Hafta Seçin...'}
              </option>
              {availableWeeks.map((w) => {
                const locked = isWeekLockedInSummary(w);
                return (
                  <option key={w} value={w}>
                    {w}. Hafta {locked ? '• Ödüller Gönderildi' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 4. Formation Select (Disabled when week is locked) */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
              Formasyon {isLocked && <span className="text-emerald-400">(Kaydedildi)</span>}
            </label>
            <select
              value={selectedFormation}
              onChange={(e) => handleFormationChange(e.target.value as FormationKey)}
              disabled={isLocked || !hasValidFilterSelection}
              className="w-full bg-[#060d18] border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-[#00e5ff] disabled:opacity-55 disabled:cursor-not-allowed"
            >
              {FORMATION_KEYS.map((fKey) => (
                <option key={fKey} value={fKey}>
                  {fKey} Dizilişi
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Bar Directly Under Filters when a Week is Selected */}
        {hasValidFilterSelection && !isLoadingWeek && weekData && weekData.ok && (
          <div
            className={`rounded-xl px-4 py-2.5 border flex flex-wrap items-center justify-between gap-3 ${
              isLocked
                ? 'bg-emerald-500/10 border-emerald-500/35'
                : 'bg-[#060d18]/90 border-white/10'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              {isLocked && weekData.lockedTotw ? (
                <>
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                    <span>✓</span> Ödüller Gönderildi
                  </span>
                  <span className="text-xs font-bold text-white">
                    {selectedSeasonObj?.name} • {selectedLeagueObj?.name} •{' '}
                    {selectedWeekNumber}. Hafta
                  </span>
                  <span className="text-xs text-gray-300">
                    • Ödül:{' '}
                    <strong className="text-yellow-400">
                      {weekData.lockedTotw.trophyTitle}
                    </strong>
                  </span>
                  <span className="text-xs text-gray-400">
                    • Gönderim:{' '}
                    {new Date(weekData.lockedTotw.submittedAt).toLocaleString('tr-TR')}
                  </span>
                </>
              ) : (
                <>
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/35">
                    Taslak
                  </span>
                  <span className="text-xs font-bold text-white">
                    {selectedSeasonObj?.name} • {selectedLeagueObj?.name} •{' '}
                    {selectedWeekNumber}. Hafta
                  </span>
                  <span className="text-xs font-bold text-gray-300">
                    • Onaylı Maç:{' '}
                    <strong className="text-[#00e5ff]">
                      {weekData.approvedMatchCount} / {weekData.totalFixtureCount}
                    </strong>
                  </span>
                  <span className="text-xs font-bold text-gray-300">
                    • Kadro:{' '}
                    <strong
                      className={
                        missingSlotsCount === 0 ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {filledSlotsCount} / 11
                    </strong>
                  </span>
                  {missingSlotsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {missingSlotsCount} Eksik Pozisyon
                    </span>
                  )}
                </>
              )}
            </div>

            {!isLocked && hasManualOverrides && (
              <button
                type="button"
                onClick={handleResetToAuto}
                className="text-xs font-bold text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-3 py-1 rounded-lg transition-colors"
              >
                ↺ Otomatik Seçime Sıfırla
              </button>
            )}
          </div>
        )}
      </div>

      {/* Schema Pending Warning */}
      {(initialSchemaPending || weekData?.isSchemaPending) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-200">
          <span className="font-black uppercase tracking-wider mr-2">
            ⚠️ Veritabanı Tablosu Bekleniyor:
          </span>
          <span className="text-amber-300/90">
            Ödül gönderimi ve kayıt için <code>20261019000000_admin_totw_system.sql</code> migration dosyasının veritabanında uygulanmış olması gerekir.
          </span>
        </div>
      )}

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`rounded-xl px-4 py-3 border text-xs sm:text-sm font-bold flex items-center justify-between gap-4 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-red-500/15 border-red-500/40 text-red-300'
          }`}
        >
          <span>{feedbackBanner.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs opacity-75 hover:opacity-100 px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Empty State when Season, League, or Week is not selected */}
      {!hasValidFilterSelection && (
        <div className="bg-[#0a1628] border border-dashed border-white/15 rounded-2xl p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center mx-auto mb-3 text-xl">
            ⚽
          </div>
          <h2 className="text-base sm:text-lg font-black text-white mb-1">
            TOTW Kadrosunu Görüntülemek İçin Hafta Seçin
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto">
            Üst panelden <strong>Sezon</strong>, <strong>Lig</strong> ve{' '}
            <strong>Hafta</strong> seçtiğinizde o haftanın onaylanmış maç istatistiklerine göre Haftanın Takımı otomatik olarak sahaya dizilir.
          </p>
        </div>
      )}

      {/* Loading State */}
      {hasValidFilterSelection && isLoadingWeek && (
        <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-10 text-center">
          <div className="inline-block w-7 h-7 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin mb-2.5" />
          <p className="text-xs sm:text-sm font-bold text-gray-300">
            {selectedWeekNumber}. Hafta TOTW verileri yükleniyor...
          </p>
        </div>
      )}

      {/* Error State */}
      {hasValidFilterSelection && !isLoadingWeek && loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-center">
          <p className="text-sm font-bold text-red-300">{loadError}</p>
        </div>
      )}

      {/* Main Content: Pitch Centerpiece + Squad Summary + Award Submission Bar Below Pitch */}
      {hasValidFilterSelection && !isLoadingWeek && weekData && weekData.ok && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Primary Focus Column: Vertical Football Pitch + Award Submission Area Below Pitch (8 cols on lg) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Compact contextual hint when draft has missing slots */}
            {!isLocked && missingSlotsCount > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-3">
                <span>
                  {weekData.approvedMatchCount === 0 ? (
                    <>
                      <strong>Onaylı Maç Yok:</strong> Bu haftada henüz onaylanmış maç bulunmuyor. Boş pozisyon kartlarındaki <strong>Değiştir</strong> butonuyla lig oyuncularını manuel seçebilirsiniz.
                    </>
                  ) : (
                    <>
                      <strong>{missingSlotsCount} Boş Pozisyon:</strong> Bu formasyondaki bazı mevkiler için yeterli onaylı maç verisi bulunamadı. Boş kartlardaki <strong>Değiştir</strong> butonuyla uygun pozisyondaki oyuncuları seçebilirsiniz.
                    </>
                  )}
                </span>
              </div>
            )}

            {/* Large Vertical Football Pitch */}
            <div className="relative w-full aspect-[3/4] sm:aspect-[10/12] max-w-[820px] mx-auto rounded-3xl overflow-hidden border-2 border-emerald-500/35 shadow-2xl bg-[#072618] select-none">
              {/* Grass Stripes & Radial Glow */}
              <div
                className="absolute inset-0 opacity-90"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(to bottom, rgba(16,185,129,0.08) 0px, rgba(16,185,129,0.08) 52px, rgba(6,78,59,0.18) 52px, rgba(6,78,59,0.18) 104px)',
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle at 50% 50%, rgba(16,185,129,0.14) 0%, rgba(4,18,12,0.78) 100%)',
                }}
              />

              {/* Pitch Lines SVG */}
              <svg
                viewBox="0 0 600 750"
                className="absolute inset-0 w-full h-full pointer-events-none opacity-35"
                preserveAspectRatio="none"
              >
                <rect
                  x="22"
                  y="22"
                  width="556"
                  height="706"
                  fill="none"
                  stroke="#a7f3d0"
                  strokeWidth="2.5"
                />
                <line
                  x1="22"
                  y1="375"
                  x2="578"
                  y2="375"
                  stroke="#a7f3d0"
                  strokeWidth="2"
                />
                <circle
                  cx="300"
                  cy="375"
                  r="68"
                  fill="none"
                  stroke="#a7f3d0"
                  strokeWidth="2"
                />
                <circle cx="300" cy="375" r="4" fill="#a7f3d0" />

                {/* Top penalty box */}
                <rect
                  x="150"
                  y="22"
                  width="300"
                  height="112"
                  fill="none"
                  stroke="#a7f3d0"
                  strokeWidth="2"
                />
                <rect
                  x="220"
                  y="22"
                  width="160"
                  height="44"
                  fill="none"
                  stroke="#a7f3d0"
                  strokeWidth="2"
                />
                <path
                  d="M 245 134 A 55 55 0 0 0 355 134"
                  fill="none"
                  stroke="#a7f3d0"
                  strokeWidth="2"
                />

                {/* Bottom penalty box */}
                <rect
                  x="150"
                  y="616"
                  width="300"
                  height="112"
                  fill="none"
                  stroke="#a7f3d0"
                  strokeWidth="2"
                />
                <rect
                  x="220"
                  y="684"
                  width="160"
                  height="44"
                  fill="none"
                  stroke="#a7f3d0"
                  strokeWidth="2"
                />
                <path
                  d="M 245 616 A 55 55 0 0 1 355 616"
                  fill="none"
                  stroke="#a7f3d0"
                  strokeWidth="2"
                />
              </svg>

              {/* Pitch Top Overlay Bar */}
              <div className="absolute top-3 left-5 right-5 flex items-center justify-between pointer-events-none z-10">
                <span className="text-[10px] font-black tracking-widest uppercase text-emerald-300/80">
                  TETA LEAGUE • {selectedWeekNumber}. HAFTA TOTW
                </span>
                <span className="px-2 py-0.5 rounded bg-black/35 border border-emerald-400/25 text-[10px] font-black tracking-widest uppercase text-emerald-300">
                  {selectedFormation}
                </span>
              </div>

              {/* 11 Formation Slot Cards */}
              {lineupSlots.map(({ slot, player, isManualOverride }) => {
                const ratingLabel =
                  player && player.effectiveRating > 0
                    ? player.effectiveRating.toFixed(1)
                    : '—';

                return (
                  <div
                    key={slot.slotKey}
                    style={{
                      left: `${slot.x}%`,
                      top: `${slot.y}%`,
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center w-[82px] xs:w-[94px] sm:w-[116px] md:w-[126px]"
                  >
                    {/* Card Container */}
                    <div
                      className={`w-full rounded-xl sm:rounded-2xl border backdrop-blur-md px-1.5 py-1.5 sm:px-2.5 sm:py-2 shadow-lg transition-all ${
                        player
                          ? isManualOverride
                            ? 'bg-[#091526]/95 border-cyan-400/65 shadow-cyan-500/15'
                            : 'bg-[#091526]/92 border-emerald-400/45 shadow-black/50'
                          : 'bg-[#091526]/80 border-dashed border-amber-400/55'
                      }`}
                    >
                      {/* Top Row: Position Badge + Rating Badge */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span
                          className={`px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-black tracking-wider border ${
                            ROLE_BADGE_STYLES[slot.roleGroup]
                          }`}
                        >
                          {slot.positionLabel}
                        </span>
                        {player ? (
                          <span className="px-1 sm:px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] sm:text-[10px] font-black">
                            {ratingLabel}
                          </span>
                        ) : (
                          <span className="text-[8px] sm:text-[9px] font-bold text-amber-300/80">
                            Boş
                          </span>
                        )}
                      </div>

                      {player ? (
                        <>
                          {/* Avatar + Team Logo */}
                          <div className="relative w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-1">
                            {player.avatarUrl ? (
                              <img
                                src={player.avatarUrl}
                                alt={player.username}
                                className="w-full h-full rounded-full object-cover border-2 border-white/20 bg-[#060d18]"
                              />
                            ) : (
                              <div className="w-full h-full rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 border-2 border-white/20 flex items-center justify-center text-[10px] sm:text-xs font-black text-white">
                                {player.username.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            {player.teamLogo && (
                              <img
                                src={player.teamLogo}
                                alt={player.teamName || ''}
                                title={player.teamName || ''}
                                className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full object-contain bg-[#060d18] border border-white/25 absolute -bottom-0.5 -right-0.5 p-0.5"
                              />
                            )}
                          </div>

                          {/* Username */}
                          <div
                            className="text-[10px] sm:text-xs font-black text-white text-center truncate leading-tight"
                            title={player.username}
                          >
                            {player.username}
                          </div>

                          {/* Team Name */}
                          <div
                            className="text-[8px] sm:text-[10px] font-semibold text-gray-400 text-center truncate leading-tight mt-0.5"
                            title={player.teamName || 'Takımsız'}
                          >
                            {player.teamName || '—'}
                          </div>
                        </>
                      ) : (
                        <div className="py-1.5 sm:py-2.5 text-center">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-amber-500/15 border border-amber-500/35 flex items-center justify-center mx-auto mb-1 text-amber-300 text-[10px] sm:text-xs font-black">
                            +
                          </div>
                          <div className="text-[9px] sm:text-[10px] font-bold text-amber-300 truncate">
                            Boş Pozisyon
                          </div>
                          <div className="text-[8px] sm:text-[9px] text-gray-400 truncate">
                            {ROLE_GROUP_LABELS[slot.roleGroup]}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Değiştir Button Under Each Slot (Hidden/Disabled when locked) */}
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => handleOpenReplaceModal(slot.slotKey)}
                        className="mt-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-[#0a1628]/95 hover:bg-[#00e5ff] text-gray-200 hover:text-[#060d18] border border-white/20 hover:border-[#00e5ff] text-[9px] sm:text-[10px] font-black tracking-wide transition-colors shadow"
                      >
                        Değiştir
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Prominent Award Selection & Submission Bar Directly Below the Pitch */}
            <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                {/* TOTW Ödülü Selector */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-black uppercase tracking-wider text-white">
                      TOTW Ödülü
                    </label>
                    {eligibleTrophies.length === 0 && !isLocked && (
                      <Link
                        href="/admin/achievements"
                        className="text-[11px] font-bold text-yellow-400 hover:underline"
                      >
                        + Başarı Yönetimi&apos;nden Ödül Oluştur
                      </Link>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <select
                      value={selectedTrophyId}
                      onChange={(e) => setSelectedTrophyId(e.target.value)}
                      disabled={isLocked || eligibleTrophies.length === 0}
                      className="flex-1 bg-[#060d18] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="">
                        {eligibleTrophies.length === 0
                          ? 'Uygun Oyuncu Ödülü Bulunamadı'
                          : 'TOTW Ödülü Seçin...'}
                      </option>
                      {eligibleTrophies.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.category})
                        </option>
                      ))}
                    </select>

                    {selectedTrophyObj && (
                      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#060d18] border border-white/10 shrink-0">
                        {selectedTrophyObj.image_url ? (
                          <img
                            src={selectedTrophyObj.image_url}
                            alt={selectedTrophyObj.title}
                            className="w-8 h-8 rounded object-contain bg-white/5 p-0.5 border border-white/10"
                          />
                        ) : (
                          <span className="text-base">🏆</span>
                        )}
                        <div className="text-xs">
                          <div className="font-black text-yellow-400 truncate max-w-[180px]">
                            {selectedTrophyObj.title}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate max-w-[180px]">
                            {selectedTrophyObj.category}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Single Action Button: Ödülleri Gönder */}
                <div className="w-full md:w-auto shrink-0">
                  <button
                    type="button"
                    disabled={!canSubmitTotw || isSubmitting || isLocked}
                    onClick={() => setIsConfirmModalOpen(true)}
                    className={`w-full md:w-auto min-w-[210px] py-3 px-6 rounded-xl font-black text-sm uppercase tracking-wider transition-all ${
                      isLocked
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-[#060d18] shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    {isLocked
                      ? '✓ Ödüller Gönderildi'
                      : isSubmitting
                      ? 'Gönderiliyor...'
                      : 'Ödülleri Gönder'}
                  </button>
                </div>
              </div>

              {/* Validation Helper Line */}
              {!isLocked && (!selectedTrophyId || missingSlotsCount > 0) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-4 text-[11px] text-amber-400 font-semibold">
                  {missingSlotsCount > 0 && (
                    <span>
                      • Ödülleri göndermek için 11 pozisyonun tamamı dolu olmalıdır ({missingSlotsCount} pozisyon boş).
                    </span>
                  )}
                  {!selectedTrophyId && (
                    <span>• Ödülleri göndermek için bir TOTW ödülü seçmelisiniz.</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Squad Summary & 11 Players List (4 cols on lg) */}
          <div className="lg:col-span-4">
            <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">
                    Seçilen 11 ve Kadro Özeti
                  </h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {selectedFormation} Dizilişi • {filledSlotsCount}/11 Oyuncu
                    {squadAvgRating ? ` • Ort. Reyting: ${squadAvgRating}` : ''}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                    isLocked
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  }`}
                >
                  {isLocked ? 'Ödüller Gönderildi' : 'Taslak'}
                </span>
              </div>

              <div className="divide-y divide-white/5">
                {lineupSlots.map(({ slot, player, isManualOverride }) => (
                  <div
                    key={slot.slotKey}
                    className="py-2 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-9 text-center py-0.5 rounded text-[10px] font-black border shrink-0 ${
                          ROLE_BADGE_STYLES[slot.roleGroup]
                        }`}
                      >
                        {slot.positionLabel}
                      </span>

                      {player ? (
                        <div className="flex items-center gap-2 min-w-0">
                          {player.avatarUrl ? (
                            <img
                              src={player.avatarUrl}
                              alt={player.username}
                              className="w-7 h-7 rounded-full object-cover border border-white/15 bg-[#060d18] shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                              {player.username.slice(0, 2).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white truncate">
                                {player.username}
                              </span>
                              {isManualOverride && !isLocked && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                                  Manuel
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate">
                              {player.teamName || 'Takımsız'} •{' '}
                              <strong className="text-emerald-400">
                                {player.effectiveRating > 0
                                  ? player.effectiveRating.toFixed(1)
                                  : '—'}
                              </strong>
                              {slot.roleGroup === 'GK'
                                ? player.saves > 0
                                  ? ` • ${player.saves} Kurtarış`
                                  : ''
                                : player.goals > 0 || player.assists > 0
                                ? ` • ${player.goals}G ${player.assists}A`
                                : ''}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-amber-400">
                          Boş Pozisyon ({ROLE_GROUP_LABELS[slot.roleGroup]})
                        </span>
                      )}
                    </div>

                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => handleOpenReplaceModal(slot.slotKey)}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-gray-300 hover:text-white shrink-0"
                      >
                        Değiştir
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Player Replacement Modal */}
      {replacingSlotKey && activeReplacingSlot && !isLocked && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a1628] border border-white/15 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                      ROLE_BADGE_STYLES[activeReplacingSlot.slot.roleGroup]
                    }`}
                  >
                    {activeReplacingSlot.slot.positionLabel} (
                    {ROLE_GROUP_LABELS[activeReplacingSlot.slot.roleGroup]})
                  </span>
                  {activeReplacingSlot.player && (
                    <span className="text-xs text-gray-400">
                      Mevcut:{' '}
                      <strong className="text-white">
                        {activeReplacingSlot.player.username}
                      </strong>
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  Pozisyon İçin Oyuncu Seç / Değiştir
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setReplacingSlotKey(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Search & Filter Controls */}
            <div className="p-3.5 sm:p-4 border-b border-white/10 bg-[#060d18]/60 flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Oyuncu kullanıcı adı, isim veya takım ara..."
                autoFocus
                className="flex-1 bg-[#0a1628] border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00e5ff]"
              />
              <label className="flex items-center gap-2 text-xs font-bold text-gray-300 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={onlyCompatibleFilter}
                  onChange={(e) => setOnlyCompatibleFilter(e.target.checked)}
                  className="rounded border-white/20 text-[#00e5ff] focus:ring-0"
                />
                Sadece Uygun Pozisyonlar (
                {ROLE_GROUP_LABELS[activeReplacingSlot.slot.roleGroup]})
              </label>
            </div>

            {/* Candidate List */}
            <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2">
              {modalCandidates.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">
                  Arama kriterlerine uygun oyuncu bulunamadı.
                </div>
              ) : (
                modalCandidates.map((cand) => {
                  const isCurrentSlotPlayer =
                    activeReplacingSlot.player?.playerId === cand.playerId;
                  const isAlreadyInOtherSlot =
                    !isCurrentSlotPlayer && selectedPlayerIds.has(cand.playerId);
                  const compat = isPlayerCompatibleWithSlot(
                    cand,
                    activeReplacingSlot.slot
                  );
                  const disabled =
                    isCurrentSlotPlayer || isAlreadyInOtherSlot || !compat.compatible;

                  return (
                    <div
                      key={cand.playerId}
                      className={`p-3 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                        disabled
                          ? 'opacity-55 bg-transparent'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {cand.avatarUrl ? (
                          <img
                            src={cand.avatarUrl}
                            alt={cand.username}
                            className="w-10 h-10 rounded-full object-cover border border-white/15 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-xs font-black text-white shrink-0">
                            {cand.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-white truncate">
                              {cand.username}
                            </span>
                            {cand.roleGroup && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${
                                  ROLE_BADGE_STYLES[cand.roleGroup]
                                }`}
                              >
                                {cand.matchPosition || cand.primaryPosition || cand.roleGroup}
                              </span>
                            )}
                            {cand.playedInWeek ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                Reyting: {cand.effectiveRating.toFixed(1)}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-gray-400">
                                Bu hafta maç verisi yok
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                            <span>{cand.teamName || 'Takımsız'}</span>
                            {cand.playedInWeek && (
                              <span>
                                • {cand.matchesPlayed} Maç • {cand.goals} G • {cand.assists} A
                                {cand.saves > 0 ? ` • ${cand.saves} Kurtarış` : ''}
                              </span>
                            )}
                          </div>

                          {!compat.compatible && compat.reason && (
                            <div className="text-[11px] text-red-400 font-semibold mt-0.5">
                              ⚠️ {compat.reason}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isCurrentSlotPlayer ? (
                          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black">
                            Seçili
                          </span>
                        ) : isAlreadyInOtherSlot ? (
                          <span className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold">
                            Kadroda Var
                          </span>
                        ) : !compat.compatible ? (
                          <span className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 border border-red-500/30 text-xs font-bold">
                            Uyumsuz Pozisyon
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectReplacementPlayer(cand)}
                            className="px-3.5 py-1.5 rounded-xl bg-[#00e5ff] hover:bg-cyan-300 text-[#060d18] text-xs font-black transition-colors"
                          >
                            Seç
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal (Opened when clicking Ödülleri Gönder) */}
      {isConfirmModalOpen && !isLocked && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a1628] border border-white/15 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                ÖDÜL GÖNDERİM ONAYI
              </span>
              <h3 className="text-xl font-black text-white mt-1">
                TOTW Ödüllerini Gönder
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Onayladığınızda seçilen TOTW kadrosu kaydedilecek, 11 oyuncuya seçilen ödül dağıtılacak ve bu hafta düzenlemeye kapatılacaktır.
              </p>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Summary Grid */}
              <div className="grid grid-cols-2 gap-3 bg-[#060d18] p-3.5 rounded-xl border border-white/10">
                <div>
                  <span className="text-gray-400 block">Sezon / Lig:</span>
                  <strong className="text-white text-sm">
                    {selectedSeasonObj?.name} — {selectedLeagueObj?.name}
                  </strong>
                </div>
                <div>
                  <span className="text-gray-400 block">Hafta / Formasyon:</span>
                  <strong className="text-white text-sm">
                    {selectedWeekNumber}. Hafta ({selectedFormation})
                  </strong>
                </div>
                <div className="col-span-2 pt-2 border-t border-white/10 flex items-center gap-3">
                  {selectedTrophyObj?.image_url && (
                    <img
                      src={selectedTrophyObj.image_url}
                      alt={selectedTrophyObj.title}
                      className="w-9 h-9 rounded object-contain bg-white/5 p-0.5 border border-white/10"
                    />
                  )}
                  <div>
                    <span className="text-gray-400 block">Dağıtılacak TOTW Ödülü:</span>
                    <strong className="text-yellow-400 text-sm">
                      {selectedTrophyObj?.title || '—'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 11 Players List */}
              <div className="bg-[#060d18] rounded-xl border border-white/10 p-3.5">
                <div className="font-black text-gray-300 uppercase tracking-wider mb-2">
                  Ödül Alacak 11 Oyuncu
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {lineupSlots.map(({ slot, player }) => (
                    <div
                      key={slot.slotKey}
                      className="flex items-center gap-2 p-1.5 rounded-lg bg-white/5"
                    >
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${
                          ROLE_BADGE_STYLES[slot.roleGroup]
                        }`}
                      >
                        {slot.positionLabel}
                      </span>
                      <span className="font-bold text-white truncate">
                        {player?.username}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                        {player && player.effectiveRating > 0
                          ? player.effectiveRating.toFixed(1)
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/10 bg-[#060d18] flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-300"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmAndSendRewards}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#060d18] text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {isSubmitting ? 'Gönderiliyor...' : 'Onayla ve Ödülleri Gönder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
