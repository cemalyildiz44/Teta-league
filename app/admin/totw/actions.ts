'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logAdminAudit } from '@/lib/audit';
import {
  DEFAULT_TOTW_FORMATION,
  FORMATIONS,
  FORMATION_KEYS,
  classifyPositionRoleGroup,
  compareTotwCandidates,
  computeCandidateMetrics,
  getTotwPeriodLabel,
  getTotwPeriodNumber,
  getTotwPeriodWeeks,
  isPlayerCompatibleWithSlot,
  type FormationKey,
  type RoleGroup,
  type TotwPeriod,
  type TotwPlayerCandidate,
} from '@/lib/totw';

async function requireAdminUser(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Yetkisiz erişim.' };

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle();

  if (!roleData) {
    return { ok: false as const, error: 'Bu işlemi yapmaya yetkiniz yok.' };
  }

  return { ok: true as const, userId: user.id, role: roleData.role as string };
}

export interface LockedTotwSlotView {
  slotKey: string;
  slotIndex: number;
  roleGroup: RoleGroup;
  positionLabel: string;
  player: TotwPlayerCandidate;
  isManualOverride: boolean;
}

export interface LockedTotwView {
  id: string;
  seasonId: string;
  leagueId: string;
  weekNumber: number;
  periodNumber?: number;
  periodWeeks?: number[];
  periodLabel?: string;
  formation: FormationKey;
  trophyId: string;
  trophyTitle: string;
  trophyImageUrl: string;
  trophyCategory: string;
  submittedAt: string;
  slots: LockedTotwSlotView[];
}

export interface LoadTotwWeekResult {
  ok: boolean;
  error?: string;
  isSchemaPending?: boolean;
  approvedMatchCount: number;
  totalFixtureCount: number;
  lockedTotw: LockedTotwView | null;
  candidates: TotwPlayerCandidate[];
  periodNumber?: number;
  periodWeeks?: number[];
  periodLabel?: string;
}

export interface LoadTotwDataParams {
  seasonId: string;
  leagueId: string;
  periodNumber?: number;
  periodWeeks?: number[];
  weekNumber?: number; // backward compatibility
}

export async function loadTotwWeekDataAction(params: LoadTotwDataParams): Promise<LoadTotwWeekResult> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const auth = await requireAdminUser(supabase);
    if (!auth.ok) {
      return {
        ok: false,
        error: auth.error,
        approvedMatchCount: 0,
        totalFixtureCount: 0,
        lockedTotw: null,
        candidates: [],
      };
    }

    const { seasonId, leagueId } = params;
    const periodNum =
      params.periodNumber && Number.isInteger(params.periodNumber) && params.periodNumber >= 1
        ? params.periodNumber
        : params.weekNumber && Number.isInteger(params.weekNumber) && params.weekNumber >= 1
        ? getTotwPeriodNumber(params.weekNumber)
        : 1;

    const periodWeeks =
      Array.isArray(params.periodWeeks) && params.periodWeeks.length > 0
        ? params.periodWeeks
        : (params.weekNumber && !params.periodNumber ? [params.weekNumber] : getTotwPeriodWeeks(periodNum));

    const periodLabel = getTotwPeriodLabel(periodNum, periodWeeks);

    if (!seasonId || !leagueId || periodNum < 1 || periodWeeks.length === 0) {
      return {
        ok: false,
        error: 'Geçerli sezon, lig ve dönem seçilmelidir.',
        approvedMatchCount: 0,
        totalFixtureCount: 0,
        lockedTotw: null,
        candidates: [],
      };
    }

    // 1. Check if this Season + League + Period is already submitted and locked
    let lockedTotw: LockedTotwView | null = null;
    let isSchemaPending = false;

    const queryWeekNumbers = Array.from(new Set([periodNum, ...(params.weekNumber ? [params.weekNumber] : [])]));
    const { data: existingTotw, error: totwErr } = await supabase
      .from('totw_weeks')
      .select(
        `
        id,
        season_id,
        league_id,
        week_number,
        formation,
        trophy_id,
        is_locked,
        submitted_at,
        trophy:trophies!trophy_id(id, title, image_url, category),
        selections:totw_selections(
          slot_key,
          slot_index,
          role_group,
          position_label,
          player_id,
          team_id,
          rating,
          score,
          stats_snapshot,
          profile:profiles!player_id(id, username, full_name, avatar_url, primary_position, alternative_positions),
          team:teams!team_id(id, name, logo_url)
        )
      `
      )
      .eq('season_id', seasonId)
      .eq('league_id', leagueId)
      .in('week_number', queryWeekNumbers)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (totwErr) {
      if (totwErr.message?.includes('totw_weeks') || totwErr.code === '42P01') {
        isSchemaPending = true;
      } else {
        return {
          ok: false,
          error: 'TOTW verisi okunamadı: ' + totwErr.message,
          approvedMatchCount: 0,
          totalFixtureCount: 0,
          lockedTotw: null,
          candidates: [],
        };
      }
    }

    if (existingTotw) {
      const tr = Array.isArray(existingTotw.trophy) ? existingTotw.trophy[0] : existingTotw.trophy;
      const rawSelections = Array.isArray(existingTotw.selections) ? existingTotw.selections : [];
      const sortedSelections = [...rawSelections].sort((a: any, b: any) => a.slot_index - b.slot_index);

      const slots: LockedTotwSlotView[] = sortedSelections.map((sel: any) => {
        const prof = Array.isArray(sel.profile) ? sel.profile[0] : sel.profile;
        const tm = Array.isArray(sel.team) ? sel.team[0] : sel.team;
        const snap = sel.stats_snapshot || {};
        const ratingNum = sel.rating !== null && sel.rating !== undefined ? Number(sel.rating) : Number(snap.avgRating || 0);
        const scoreNum = sel.score !== null && sel.score !== undefined ? Number(sel.score) : Number(snap.totwScore || 0);
        const rg = (sel.role_group as RoleGroup) || 'MID';

        return {
          slotKey: sel.slot_key,
          slotIndex: sel.slot_index,
          roleGroup: rg,
          positionLabel: sel.position_label,
          isManualOverride: Boolean(snap.isManualOverride),
          player: {
            playerId: sel.player_id,
            username: prof?.username || snap.username || 'Oyuncu',
            fullName: prof?.full_name ?? snap.fullName ?? null,
            avatarUrl: prof?.avatar_url ?? snap.avatarUrl ?? null,
            primaryPosition: prof?.primary_position ?? snap.primaryPosition ?? sel.position_label,
            alternativePositions: Array.isArray(prof?.alternative_positions) ? prof.alternative_positions : [],
            matchPosition: snap.matchPosition ?? sel.position_label,
            roleGroup: rg,
            eligibleRoleGroups: [rg],
            teamId: sel.team_id || tm?.id || null,
            teamName: tm?.name || snap.teamName || null,
            teamLogo: tm?.logo_url || snap.teamLogo || null,
            matchesPlayed: Number(snap.matchesPlayed ?? 1),
            avgRating: ratingNum,
            effectiveRating: ratingNum,
            totwScore: scoreNum,
            goals: Number(snap.goals ?? 0),
            assists: Number(snap.assists ?? 0),
            saves: Number(snap.saves ?? 0),
            cleanSheetsGk: Number(snap.cleanSheetsGk ?? 0),
            cleanSheetsDef: Number(snap.cleanSheetsDef ?? 0),
            tacklesMade: Number(snap.tacklesMade ?? 0),
            momCount: Number(snap.momCount ?? 0),
            wins: Number(snap.wins ?? 0),
            redCards: Number(snap.redCards ?? 0),
            goalsConceded: Number(snap.goalsConceded ?? 0),
            playedInWeek: Boolean(snap.playedInWeek ?? true),
          },
        };
      });

      const firstSnap = sortedSelections[0]?.stats_snapshot || {};
      const recPeriodNum = Number(firstSnap?.periodNumber) || periodNum;
      const recPeriodWeeks =
        Array.isArray(firstSnap?.periodWeeks) && firstSnap.periodWeeks.length > 0
          ? firstSnap.periodWeeks
          : periodWeeks;
      const recPeriodLabel = firstSnap?.periodLabel || getTotwPeriodLabel(recPeriodNum, recPeriodWeeks);

      lockedTotw = {
        id: existingTotw.id,
        seasonId: existingTotw.season_id,
        leagueId: existingTotw.league_id,
        weekNumber: existingTotw.week_number,
        periodNumber: recPeriodNum,
        periodWeeks: recPeriodWeeks,
        periodLabel: recPeriodLabel,
        formation: (FORMATION_KEYS.includes(existingTotw.formation as FormationKey)
          ? existingTotw.formation
          : DEFAULT_TOTW_FORMATION) as FormationKey,
        trophyId: existingTotw.trophy_id,
        trophyTitle: tr?.title || 'TOTW Ödülü',
        trophyImageUrl: tr?.image_url || '',
        trophyCategory: tr?.category || '',
        submittedAt: existingTotw.submitted_at,
        slots,
      };
    }

    // 2. Fetch fixtures for all weeks in the selected period
    const { data: fixtures, error: fixErr } = await supabase
      .from('fixtures')
      .select('id, week_number, status')
      .eq('season_id', seasonId)
      .eq('league_id', leagueId)
      .in('week_number', periodWeeks);

    if (fixErr) {
      return {
        ok: false,
        error: 'Fikstür verisi okunamadı: ' + fixErr.message,
        isSchemaPending,
        approvedMatchCount: 0,
        totalFixtureCount: 0,
        lockedTotw,
        candidates: [],
      };
    }

    const fixtureIds = (fixtures || []).map((f: any) => f.id);
    const totalFixtureCount = fixtureIds.length;

    // 3. Fetch APPROVED matches for those fixtures
    let approvedMatches: any[] = [];
    if (fixtureIds.length > 0) {
      const { data: matchesData, error: mErr } = await supabase
        .from('matches')
        .select('id, fixture_id, home_team_id, away_team_id, home_score, away_score, status')
        .eq('season_id', seasonId)
        .eq('league_id', leagueId)
        .eq('status', 'APPROVED')
        .in('fixture_id', fixtureIds);

      if (mErr) {
        return {
          ok: false,
          error: 'Maç verisi okunamadı: ' + mErr.message,
          isSchemaPending,
          approvedMatchCount: 0,
          totalFixtureCount,
          lockedTotw,
          candidates: [],
        };
      }
      approvedMatches = matchesData || [];
    }

    // If week is already submitted and locked, return saved TOTW directly without recalculating candidates
    if (lockedTotw) {
      return {
        ok: true,
        isSchemaPending,
        approvedMatchCount: approvedMatches.length,
        totalFixtureCount,
        lockedTotw,
        candidates: [],
        periodNumber: periodNum,
        periodWeeks,
        periodLabel,
      };
    }

    const approvedMatchIds = approvedMatches.map((m: any) => m.id);
    const approvedMatchById = new Map(approvedMatches.map((m: any) => [m.id, m]));

    // 4. Fetch match_player_stats for those APPROVED matches where player_id IS NOT NULL
    let weekStats: any[] = [];
    if (approvedMatchIds.length > 0) {
      const { data: statsData, error: stErr } = await supabase
        .from('match_player_stats')
        .select(
          `
          match_id,
          team_id,
          player_id,
          position,
          goals,
          assists,
          rating,
          saves,
          goals_conceded,
          cleansheets_gk,
          cleansheets_def,
          tackles_made,
          red_cards,
          is_mom,
          profile:profiles!match_player_stats_player_id_fkey(
            id,
            username,
            full_name,
            avatar_url,
            primary_position,
            alternative_positions,
            status,
            is_active
          ),
          team:teams!team_id(id, name, logo_url)
        `
        )
        .in('match_id', approvedMatchIds)
        .not('player_id', 'is', null);

      if (stErr) {
        return {
          ok: false,
          error: 'Oyuncu maç istatistikleri okunamadı: ' + stErr.message,
          isSchemaPending,
          approvedMatchCount: approvedMatches.length,
          totalFixtureCount,
          lockedTotw,
          candidates: [],
        };
      }
      weekStats = statsData || [];
    }

    // 5. Fetch active league roster memberships so admin can also search/replace with any league-registered player
    const [membershipsRes, leagueTeamsRes] = await Promise.all([
      supabase
        .from('team_memberships')
        .select('player_id, team_id')
        .eq('season_id', seasonId)
        .eq('league_id', leagueId)
        .is('left_at', null),
      supabase
        .from('league_teams')
        .select('team_id, team:teams!team_id(id, name, logo_url)')
        .eq('season_id', seasonId)
        .eq('league_id', leagueId)
        .eq('is_active', true),
    ]);

    const teamMap = new Map<string, { id: string; name: string; logo_url: string | null }>();
    for (const lt of leagueTeamsRes.data || []) {
      const t = Array.isArray(lt.team) ? lt.team[0] : lt.team;
      if (t?.id) teamMap.set(t.id, t);
    }

    const membershipTeamByPlayer = new Map<string, string>();
    const rosterPlayerIds: string[] = [];
    for (const mem of membershipsRes.data || []) {
      if (mem.player_id && !membershipTeamByPlayer.has(mem.player_id)) {
        membershipTeamByPlayer.set(mem.player_id, mem.team_id);
        rosterPlayerIds.push(mem.player_id);
      }
    }

    let rosterProfiles: any[] = [];
    if (rosterPlayerIds.length > 0) {
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, primary_position, alternative_positions, status, is_active')
        .in('id', rosterPlayerIds);
      rosterProfiles = profData || [];
    }

    // 6. Aggregate week stats per player_id
    interface AggPlayer {
      profile: any;
      teamId: string | null;
      teamName: string | null;
      teamLogo: string | null;
      matchesPlayed: number;
      ratingSum: number;
      ratingCount: number;
      goals: number;
      assists: number;
      saves: number;
      cleanSheetsGk: number;
      cleanSheetsDef: number;
      tacklesMade: number;
      momCount: number;
      wins: number;
      redCards: number;
      goalsConceded: number;
      matchPositions: string[];
      roleCounts: Record<RoleGroup, number>;
    }

    const aggMap = new Map<string, AggPlayer>();

    for (const row of weekStats) {
      if (!row.player_id) continue;
      const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      if (!prof || prof.status === 'BANNED' || prof.is_active === false) continue;

      const tm = Array.isArray(row.team) ? row.team[0] : row.team;
      if (tm?.id && !teamMap.has(tm.id)) {
        teamMap.set(tm.id, tm);
      }

      if (!aggMap.has(row.player_id)) {
        aggMap.set(row.player_id, {
          profile: prof,
          teamId: row.team_id || tm?.id || null,
          teamName: tm?.name || null,
          teamLogo: tm?.logo_url || null,
          matchesPlayed: 0,
          ratingSum: 0,
          ratingCount: 0,
          goals: 0,
          assists: 0,
          saves: 0,
          cleanSheetsGk: 0,
          cleanSheetsDef: 0,
          tacklesMade: 0,
          momCount: 0,
          wins: 0,
          redCards: 0,
          goalsConceded: 0,
          matchPositions: [],
          roleCounts: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
        });
      }

      const agg = aggMap.get(row.player_id)!;
      agg.matchesPlayed += 1;
      const rVal = parseFloat(row.rating);
      if (!Number.isNaN(rVal) && rVal > 0) {
        agg.ratingSum += rVal;
        agg.ratingCount += 1;
      }
      agg.goals += Number(row.goals || 0);
      agg.assists += Number(row.assists || 0);
      agg.saves += Number(row.saves || 0);
      agg.cleanSheetsGk += Number(row.cleansheets_gk || 0);
      agg.cleanSheetsDef += Number(row.cleansheets_def || 0);
      agg.tacklesMade += Number(row.tackles_made || 0);
      agg.redCards += Number(row.red_cards || 0);
      agg.goalsConceded += Number(row.goals_conceded || 0);
      if (row.is_mom) agg.momCount += 1;

      const m = approvedMatchById.get(row.match_id);
      if (m) {
        if (row.team_id === m.home_team_id && m.home_score > m.away_score) agg.wins += 1;
        else if (row.team_id === m.away_team_id && m.away_score > m.home_score) agg.wins += 1;
      }

      if (row.position) {
        agg.matchPositions.push(row.position);
        const rg = classifyPositionRoleGroup(row.position);
        if (rg) agg.roleCounts[rg] += 1;
      }
    }

    const candidates: TotwPlayerCandidate[] = [];

    for (const [playerId, agg] of aggMap.entries()) {
      const prof = agg.profile;
      const altPositions: string[] = Array.isArray(prof.alternative_positions)
        ? prof.alternative_positions.filter(Boolean)
        : [];

      // Determine primary role group for the week:
      // 1) Most frequent recognized match position in that week
      // 2) Fallback to profile.primary_position
      // 3) Fallback to first recognized alternative_position
      let primaryRole: RoleGroup | null = null;
      let bestCount = 0;
      for (const rg of ['GK', 'DEF', 'MID', 'FWD'] as RoleGroup[]) {
        if (agg.roleCounts[rg] > bestCount) {
          bestCount = agg.roleCounts[rg];
          primaryRole = rg;
        }
      }
      if (!primaryRole) {
        primaryRole = classifyPositionRoleGroup(prof.primary_position);
      }
      if (!primaryRole) {
        for (const alt of altPositions) {
          const rg = classifyPositionRoleGroup(alt);
          if (rg) {
            primaryRole = rg;
            break;
          }
        }
      }

      const eligibleSet = new Set<RoleGroup>();
      if (primaryRole) eligibleSet.add(primaryRole);
      for (const rg of ['GK', 'DEF', 'MID', 'FWD'] as RoleGroup[]) {
        if (agg.roleCounts[rg] > 0) eligibleSet.add(rg);
      }
      const profPrimaryRole = classifyPositionRoleGroup(prof.primary_position);
      if (profPrimaryRole) eligibleSet.add(profPrimaryRole);
      for (const alt of altPositions) {
        const rg = classifyPositionRoleGroup(alt);
        if (rg) eligibleSet.add(rg);
      }

      const metrics = computeCandidateMetrics({
        roleGroup: primaryRole,
        matchesPlayed: agg.matchesPlayed,
        ratingSum: agg.ratingSum,
        ratingCount: agg.ratingCount,
        goals: agg.goals,
        assists: agg.assists,
        saves: agg.saves,
        cleanSheetsGk: agg.cleanSheetsGk,
        cleanSheetsDef: agg.cleanSheetsDef,
        tacklesMade: agg.tacklesMade,
        momCount: agg.momCount,
        wins: agg.wins,
        redCards: agg.redCards,
        goalsConceded: agg.goalsConceded,
      });

      candidates.push({
        playerId,
        username: prof.username,
        fullName: prof.full_name || null,
        avatarUrl: prof.avatar_url || null,
        primaryPosition: prof.primary_position || null,
        alternativePositions: altPositions,
        matchPosition: agg.matchPositions[0] || null,
        roleGroup: primaryRole,
        eligibleRoleGroups: Array.from(eligibleSet),
        teamId: agg.teamId,
        teamName: agg.teamName,
        teamLogo: agg.teamLogo,
        matchesPlayed: agg.matchesPlayed,
        avgRating: metrics.avgRating,
        effectiveRating: metrics.effectiveRating,
        totwScore: metrics.totwScore,
        goals: agg.goals,
        assists: agg.assists,
        saves: agg.saves,
        cleanSheetsGk: agg.cleanSheetsGk,
        cleanSheetsDef: agg.cleanSheetsDef,
        tacklesMade: agg.tacklesMade,
        momCount: agg.momCount,
        wins: agg.wins,
        redCards: agg.redCards,
        goalsConceded: agg.goalsConceded,
        playedInWeek: true,
      });
    }

    // Add remaining active league roster players (who didn't play in an approved match that week) for manual replacement search
    for (const prof of rosterProfiles) {
      if (!prof || prof.status === 'BANNED' || prof.is_active === false) continue;
      if (aggMap.has(prof.id)) continue;

      const altPositions: string[] = Array.isArray(prof.alternative_positions)
        ? prof.alternative_positions.filter(Boolean)
        : [];
      let primaryRole = classifyPositionRoleGroup(prof.primary_position);
      if (!primaryRole) {
        for (const alt of altPositions) {
          const rg = classifyPositionRoleGroup(alt);
          if (rg) {
            primaryRole = rg;
            break;
          }
        }
      }

      const eligibleSet = new Set<RoleGroup>();
      if (primaryRole) eligibleSet.add(primaryRole);
      for (const alt of altPositions) {
        const rg = classifyPositionRoleGroup(alt);
        if (rg) eligibleSet.add(rg);
      }

      const tId = membershipTeamByPlayer.get(prof.id) || null;
      const tm = tId ? teamMap.get(tId) || null : null;

      candidates.push({
        playerId: prof.id,
        username: prof.username,
        fullName: prof.full_name || null,
        avatarUrl: prof.avatar_url || null,
        primaryPosition: prof.primary_position || null,
        alternativePositions: altPositions,
        matchPosition: null,
        roleGroup: primaryRole,
        eligibleRoleGroups: Array.from(eligibleSet),
        teamId: tId,
        teamName: tm?.name || null,
        teamLogo: tm?.logo_url || null,
        matchesPlayed: 0,
        avgRating: 0,
        effectiveRating: 0,
        totwScore: 0,
        goals: 0,
        assists: 0,
        saves: 0,
        cleanSheetsGk: 0,
        cleanSheetsDef: 0,
        tacklesMade: 0,
        momCount: 0,
        wins: 0,
        redCards: 0,
        goalsConceded: 0,
        playedInWeek: false,
      });
    }

    candidates.sort(compareTotwCandidates);

    return {
      ok: true,
      isSchemaPending,
      approvedMatchCount: approvedMatches.length,
      totalFixtureCount,
      lockedTotw,
      candidates,
      periodNumber: periodNum,
      periodWeeks,
      periodLabel,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: 'Beklenmeyen hata: ' + (err?.message || String(err)),
      approvedMatchCount: 0,
      totalFixtureCount: 0,
      lockedTotw: null,
      candidates: [],
    };
  }
}

export interface SubmitTotwPayload {
  seasonId: string;
  leagueId: string;
  periodNumber?: number;
  periodWeeks?: number[];
  weekNumber?: number;
  formation?: FormationKey;
  trophyId: string;
  slots: {
    slotKey: string;
    slotIndex: number;
    playerId: string;
    isManualOverride: boolean;
  }[];
}

export async function submitAndLockTotwAction(payload: SubmitTotwPayload): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const auth = await requireAdminUser(supabase);
    if (!auth.ok) return { ok: false, error: auth.error };

    const { seasonId, leagueId, trophyId, slots } = payload;
    const periodNum =
      payload.periodNumber && Number.isInteger(payload.periodNumber) && payload.periodNumber >= 1
        ? payload.periodNumber
        : payload.weekNumber && Number.isInteger(payload.weekNumber) && payload.weekNumber >= 1
        ? getTotwPeriodNumber(payload.weekNumber)
        : 1;

    const periodWeeks =
      Array.isArray(payload.periodWeeks) && payload.periodWeeks.length > 0
        ? payload.periodWeeks
        : getTotwPeriodWeeks(periodNum);

    const periodLabel = getTotwPeriodLabel(periodNum, periodWeeks);
    const formation: FormationKey = DEFAULT_TOTW_FORMATION; // Always fixed to 3-5-2

    if (!seasonId || !leagueId || periodNum < 1) {
      return { ok: false, error: 'Geçerli sezon, lig ve dönem seçilmelidir.' };
    }

    if (!trophyId) {
      return { ok: false, error: 'TOTW göndermeden önce bir TOTW ödülü seçmelisiniz.' };
    }

    const formationSlots = FORMATIONS[formation];
    if (!Array.isArray(slots) || slots.length !== formationSlots.length) {
      return { ok: false, error: 'Kadroda eksik pozisyon var. Tüm 11 pozisyon dolu olmalıdır.' };
    }

    // Load fresh period data to validate players and ensure period is not already locked
    const weekData = await loadTotwWeekDataAction({
      seasonId,
      leagueId,
      periodNumber: periodNum,
      periodWeeks,
    });
    if (!weekData.ok) {
      return { ok: false, error: weekData.error || 'Dönem verisi doğrulanamadı.' };
    }

    if (weekData.lockedTotw) {
      return { ok: false, error: `Bu sezon ve lig için ${periodLabel} zaten gönderilmiş ve kilitlenmiş.` };
    }

    const candidateById = new Map(weekData.candidates.map((c) => [c.playerId, c]));
    const seenPlayers = new Set<string>();
    const seenSlots = new Set<string>();
    const rpcSelections: any[] = [];
    const usernamesToRevalidate: string[] = [];

    for (const fSlot of formationSlots) {
      const submittedSlot = slots.find((s) => s.slotKey === fSlot.slotKey && s.slotIndex === fSlot.slotIndex);
      if (!submittedSlot || !submittedSlot.playerId) {
        return { ok: false, error: `${fSlot.positionLabel} (${fSlot.slotKey}) pozisyonu boş bırakılamaz.` };
      }

      if (seenSlots.has(fSlot.slotKey)) {
        return { ok: false, error: `Mükerrer pozisyon anahtarı: ${fSlot.slotKey}` };
      }
      seenSlots.add(fSlot.slotKey);

      if (seenPlayers.has(submittedSlot.playerId)) {
        return { ok: false, error: 'Aynı oyuncu TOTW kadrosunda birden fazla pozisyonda yer alamaz.' };
      }
      seenPlayers.add(submittedSlot.playerId);

      const cand = candidateById.get(submittedSlot.playerId);
      if (!cand) {
        return { ok: false, error: `Seçilen oyuncu (${submittedSlot.playerId}) bu lig/dönem aday listesinde bulunamadı.` };
      }

      const compat = isPlayerCompatibleWithSlot(cand, fSlot);
      if (!compat.compatible) {
        return { ok: false, error: `${cand.username}: ${compat.reason}` };
      }

      usernamesToRevalidate.push(cand.username);

      rpcSelections.push({
        slot_key: fSlot.slotKey,
        slot_index: fSlot.slotIndex,
        role_group: fSlot.roleGroup,
        position_label: fSlot.positionLabel,
        player_id: cand.playerId,
        team_id: cand.teamId || '',
        rating: cand.effectiveRating > 0 ? String(cand.effectiveRating) : '',
        score: cand.totwScore > 0 ? String(cand.totwScore) : '',
        stats_snapshot: {
          periodNumber: periodNum,
          periodWeeks,
          periodLabel,
          username: cand.username,
          fullName: cand.fullName,
          avatarUrl: cand.avatarUrl,
          primaryPosition: cand.primaryPosition,
          matchPosition: cand.matchPosition,
          teamName: cand.teamName,
          teamLogo: cand.teamLogo,
          matchesPlayed: cand.matchesPlayed,
          avgRating: cand.avgRating,
          effectiveRating: cand.effectiveRating,
          totwScore: cand.totwScore,
          goals: cand.goals,
          assists: cand.assists,
          saves: cand.saves,
          cleanSheetsGk: cand.cleanSheetsGk,
          cleanSheetsDef: cand.cleanSheetsDef,
          tacklesMade: cand.tacklesMade,
          momCount: cand.momCount,
          wins: cand.wins,
          redCards: cand.redCards,
          goalsConceded: cand.goalsConceded,
          playedInWeek: cand.playedInWeek,
          isManualOverride: Boolean(submittedSlot.isManualOverride),
        },
      });
    }

    // Retrieve league & season name for descriptive notes
    const { data: leagueRow } = await supabase
      .from('leagues')
      .select('name, season:seasons!season_id(name)')
      .eq('id', leagueId)
      .maybeSingle();

    const sName =
      (Array.isArray((leagueRow as any)?.season)
        ? (leagueRow as any)?.season[0]?.name
        : (leagueRow as any)?.season?.name) || 'Sezon';
    const lName = (leagueRow as any)?.name || 'Lig';
    const notesPrefix = `${sName} • ${lName} • ${periodLabel}`;

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_and_lock_totw', {
      p_season_id: seasonId,
      p_league_id: leagueId,
      p_week_number: periodNum,
      p_formation: formation,
      p_trophy_id: trophyId,
      p_selections: rpcSelections,
      p_notes_prefix: notesPrefix,
    });

    if (rpcErr) {
      if (rpcErr.code === '23505' || rpcErr.message?.includes('ALREADY_LOCKED')) {
        return { ok: false, error: `Bu dönem (${periodLabel}) için TOTW zaten gönderilmiş ve kilitlenmiş.` };
      }
      if (
        rpcErr.code === 'PGRST202' ||
        rpcErr.code === '42883' ||
        rpcErr.message?.includes('schema cache') ||
        rpcErr.message?.includes('submit_and_lock_totw')
      ) {
        return {
          ok: false,
          error:
            "TOTW veritabanı fonksiyonu (submit_and_lock_totw) veritabanında henüz tanımlı değil. Lütfen '20261019000000_admin_totw_system.sql' migration dosyasını Supabase SQL Editor üzerinden uygulayın.",
        };
      }
      return { ok: false, error: 'TOTW gönderilirken hata oluştu: ' + rpcErr.message };
    }

    await logAdminAudit({
      action: 'TOTW_SUBMIT_AND_LOCK',
      entity_type: 'totw_weeks',
      entity_id: (rpcRes as any)?.totw_week_id || leagueId,
      entity_label: `${periodLabel} (${formation})`,
      description: `${periodLabel} kadrosu (${formation}) gönderildi, kilitlendi ve 11 oyuncuya "${(rpcRes as any)?.trophy_title || 'TOTW'}" ödülü dağıtıldı.`,
      new_data: {
        seasonId,
        leagueId,
        periodNumber: periodNum,
        periodWeeks,
        periodLabel,
        formation,
        trophyId,
        players: usernamesToRevalidate,
      },
      actor_id: auth.userId,
    });

    revalidatePath('/admin/totw');
    revalidatePath('/admin/achievements');
    revalidatePath('/oyuncular');
    for (const uname of usernamesToRevalidate) {
      if (uname) {
        revalidatePath(`/oyuncular/${encodeURIComponent(uname)}`);
      }
    }

    return {
      ok: true,
      message: `${periodLabel} kadrosu (${formation}) başarıyla kaydedildi, kilitlendi ve 11 oyuncuya ödülleri verildi.`,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: 'Beklenmeyen hata: ' + (err?.message || String(err)),
    };
  }
}
