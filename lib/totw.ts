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

export const FORMATION_KEYS: FormationKey[] = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'];

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
 * Deterministically selects the best 11 players for a given formation from the week's approved match candidates.
 * - Only considers candidates with `playedInWeek === true` and a valid role matching the slot's `roleGroup`.
 * - Never places a player in more than one slot.
 * - Never places a player of another role group into an unfilled slot; leaves the slot empty (`player: null`) if not enough eligible players exist.
 */
export function selectAutoTotwLineup(
  candidates: TotwPlayerCandidate[],
  formationKey: FormationKey
): {
  assignments: TotwSlotAssignment[];
  missingCount: number;
  missingByRole: Record<RoleGroup, number>;
} {
  const slots = FORMATIONS[formationKey] || FORMATIONS['4-3-3'];
  const usedPlayerIds = new Set<string>();
  const assignmentsByIndex = new Map<number, TotwSlotAssignment>();

  const weekCandidates = candidates
    .filter((c) => c.playedInWeek && c.matchesPlayed > 0 && c.roleGroup !== null)
    .slice()
    .sort(compareTotwCandidates);

  const roleGroups: RoleGroup[] = ['GK', 'DEF', 'MID', 'FWD'];
  const missingByRole: Record<RoleGroup, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

  for (const rg of roleGroups) {
    const roleSlots = slots.filter((s) => s.roleGroup === rg);
    const pool = weekCandidates.filter(
      (c) => !usedPlayerIds.has(c.playerId) && c.roleGroup === rg
    );

    // Take up to roleSlots.length best candidates in this role group
    const topPool = pool.slice(0, roleSlots.length);
    const assignedInRole = new Set<string>();
    const openSlots: TotwFormationSlot[] = [];

    // Pass 1: Match specific sub-positions (e.g., SLB -> LB, STP -> CB, SĞB -> RB) among topPool
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
        openSlots.push(slot);
      }
    }

    // Pass 2: Fill remaining slots in this role group with remaining topPool candidates (same role group only)
    const remainingCandidates = topPool.filter((c) => !assignedInRole.has(c.playerId));
    for (let i = 0; i < openSlots.length; i++) {
      const slot = openSlots[i];
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
        missingByRole[rg] += 1;
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
