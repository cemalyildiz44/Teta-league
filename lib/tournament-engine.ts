import type { TournamentStandingRow } from '../types/tournament';

export interface RoundRobinMatchPlan {
  round: number;
  matchOrder: number;
  homeId: string;
  awayId: string;
}

/**
 * Generates group letters/names: ['A Grubu', 'B Grubu', 'C Grubu', ...]
 */
export function generateDefaultGroupNames(count: number): string[] {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i < letters.length) {
      names.push(`${letters[i]} Grubu`);
    } else {
      names.push(`Grup ${i + 1}`);
    }
  }
  return names;
}

/**
 * Distributes team application IDs into a specified number of groups evenly.
 */
export function distributeTeamsIntoGroups(teamIds: string[], groupCount: number): string[][] {
  if (groupCount <= 0) groupCount = 1;
  const groups: string[][] = Array.from({ length: groupCount }, () => []);

  teamIds.forEach((teamId, index) => {
    const groupIdx = index % groupCount;
    groups[groupIdx].push(teamId);
  });

  return groups;
}

/**
 * Generates a round-robin schedule for a list of team IDs using the standard polygon/circle algorithm.
 * - Every team plays every other team in the group exactly once.
 * - If the team count is odd, a dummy 'BYE' is added so each team gets 1 bye week across the rounds.
 * - No team plays itself.
 * - Total matches for n teams: n * (n - 1) / 2.
 */
export function generateRoundRobinSchedule(teamIds: string[]): RoundRobinMatchPlan[] {
  if (teamIds.length < 2) return [];

  // Work with a copy of teams
  const pool = [...teamIds];
  const isOdd = pool.length % 2 !== 0;
  if (isOdd) {
    pool.push('__BYE__');
  }

  const n = pool.length; // n is always even now
  const totalRounds = n - 1;
  const matchesPerRound = n / 2;
  const matches: RoundRobinMatchPlan[] = [];

  // Circle rotation method:
  // pool[0] is fixed at top-left.
  // pool[1 ... n-1] rotates clockwise each round.
  for (let round = 1; round <= totalRounds; round++) {
    let matchInRound = 1;

    for (let i = 0; i < matchesPerRound; i++) {
      const t1 = pool[i];
      const t2 = pool[n - 1 - i];

      // Skip the bye match if an odd number of teams
      if (t1 !== '__BYE__' && t2 !== '__BYE__') {
        // Alternate home and away to distribute fairly
        const isAlternate = (round + i) % 2 === 1;
        matches.push({
          round,
          matchOrder: matchInRound++,
          homeId: isAlternate ? t1 : t2,
          awayId: isAlternate ? t2 : t1,
        });
      }
    }

    // Rotate pool elements: keep pool[0] fixed, rotate the rest
    const last = pool.pop()!;
    pool.splice(1, 0, last);
  }

  return matches;
}

/**
 * Calculates live standings for a group from its assigned teams and matches.
 * - Only counts matches with status = 'COMPLETED' and non-null home_score / away_score.
 * - Win = 3 pts, Draw = 1 pt, Loss = 0 pts.
 * - Sorting: Points DESC -> Goal Difference DESC -> Goals For DESC -> Wins DESC -> Team Name ASC.
 */
export function calculateGroupStandings(
  teams: { application_id: string; team_name: string; logo_url?: string | null }[],
  matches: {
    home_application_id: string;
    away_application_id: string;
    home_score: number | null;
    away_score: number | null;
    status: string;
  }[]
): TournamentStandingRow[] {
  const standingsMap: Record<string, TournamentStandingRow> = {};

  // Initialize all teams with 0 stats
  teams.forEach((t) => {
    standingsMap[t.application_id] = {
      application_id: t.application_id,
      team_name: t.team_name,
      logo_url: t.logo_url,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      points: 0,
    };
  });

  // Filter completed/approved matches with valid scores
  const completedMatches = matches.filter(
    (m) =>
      (m.status === 'COMPLETED' || m.status === 'APPROVED') &&
      m.home_score !== null &&
      m.away_score !== null
  );

  completedMatches.forEach((m) => {
    const home = standingsMap[m.home_application_id];
    const away = standingsMap[m.away_application_id];

    if (!home || !away) return;

    const hs = m.home_score!;
    const as = m.away_score!;

    // Home team
    home.played += 1;
    home.goals_for += hs;
    home.goals_against += as;

    // Away team
    away.played += 1;
    away.goals_for += as;
    away.goals_against += hs;

    if (hs > as) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (hs === as) {
      home.drawn += 1;
      home.points += 1;
      away.drawn += 1;
      away.points += 1;
    } else {
      home.lost += 1;
      away.won += 1;
      away.points += 3;
    }
  });

  // Calculate goal differences
  Object.values(standingsMap).forEach((row) => {
    row.goal_difference = row.goals_for - row.goals_against;
  });

  // Sort rows: Points -> Goal Difference -> Goals For -> Wins -> Team Name
  return Object.values(standingsMap).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
    if (b.won !== a.won) return b.won - a.won;
    return a.team_name.localeCompare(b.team_name, 'tr-TR');
  });
}

// ==============================================================================
// PHASE 4: KNOCKOUT BRACKET ENGINE, CROSS-PAIRINGS & ADVANCING LOGIC
// ==============================================================================

export interface AdvancingTeam {
  application_id: string;
  team_name: string;
  logo_url?: string | null;
  applicant_id?: string;
  group_id: string;
  group_name: string;
  rank: number; // 1 = Winner, 2 = Runner-up, etc.
  points: number;
  goal_difference: number;
  goals_for: number;
}

export interface KnockoutMatchPlan {
  stage: 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL';
  roundNumber: number;
  matchOrder: number;
  bracketSlot: string;
  homeTeam: AdvancingTeam | null;
  awayTeam: AdvancingTeam | null;
  isBye: boolean;
  nextBracketSlot?: string | null;
  nextMatchSlotSide?: 'HOME' | 'AWAY' | null;
}

/**
 * Validates that all group stage matches in the tournament are completed and approved.
 */
export function validateGroupStageCompleted(groups: any[], matches: any[]): {
  isComplete: boolean;
  pendingCount: number;
  totalGroupMatches: number;
  error?: string | null;
} {
  if (!groups || groups.length === 0) {
    return { isComplete: false, pendingCount: 0, totalGroupMatches: 0, error: 'Turnuvada henüz grup tanımlanmamış.' };
  }

  const groupMatches = matches.filter((m) => m.group_id !== null && (!m.stage || m.stage === 'GROUP'));
  if (groupMatches.length === 0) {
    return { isComplete: false, pendingCount: 0, totalGroupMatches: 0, error: 'Turnuvada henüz grup maçı oluşturulmamış.' };
  }

  const unapprovedMatches = groupMatches.filter(
    (m) => m.status !== 'APPROVED' && m.status !== 'COMPLETED'
  );

  if (unapprovedMatches.length > 0) {
    return {
      isComplete: false,
      pendingCount: unapprovedMatches.length,
      totalGroupMatches: groupMatches.length,
      error: `Grup aşamasında henüz onaylanmamış ${unapprovedMatches.length} maç bulunmaktadır. Eleme aşaması oluşturulmadan önce tüm grup maçları oynanmalı ve sonuçları onaylanmalıdır.`,
    };
  }

  return { isComplete: true, pendingCount: 0, totalGroupMatches: groupMatches.length, error: null };
}

/**
 * Extracts top advancing teams from each group based on approved matches.
 */
export function extractAdvancingTeams(
  groups: any[],
  matches: any[],
  advancingPerGroup: number = 2
): AdvancingTeam[] {
  const advancing: AdvancingTeam[] = [];

  groups.forEach((g) => {
    const groupTeams = (g.tournament_group_teams || []).map((gt: any) => ({
      application_id: gt.application_id,
      team_name: gt.tournament_applications?.team_name || 'Takım',
      logo_url: gt.tournament_applications?.logo_url,
      applicant_id: gt.tournament_applications?.applicant_id,
    }));

    const groupMatches = matches.filter((m) => m.group_id === g.id);
    const standings = calculateGroupStandings(groupTeams, groupMatches);

    // Pick top advancing teams
    const topTeams = standings.slice(0, advancingPerGroup);
    topTeams.forEach((teamRow, idx) => {
      const orig = groupTeams.find((gt: any) => gt.application_id === teamRow.application_id);
      advancing.push({
        application_id: teamRow.application_id,
        team_name: teamRow.team_name,
        logo_url: teamRow.logo_url,
        applicant_id: orig?.applicant_id,
        group_id: g.id,
        group_name: g.name,
        rank: idx + 1,
        points: teamRow.points,
        goal_difference: teamRow.goal_difference,
        goals_for: teamRow.goals_for,
      });
    });
  });

  return advancing;
}

/**
 * Champions League style cross-pairing generator:
 * - Group winners face group runners-up from DIFFERENT groups.
 * - Same group teams never face each other in the first knockout round.
 * - No team faces itself.
 * - Teams from the same group are placed in opposite halves of the bracket where possible.
 */
export function generateCrossGroupPairings(
  advancingTeams: AdvancingTeam[]
): {
  pairings: { home: AdvancingTeam; away: AdvancingTeam }[];
  byes: AdvancingTeam[];
  error?: string | null;
} {
  const winners = advancingTeams.filter((t) => t.rank === 1);
  const runnersUp = advancingTeams.filter((t) => t.rank === 2);
  const others = advancingTeams.filter((t) => t.rank > 2);

  const totalTeams = advancingTeams.length;
  if (totalTeams < 2) {
    return { pairings: [], byes: [], error: 'Eleme turu için en az 2 takım gereklidir.' };
  }

  // Calculate target power of 2
  let targetPower = 2;
  while (targetPower < totalTeams) {
    targetPower *= 2;
  }

  const byeCount = targetPower - totalTeams;
  const byes: AdvancingTeam[] = [];

  // If BYEs needed, give them to the best-ranked group winners
  let poolWinners = [...winners].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
    return b.goals_for - a.goals_for;
  });

  let poolRunnersUp = [...runnersUp, ...others];

  if (byeCount > 0) {
    // Top winners get BYEs
    for (let i = 0; i < byeCount && poolWinners.length > 0; i++) {
      byes.push(poolWinners.shift()!);
    }
  }

  // Try Champions League cross pairing between poolWinners and poolRunnersUp
  const pairings: { home: AdvancingTeam; away: AdvancingTeam }[] = [];

  // Helper backtracking function to find valid derangement
  function findValidPairing(
    wList: AdvancingTeam[],
    rList: AdvancingTeam[],
    currentIndex: number,
    usedRunnersUp: Set<string>,
    currentPairings: { home: AdvancingTeam; away: AdvancingTeam }[]
  ): boolean {
    if (currentIndex >= wList.length) {
      return true;
    }

    const currentWinner = wList[currentIndex];

    // Candidate runners up: not used yet and from a DIFFERENT group
    const candidates = rList.filter(
      (r) => !usedRunnersUp.has(r.application_id) && r.group_id !== currentWinner.group_id
    );

    for (const candidate of candidates) {
      usedRunnersUp.add(candidate.application_id);
      currentPairings.push({ home: currentWinner, away: candidate });

      if (findValidPairing(wList, rList, currentIndex + 1, usedRunnersUp, currentPairings)) {
        return true;
      }

      // Backtrack
      usedRunnersUp.delete(candidate.application_id);
      currentPairings.pop();
    }

    return false;
  }

  if (poolWinners.length > 0 && poolRunnersUp.length >= poolWinners.length) {
    const success = findValidPairing(poolWinners, poolRunnersUp, 0, new Set(), pairings);
    if (!success) {
      // Fallback: relax strict winner vs runner-up if odd or irregular
      const remainingTeams = [...poolWinners, ...poolRunnersUp];
      while (remainingTeams.length >= 2) {
        const home = remainingTeams.shift()!;
        // Find best match with different group
        let awayIdx = remainingTeams.findIndex((t) => t.group_id !== home.group_id);
        if (awayIdx === -1) awayIdx = 0;
        const [away] = remainingTeams.splice(awayIdx, 1);
        pairings.push({ home, away });
      }
    } else {
      // Check if there are leftover runners up (if runners up were more than winners)
      const usedAwayIds = new Set(pairings.map((p) => p.away.application_id));
      const leftovers = poolRunnersUp.filter((r) => !usedAwayIds.has(r.application_id));
      while (leftovers.length >= 2) {
        const home = leftovers.shift()!;
        let awayIdx = leftovers.findIndex((t) => t.group_id !== home.group_id);
        if (awayIdx === -1) awayIdx = 0;
        const [away] = leftovers.splice(awayIdx, 1);
        pairings.push({ home, away });
      }
      if (leftovers.length === 1) {
        byes.push(leftovers.shift()!);
      }
    }
  } else {
    // If only winners or all from same pool
    const allPool = [...poolWinners, ...poolRunnersUp];
    while (allPool.length >= 2) {
      const home = allPool.shift()!;
      let awayIdx = allPool.findIndex((t) => t.group_id !== home.group_id);
      if (awayIdx === -1) awayIdx = 0;
      const [away] = allPool.splice(awayIdx, 1);
      pairings.push({ home, away });
    }
    if (allPool.length === 1) {
      byes.push(allPool.shift()!);
    }
  }

  // Interleave pairings so same-group teams are in opposite halves of the bracket
  const reorderedPairings: { home: AdvancingTeam; away: AdvancingTeam }[] = [];
  const half = Math.ceil(pairings.length / 2);
  const firstHalf = pairings.slice(0, half);
  const secondHalf = pairings.slice(half);

  for (let i = 0; i < half; i++) {
    if (firstHalf[i]) reorderedPairings.push(firstHalf[i]);
    if (secondHalf[i]) reorderedPairings.push(secondHalf[i]);
  }

  return { pairings: reorderedPairings, byes, error: null };
}

/**
 * Builds the complete knockout tournament bracket structure from first-round pairings.
 * Produces structured matches with bracket slots and links to next-round slots.
 */
export function buildFullKnockoutBracket(
  firstRoundPairings: { home: AdvancingTeam; away: AdvancingTeam }[],
  byes: AdvancingTeam[] = [],
  includeThirdPlace: boolean = true
): KnockoutMatchPlan[] {
  const plans: KnockoutMatchPlan[] = [];

  const totalEffectiveMatches = firstRoundPairings.length + byes.length;
  let initialStage: 'ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL' = 'QUARTER_FINAL';

  if (totalEffectiveMatches > 4) {
    initialStage = 'ROUND_OF_16';
  } else if (totalEffectiveMatches > 2) {
    initialStage = 'QUARTER_FINAL';
  } else if (totalEffectiveMatches > 1) {
    initialStage = 'SEMI_FINAL';
  } else {
    initialStage = 'FINAL';
  }

  // Stage sequence map
  const stages: ('ROUND_OF_16' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL')[] = [
    'ROUND_OF_16',
    'QUARTER_FINAL',
    'SEMI_FINAL',
    'FINAL',
  ];
  const startStageIndex = stages.indexOf(initialStage);
  const activeStages = stages.slice(startStageIndex);

  // 1. Build initial round matches
  let currentRoundMatchesCount = totalEffectiveMatches;
  let currentRoundNumber = 1;

  // First round pairing matches
  let matchOrder = 1;
  firstRoundPairings.forEach((p, idx) => {
    const slot = `${initialStage}_${idx + 1}`;
    const nextSlotIndex = Math.floor(idx / 2) + 1;
    const nextStage = activeStages[1] || 'FINAL';
    const nextBracketSlot = `${nextStage}_${nextSlotIndex}`;
    const nextMatchSlotSide = idx % 2 === 0 ? 'HOME' : 'AWAY';

    plans.push({
      stage: initialStage,
      roundNumber: currentRoundNumber,
      matchOrder: matchOrder++,
      bracketSlot: slot,
      homeTeam: p.home,
      awayTeam: p.away,
      isBye: false,
      nextBracketSlot: activeStages.length > 1 ? nextBracketSlot : null,
      nextMatchSlotSide: activeStages.length > 1 ? nextMatchSlotSide : null,
    });
  });

  // BYE matches in first round (team automatically advances)
  byes.forEach((b, bIdx) => {
    const idx = firstRoundPairings.length + bIdx;
    const slot = `${initialStage}_${idx + 1}`;
    const nextSlotIndex = Math.floor(idx / 2) + 1;
    const nextStage = activeStages[1] || 'FINAL';
    const nextBracketSlot = `${nextStage}_${nextSlotIndex}`;
    const nextMatchSlotSide = idx % 2 === 0 ? 'HOME' : 'AWAY';

    plans.push({
      stage: initialStage,
      roundNumber: currentRoundNumber,
      matchOrder: matchOrder++,
      bracketSlot: slot,
      homeTeam: b,
      awayTeam: null,
      isBye: true,
      nextBracketSlot: activeStages.length > 1 ? nextBracketSlot : null,
      nextMatchSlotSide: activeStages.length > 1 ? nextMatchSlotSide : null,
    });
  });

  // 2. Build subsequent round placeholder matches
  for (let sIdx = 1; sIdx < activeStages.length; sIdx++) {
    const stg = activeStages[sIdx];
    currentRoundNumber += 1;
    const prevMatchesCount = currentRoundMatchesCount;
    currentRoundMatchesCount = Math.max(1, Math.floor(prevMatchesCount / 2));
    const nextStg = activeStages[sIdx + 1];

    let roundMatchOrder = 1;
    for (let mIdx = 0; mIdx < currentRoundMatchesCount; mIdx++) {
      const slot = `${stg}_${mIdx + 1}`;
      const nextSlotIndex = Math.floor(mIdx / 2) + 1;
      const nextBracketSlot = nextStg ? `${nextStg}_${nextSlotIndex}` : null;
      const nextMatchSlotSide = mIdx % 2 === 0 ? 'HOME' : 'AWAY';

      plans.push({
        stage: stg,
        roundNumber: currentRoundNumber,
        matchOrder: roundMatchOrder++,
        bracketSlot: slot,
        homeTeam: null, // to be populated when prev round completes
        awayTeam: null, // to be populated when prev round completes
        isBye: false,
        nextBracketSlot,
        nextMatchSlotSide: nextStg ? nextMatchSlotSide : null,
      });
    }

    // If SEMI_FINAL and includeThirdPlace, add THIRD_PLACE match
    if (stg === 'SEMI_FINAL' && includeThirdPlace) {
      plans.push({
        stage: 'THIRD_PLACE',
        roundNumber: currentRoundNumber + 1,
        matchOrder: 2,
        bracketSlot: 'THIRD_PLACE_1',
        homeTeam: null,
        awayTeam: null,
        isBye: false,
        nextBracketSlot: null,
        nextMatchSlotSide: null,
      });
    }
  }

  return plans;
}

/**
 * Returns human-readable Turkish label for tournament stages.
 */
export function getTournamentStageLabel(stage: string): string {
  switch (stage) {
    case 'ROUND_OF_16':
      return 'Son 16 Turu';
    case 'QUARTER_FINAL':
    case 'QUARTER_FINALS':
      return 'Çeyrek Final';
    case 'SEMI_FINAL':
    case 'SEMI_FINALS':
      return 'Yarı Final';
    case 'THIRD_PLACE':
      return 'Üçüncülük Maçı';
    case 'FINAL':
      return 'Büyük Final';
    case 'GROUP':
    default:
      return 'Grup Aşaması';
  }
}
