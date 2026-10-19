import { isDefenderPosition, isGoalkeeperPosition } from '../app/utils/positions.ts';

export type FormationKey = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2';
export type RoleGroup = 'GK' | 'DEF' | 'MID' | 'FWD';

export const ROLE_GROUP_LABELS: Record<RoleGroup, string> = {
  GK: 'Kaleci',
  DEF: 'Defans',
  MID: 'Orta Saha',
  FWD: 'Forvet',
};

export interface TotwFormationSlot {
  slotKey: string;
  slotIndex: number;
  roleGroup: RoleGroup;
  positionLabel: string;
  preferredSubPositions: string[];
  /** Horizontal position on pitch (0-100%) */
  x: number;
  /** Vertical position on pitch (0-100%, top=attack, bottom=GK) */
  y: number;
}

export type FormationSlot = TotwFormationSlot;

export const DEFAULT_TOTW_FORMATION: FormationKey = '3-5-2';

export const FORMATION_KEYS: FormationKey[] = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'];

export interface TotwPeriod {
  periodNumber: number;
  startWeek: number;
  endWeek: number;
  weeks: number[];
  label: string;
  displayTitle: string;
}

export function getTotwPeriodWeeks(periodNumber: number): number[] {
  const p = Math.max(1, Math.floor(periodNumber));
  const start = (p - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

export function getTotwPeriodNumber(weekNumber: number): number {
  if (!weekNumber || weekNumber < 1) return 1;
  return Math.floor((weekNumber - 1) / 3) + 1;
}

export function getTotwPeriodLabel(periodNumber: number, customWeeks?: number[]): string {
  const weeks = customWeeks && customWeeks.length > 0 ? customWeeks : getTotwPeriodWeeks(periodNumber);
  const minW = Math.min(...weeks);
  const maxW = Math.max(...weeks);
  if (minW === maxW) return `HAFTA ${minW} TOTW`;
  return `HAFTA ${minW}–${maxW} TOTW`;
}

export function buildTotwPeriods(fixtureWeeks: number[]): TotwPeriod[] {
  if (!fixtureWeeks || fixtureWeeks.length === 0) return [];
  const uniqueWeeks = Array.from(
    new Set(fixtureWeeks.filter((w) => typeof w === 'number' && w >= 1))
  ).sort((a, b) => a - b);
  if (uniqueWeeks.length === 0) return [];

  const maxWeek = Math.max(...uniqueWeeks);
  const maxPeriod = Math.ceil(maxWeek / 3);
  const periods: TotwPeriod[] = [];

  for (let p = 1; p <= maxPeriod; p++) {
    const defaultWeeks = getTotwPeriodWeeks(p);
    const startWeek = defaultWeeks[0];
    const endWeek = defaultWeeks[defaultWeeks.length - 1];
    const periodWeeks = uniqueWeeks.filter((w) => w >= startWeek && w <= endWeek);
    if (periodWeeks.length === 0) continue;

    const actualMin = Math.min(...periodWeeks);
    const actualMax = Math.max(...periodWeeks);
    const label = actualMin === actualMax ? `HAFTA ${actualMin} TOTW` : `HAFTA ${actualMin}–${actualMax} TOTW`;
    const displayTitle = `${label} (Dönem ${p})`;

    periods.push({
      periodNumber: p,
      startWeek: actualMin,
      endWeek: actualMax,
      weeks: periodWeeks,
      label,
      displayTitle,
    });
  }

  return periods;
}

export const FORMATIONS: Record<FormationKey, TotwFormationSlot[]> = {
  '4-3-3': [
    { slotKey: 'LW', slotIndex: 0, roleGroup: 'FWD', positionLabel: 'SLK', preferredSubPositions: ['SLK', 'LW', 'LF', 'SLO', 'LM'], x: 19, y: 17 },
    { slotKey: 'ST', slotIndex: 1, roleGroup: 'FWD', positionLabel: 'ST', preferredSubPositions: ['ST', 'CF', 'SANTRFOR', 'FORVET'], x: 50, y: 12 },
    { slotKey: 'RW', slotIndex: 2, roleGroup: 'FWD', positionLabel: 'SĞK', preferredSubPositions: ['SGK', 'RW', 'RF', 'SGO', 'RM'], x: 81, y: 17 },
    { slotKey: 'LCM', slotIndex: 3, roleGroup: 'MID', positionLabel: 'MO', preferredSubPositions: ['MO', 'CM', 'OOS', 'CAM', 'SLO', 'LM'], x: 24, y: 42 },
    { slotKey: 'CDM', slotIndex: 4, roleGroup: 'MID', positionLabel: 'MDO', preferredSubPositions: ['MDO', 'CDM', 'DM', 'MO', 'CM'], x: 50, y: 49 },
    { slotKey: 'RCM', slotIndex: 5, roleGroup: 'MID', positionLabel: 'MO', preferredSubPositions: ['MO', 'CM', 'OOS', 'CAM', 'SGO', 'RM'], x: 76, y: 42 },
    { slotKey: 'LB', slotIndex: 6, roleGroup: 'DEF', positionLabel: 'SLB', preferredSubPositions: ['SLB', 'LB', 'LWB', 'SOL BEK', 'SLKB'], x: 14, y: 69 },
    { slotKey: 'LCB', slotIndex: 7, roleGroup: 'DEF', positionLabel: 'STP', preferredSubPositions: ['STP', 'CB', 'STOPER'], x: 38, y: 73 },
    { slotKey: 'RCB', slotIndex: 8, roleGroup: 'DEF', positionLabel: 'STP', preferredSubPositions: ['STP', 'CB', 'STOPER'], x: 62, y: 73 },
    { slotKey: 'RB', slotIndex: 9, roleGroup: 'DEF', positionLabel: 'SĞB', preferredSubPositions: ['SGB', 'RB', 'RWB', 'SAG BEK', 'SGKB'], x: 86, y: 69 },
    { slotKey: 'GK', slotIndex: 10, roleGroup: 'GK', positionLabel: 'KL', preferredSubPositions: ['KL', 'GK', 'KALECI', 'GOALKEEPER'], x: 50, y: 89 },
  ],
  '4-4-2': [
    { slotKey: 'LST', slotIndex: 0, roleGroup: 'FWD', positionLabel: 'ST', preferredSubPositions: ['ST', 'CF', 'SANTRFOR', 'FORVET', 'SLK', 'LW'], x: 35, y: 14 },
    { slotKey: 'RST', slotIndex: 1, roleGroup: 'FWD', positionLabel: 'ST', preferredSubPositions: ['ST', 'CF', 'SANTRFOR', 'FORVET', 'SGK', 'RW'], x: 65, y: 14 },
    { slotKey: 'LM', slotIndex: 2, roleGroup: 'MID', positionLabel: 'SLO', preferredSubPositions: ['SLO', 'LM', 'SLK', 'LW'], x: 14, y: 41 },
    { slotKey: 'LCM', slotIndex: 3, roleGroup: 'MID', positionLabel: 'MO', preferredSubPositions: ['MO', 'CM', 'MDO', 'CDM', 'OOS', 'CAM'], x: 38, y: 46 },
    { slotKey: 'RCM', slotIndex: 4, roleGroup: 'MID', positionLabel: 'MO', preferredSubPositions: ['MO', 'CM', 'MDO', 'CDM', 'OOS', 'CAM'], x: 62, y: 46 },
    { slotKey: 'RM', slotIndex: 5, roleGroup: 'MID', positionLabel: 'SĞO', preferredSubPositions: ['SGO', 'RM', 'SGK', 'RW'], x: 86, y: 41 },
    { slotKey: 'LB', slotIndex: 6, roleGroup: 'DEF', positionLabel: 'SLB', preferredSubPositions: ['SLB', 'LB', 'LWB', 'SOL BEK', 'SLKB'], x: 14, y: 69 },
    { slotKey: 'LCB', slotIndex: 7, roleGroup: 'DEF', positionLabel: 'STP', preferredSubPositions: ['STP', 'CB', 'STOPER'], x: 38, y: 73 },
    { slotKey: 'RCB', slotIndex: 8, roleGroup: 'DEF', positionLabel: 'STP', preferredSubPositions: ['STP', 'CB', 'STOPER'], x: 62, y: 73 },
    { slotKey: 'RB', slotIndex: 9, roleGroup: 'DEF', positionLabel: 'SĞB', preferredSubPositions: ['SGB', 'RB', 'RWB', 'SAG BEK', 'SGKB'], x: 86, y: 69 },
    { slotKey: 'GK', slotIndex: 10, roleGroup: 'GK', positionLabel: 'KL', preferredSubPositions: ['KL', 'GK', 'KALECI', 'GOALKEEPER'], x: 50, y: 89 },
  ],
  '4-2-3-1': [
    { slotKey: 'ST', slotIndex: 0, roleGroup: 'FWD', positionLabel: 'ST', preferredSubPositions: ['ST', 'CF', 'SANTRFOR', 'FORVET'], x: 50, y: 12 },
    { slotKey: 'LAM', slotIndex: 1, roleGroup: 'MID', positionLabel: 'SLO', preferredSubPositions: ['SLO', 'LM', 'SLK', 'LW', 'OOS', 'CAM'], x: 19, y: 30 },
    { slotKey: 'CAM', slotIndex: 2, roleGroup: 'MID', positionLabel: 'OOS', preferredSubPositions: ['OOS', 'CAM', 'AM', 'MO', 'CM'], x: 50, y: 27 },
    { slotKey: 'RAM', slotIndex: 3, roleGroup: 'MID', positionLabel: 'SĞO', preferredSubPositions: ['SGO', 'RM', 'SGK', 'RW', 'OOS', 'CAM'], x: 81, y: 30 },
    { slotKey: 'LCDM', slotIndex: 4, roleGroup: 'MID', positionLabel: 'MDO', preferredSubPositions: ['MDO', 'CDM', 'DM', 'MO', 'CM'], x: 36, y: 49 },
    { slotKey: 'RCDM', slotIndex: 5, roleGroup: 'MID', positionLabel: 'MDO', preferredSubPositions: ['MDO', 'CDM', 'DM', 'MO', 'CM'], x: 64, y: 49 },
    { slotKey: 'LB', slotIndex: 6, roleGroup: 'DEF', positionLabel: 'SLB', preferredSubPositions: ['SLB', 'LB', 'LWB', 'SOL BEK', 'SLKB'], x: 14, y: 69 },
    { slotKey: 'LCB', slotIndex: 7, roleGroup: 'DEF', positionLabel: 'STP', preferredSubPositions: ['STP', 'CB', 'STOPER'], x: 38, y: 73 },
    { slotKey: 'RCB', slotIndex: 8, roleGroup: 'DEF', positionLabel: 'STP', preferredSubPositions: ['STP', 'CB', 'STOPER'], x: 62, y: 73 },
    { slotKey: 'RB', slotIndex: 9, roleGroup: 'DEF', positionLabel: 'SĞB', preferredSubPositions: ['SGB', 'RB', 'RWB', 'SAG BEK', 'SGKB'], x: 86, y: 69 },
    { slotKey: 'GK', slotIndex: 10, roleGroup: 'GK', positionLabel: 'KL', preferredSubPositions: ['KL', 'GK', 'KALECI', 'GOALKEEPER'], x: 50, y: 89 },
  ],
  '3-5-2': [
    { slotKey: 'LST', slotIndex: 0, roleGroup: 'FWD', positionLabel: 'ST', preferredSubPositions: ['ST', 'CF', 'SANTRFOR', 'FORVET', 'SLK', 'LW'], x: 35, y: 13 },
    { slotKey: 'RST', slotIndex: 1, roleGroup: 'FWD', positionLabel: 'ST', preferredSubPositions: ['ST', 'CF', 'SANTRFOR', 'FORVET', 'SGK', 'RW'], x: 65, y: 13 },
    { slotKey: 'CAM', slotIndex: 2, roleGroup: 'MID', positionLabel: 'OOS', preferredSubPositions: ['OOS', 'CAM', 'AM', 'MO', 'CM'], x: 50, y: 29 },
    { slotKey: 'LM', slotIndex: 3, roleGroup: 'MID', positionLabel: 'SLO', preferredSubPositions: ['SLO', 'LM', 'SLK', 'LW'], x: 14, y: 42 },
    { slotKey: 'LCDM', slotIndex: 4, roleGroup: 'MID', positionLabel: 'MDO', preferredSubPositions: ['MDO', 'CDM', 'DM', 'MO', 'CM'], x: 36, y: 51 },
    { slotKey: 'RCDM', slotIndex: 5, roleGroup: 'MID', positionLabel: 'MDO', preferredSubPositions: ['MDO', 'CDM', 'DM', 'MO', 'CM'], x: 64, y: 51 },
    { slotKey: 'RM', slotIndex: 6, roleGroup: 'MID', positionLabel: 'SĞO', preferredSubPositions: ['SGO', 'RM', 'SGK', 'RW'], x: 86, y: 42 },
    { slotKey: 'LCB', slotIndex: 7, roleGroup: 'DEF', positionLabel: 'STP', preferredSubPositions: ['STP', 'CB', 'STOPER', 'SLB', 'LB'], x: 22, y: 71 },
    { slotKey: 'CB', slotIndex: 8, roleGroup: 'DEF', positionLabel: 'STP', preferredSubPositions: ['STP', 'CB', 'STOPER'], x: 50, y: 74 },
    { slotKey: 'RCB', slotIndex: 9, roleGroup: 'DEF', positionLabel: 'STP', preferredSubPositions: ['STP', 'CB', 'STOPER', 'SGB', 'RB'], x: 78, y: 71 },
    { slotKey: 'GK', slotIndex: 10, roleGroup: 'GK', positionLabel: 'KL', preferredSubPositions: ['KL', 'GK', 'KALECI', 'GOALKEEPER'], x: 50, y: 89 },
  ],
};

const MIDFIELDER_TOKENS = new Set([
  'MIDFIELDER',
  'MID',
  'ORTA SAHA',
  'MDO',
  'CDM',
  'DM',
  'DEFANSIF ORTA SAHA',
  'MO',
  'CM',
  'MERKEZ ORTA SAHA',
  'SGO',
  'RM',
  'SAG ORTA SAHA',
  'SLO',
  'LM',
  'SOL ORTA SAHA',
  'OOS',
  'CAM',
  'AM',
  'OFANSIF ORTA SAHA',
]);

const FORWARD_TOKENS = new Set([
  'FORWARD',
  'FWD',
  'FORVET',
  'SANTRFOR',
  'ST',
  'CF',
  'SGK',
  'RW',
  'RF',
  'SAG KANAT',
  'SLK',
  'LW',
  'LF',
  'SOL KANAT',
]);

export function normalizePosToken(posValue: string | null | undefined): string {
  if (!posValue || typeof posValue !== 'string') return '';
  const trimmed = posValue.trim();
  if (!trimmed) return '';
  const beforeParen = trimmed.split('(')[0].trim();
  return beforeParen
    .replace(/[iıİ]/g, 'I')
    .replace(/[ğĞ]/g, 'G')
    .replace(/[üÜ]/g, 'U')
    .replace(/[şŞ]/g, 'S')
    .replace(/[öÖ]/g, 'O')
    .replace(/[çÇ]/g, 'C')
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

export function isMidfielderPosition(posValue: string | null | undefined): boolean {
  const token = normalizePosToken(posValue);
  return token !== '' && MIDFIELDER_TOKENS.has(token);
}

export function isForwardPosition(posValue: string | null | undefined): boolean {
  const token = normalizePosToken(posValue);
  return token !== '' && FORWARD_TOKENS.has(token);
}

export function classifyPositionRoleGroup(posValue: string | null | undefined): RoleGroup | null {
  if (isGoalkeeperPosition(posValue)) return 'GK';
  if (isDefenderPosition(posValue)) return 'DEF';
  if (isMidfielderPosition(posValue)) return 'MID';
  if (isForwardPosition(posValue)) return 'FWD';
  return null;
}

export interface TotwPlayerCandidate {
  playerId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  primaryPosition: string | null;
  alternativePositions: string[];
  matchPosition: string | null;
  roleGroup: RoleGroup | null;
  eligibleRoleGroups: RoleGroup[];
  teamId: string | null;
  teamName: string | null;
  teamLogo: string | null;
  matchesPlayed: number;
  avgRating: number;
  effectiveRating: number;
  totwScore: number;
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
  playedInWeek: boolean;
}

export interface TotwSlotAssignment {
  slot: TotwFormationSlot;
  player: TotwPlayerCandidate | null;
  isManualOverride: boolean;
}

/**
 * Deterministic score calculation:
 * - Uses the player's actual average match rating in that week if > 0.
 * - If rating is 0 / missing (e.g. manual match entry without ratings), computes a deterministic
 *   fallback rating (6.0 base + role-weighted performance contributions).
 * - Also computes a composite `totwScore` for deterministic tie-breaking when two players share the same rating.
 */
export function computeCandidateMetrics(params: {
  roleGroup: RoleGroup | null;
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
}): { avgRating: number; effectiveRating: number; totwScore: number } {
  const {
    roleGroup,
    matchesPlayed,
    ratingSum,
    ratingCount,
    goals,
    assists,
    saves,
    cleanSheetsGk,
    cleanSheetsDef,
    tacklesMade,
    momCount,
    wins,
    redCards,
    goalsConceded,
  } = params;

  const rawAvg = ratingCount > 0 ? ratingSum / ratingCount : 0;
  const avgRating = Number(rawAvg.toFixed(2));

  let perfBonus = 0;
  if (roleGroup === 'GK') {
    perfBonus = cleanSheetsGk * 0.45 + saves * 0.08 + wins * 0.2 + momCount * 0.35 - goalsConceded * 0.08 - redCards * 0.8;
  } else if (roleGroup === 'DEF') {
    perfBonus = cleanSheetsDef * 0.35 + tacklesMade * 0.06 + goals * 0.35 + assists * 0.25 + wins * 0.2 + momCount * 0.35 - redCards * 0.8;
  } else if (roleGroup === 'MID') {
    perfBonus = goals * 0.35 + assists * 0.35 + tacklesMade * 0.04 + wins * 0.2 + momCount * 0.35 - redCards * 0.8;
  } else {
    perfBonus = goals * 0.45 + assists * 0.3 + wins * 0.2 + momCount * 0.35 - redCards * 0.8;
  }

  const fallbackRating = matchesPlayed > 0 ? Math.min(10, Math.max(4, Number((6.0 + perfBonus).toFixed(2)))) : 0;
  const effectiveRating = avgRating > 0 ? avgRating : fallbackRating;
  const totwScore = Number((effectiveRating * 10 + perfBonus * 2).toFixed(2));

  return { avgRating, effectiveRating, totwScore };
}

export function compareTotwCandidates(a: TotwPlayerCandidate, b: TotwPlayerCandidate): number {
  if (b.effectiveRating !== a.effectiveRating) return b.effectiveRating - a.effectiveRating;
  if (b.totwScore !== a.totwScore) return b.totwScore - a.totwScore;
  const bGA = b.goals + b.assists;
  const aGA = a.goals + a.assists;
  if (bGA !== aGA) return bGA - aGA;
  const bDef = b.cleanSheetsGk + b.cleanSheetsDef + b.saves;
  const aDef = a.cleanSheetsGk + a.cleanSheetsDef + a.saves;
  if (bDef !== aDef) return bDef - aDef;
  if (b.momCount !== a.momCount) return b.momCount - a.momCount;
  if (b.wins !== a.wins) return b.wins - a.wins;
  const nameCmp = a.username.localeCompare(b.username, 'tr');
  if (nameCmp !== 0) return nameCmp;
  return a.playerId.localeCompare(b.playerId);
}

export function getPlayerSubPositionTokens(player: Pick<TotwPlayerCandidate, 'matchPosition' | 'primaryPosition' | 'alternativePositions'>): string[] {
  const tokens: string[] = [];
  for (const raw of [player.matchPosition, player.primaryPosition, ...(player.alternativePositions || [])]) {
    const t = normalizePosToken(raw);
    if (t && !tokens.includes(t)) tokens.push(t);
  }
  return tokens;
}

export function isPlayerCompatibleWithSlot(
  player: Pick<TotwPlayerCandidate, 'roleGroup' | 'eligibleRoleGroups' | 'primaryPosition' | 'alternativePositions' | 'matchPosition'>,
  slot: TotwFormationSlot
): { compatible: boolean; reason?: string } {
  const roles = new Set<RoleGroup>(player.eligibleRoleGroups || []);
  if (player.roleGroup) roles.add(player.roleGroup);
  for (const pos of [player.matchPosition, player.primaryPosition, ...(player.alternativePositions || [])]) {
    const rg = classifyPositionRoleGroup(pos);
    if (rg) roles.add(rg);
  }

  if (roles.has(slot.roleGroup)) {
    return { compatible: true };
  }

  // Tactical versatility: Outfield flexibility across positions (MID can support DEF/FWD; DEF/FWD can support MID)
  const isSlotOutfield = slot.roleGroup !== 'GK';
  const isPlayerOutfield = Array.from(roles).some((r) => r !== 'GK');
  if (isSlotOutfield && isPlayerOutfield) {
    return { compatible: true };
  }

  const roleLabels: Record<RoleGroup, string> = {
    GK: 'Kaleci (KL)',
    DEF: 'Defans (STP / SĞB / SLB)',
    MID: 'Orta Saha (MDO / MO / OOS / SĞO / SLO)',
    FWD: 'Forvet / Kanat (ST / SĞK / SLK)',
  };

  return {
    compatible: false,
    reason: `Pozisyon uyumsuz: ${slot.positionLabel} yuvası için ${roleLabels[slot.roleGroup]} gerekir.`,
  };
}

/**
 * Deterministically selects the best 11 players for a given formation (fixed 3-5-2 by default)
 * from the period's approved match candidates.
 *
 * Requirements:
 * - 1 GK, 3 DEF, 5 MID, 2 FWD = 11 players for 3-5-2.
 * - Prioritizes top candidates by rating and composite score who played in that period.
 * - Sub-position matching preference (e.g. STP, SLB, SGB for DEF; CAM, LM, RM, CDM for MID; ST/LW/RW for FWD).
 * - If a position lacks candidates with primary role matching the slot:
 *   1) Falls back to candidates with that role in eligibleRoleGroups.
 *   2) Falls back to logical alternative outfield positions (e.g. DEF <- MID; FWD <- MID; MID <- FWD/DEF).
 * - Never duplicates a player in more than one slot.
 * - Leaves a slot empty only if total eligible candidate pool has fewer players than slots.
 */
export function selectAutoTotwLineup(
  candidates: TotwPlayerCandidate[],
  formationKey: FormationKey = DEFAULT_TOTW_FORMATION
): {
  assignments: TotwSlotAssignment[];
  missingCount: number;
  missingByRole: Record<RoleGroup, number>;
} {
  const slots = FORMATIONS[formationKey] || FORMATIONS['3-5-2'];
  const usedPlayerIds = new Set<string>();
  const assignmentsByIndex = new Map<number, TotwSlotAssignment>();

  const weekCandidates = candidates
    .filter((c) => c.playedInWeek && c.matchesPlayed > 0 && c.roleGroup !== null)
    .slice()
    .sort(compareTotwCandidates);

  const roleGroups: RoleGroup[] = ['GK', 'DEF', 'MID', 'FWD'];
  const missingByRole: Record<RoleGroup, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const openSlots: TotwFormationSlot[] = [];

  // Pass 1: Assign top candidates whose primary roleGroup matches the slot's roleGroup
  for (const rg of roleGroups) {
    const roleSlots = slots.filter((s) => s.roleGroup === rg);
    const pool = weekCandidates.filter(
      (c) => !usedPlayerIds.has(c.playerId) && c.roleGroup === rg
    );

    const topPool = pool.slice(0, roleSlots.length);
    const assignedInRole = new Set<string>();
    const unassignedRoleSlots: TotwFormationSlot[] = [];

    // Sub-pass 1A: Match preferred sub-positions
    for (const slot of roleSlots) {
      const preferred = new Set(slot.preferredSubPositions.map((p) => normalizePosToken(p)));
      const match = topPool.find((cand) => {
        if (assignedInRole.has(cand.playerId)) return false;
        const subTokens = getPlayerSubPositionTokens(cand);
        return subTokens.some((tok) => preferred.has(tok));
      });

      if (match) {
        assignedInRole.add(match.playerId);
        usedPlayerIds.add(match.playerId);
        assignmentsByIndex.set(slot.slotIndex, {
          slot,
          player: match,
          isManualOverride: false,
        });
      } else {
        unassignedRoleSlots.push(slot);
      }
    }

    // Sub-pass 1B: Fill remaining slots in this role group with remaining topPool candidates
    const remainingCandidates = topPool.filter((c) => !assignedInRole.has(c.playerId));
    for (let i = 0; i < unassignedRoleSlots.length; i++) {
      const slot = unassignedRoleSlots[i];
      const cand = remainingCandidates[i] || null;
      if (cand) {
        assignedInRole.add(cand.playerId);
        usedPlayerIds.add(cand.playerId);
        assignmentsByIndex.set(slot.slotIndex, {
          slot,
          player: cand,
          isManualOverride: false,
        });
      } else {
        openSlots.push(slot);
      }
    }
  }

  // Pass 2: Position fallback for remaining open slots (e.g. DEF, MID, FWD lacking candidates)
  if (openSlots.length > 0) {
    for (const slot of openSlots) {
      if (assignmentsByIndex.has(slot.slotIndex)) continue;

      // 2A: Check remaining candidates with eligibleRoleGroups containing slot.roleGroup
      let fallbackCandidate = weekCandidates.find(
        (c) =>
          !usedPlayerIds.has(c.playerId) &&
          c.eligibleRoleGroups &&
          c.eligibleRoleGroups.includes(slot.roleGroup)
      );

      // 2B: Tactical cross-position fallback for outfield positions
      if (!fallbackCandidate && slot.roleGroup !== 'GK') {
        if (slot.roleGroup === 'DEF') {
          // Unfilled DEF: take best available MID (defensive minded)
          fallbackCandidate = weekCandidates.find(
            (c) => !usedPlayerIds.has(c.playerId) && c.roleGroup === 'MID'
          );
        } else if (slot.roleGroup === 'FWD') {
          // Unfilled FWD: take best available MID (attacking minded)
          fallbackCandidate = weekCandidates.find(
            (c) => !usedPlayerIds.has(c.playerId) && c.roleGroup === 'MID'
          );
        } else if (slot.roleGroup === 'MID') {
          // Unfilled MID: take best available FWD or DEF
          fallbackCandidate = weekCandidates.find(
            (c) =>
              !usedPlayerIds.has(c.playerId) &&
              (c.roleGroup === 'FWD' || c.roleGroup === 'DEF')
          );
        }

        // 2C: Any remaining outfield candidate
        if (!fallbackCandidate) {
          fallbackCandidate = weekCandidates.find(
            (c) => !usedPlayerIds.has(c.playerId) && c.roleGroup !== 'GK'
          );
        }
      }

      if (fallbackCandidate) {
        usedPlayerIds.add(fallbackCandidate.playerId);
        assignmentsByIndex.set(slot.slotIndex, {
          slot,
          player: fallbackCandidate,
          isManualOverride: false,
        });
      } else {
        missingByRole[slot.roleGroup] += 1;
        assignmentsByIndex.set(slot.slotIndex, {
          slot,
          player: null,
          isManualOverride: false,
        });
      }
    }
  }

  const assignments = slots.map(
    (s) =>
      assignmentsByIndex.get(s.slotIndex) || {
        slot: s,
        player: null,
        isManualOverride: false,
      }
  );

  const missingCount = assignments.filter((a) => !a.player).length;
  return { assignments, missingCount, missingByRole };
}
