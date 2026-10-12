export interface TeamRef {
  id: string;
  name?: string;
}

export interface MatchPair {
  home: TeamRef;
  away: TeamRef;
  week: number;
}

export interface MondaySessionSlot {
  week: number;
  sessionNumber: number;
  mondayOffsetWeeks: number;
  timeTRT: string;
  utcHour: number;
  utcMinute: number;
}

/**
 * Official TETA League Monday Match Night Schedule Configuration:
 * 12 teams, 22 match weeks, played across 8 Monday sessions.
 * Sessions 1-4: Weeks 1-12 (3 matches per Monday: 22:00, 22:30, 23:00 TRT).
 * Devre Arası (Mid-Season Break): Offset 4 weeks (1 full Monday skipped, no fixtures).
 * Sessions 5-6: Weeks 13-18 (3 matches per Monday: 22:00, 22:30, 23:00 TRT).
 * Sessions 7-8: Weeks 19-22 (2 matches per Monday: 22:00, 22:30 TRT).
 *
 * TRT is UTC+3 (permanently, no DST):
 * - 22:00 TRT = 19:00 UTC
 * - 22:30 TRT = 19:30 UTC
 * - 23:00 TRT = 20:00 UTC
 */
export const MONDAY_SESSIONS_CONFIG: Record<
  number,
  { session: number; offsetWeeks: number; timeTRT: string; utcHour: number; utcMinute: number }
> = {
  1:  { session: 1, offsetWeeks: 0, timeTRT: '22:00', utcHour: 19, utcMinute: 0 },
  2:  { session: 1, offsetWeeks: 0, timeTRT: '22:30', utcHour: 19, utcMinute: 30 },
  3:  { session: 1, offsetWeeks: 0, timeTRT: '23:00', utcHour: 20, utcMinute: 0 },

  4:  { session: 2, offsetWeeks: 1, timeTRT: '22:00', utcHour: 19, utcMinute: 0 },
  5:  { session: 2, offsetWeeks: 1, timeTRT: '22:30', utcHour: 19, utcMinute: 30 },
  6:  { session: 2, offsetWeeks: 1, timeTRT: '23:00', utcHour: 20, utcMinute: 0 },

  7:  { session: 3, offsetWeeks: 2, timeTRT: '22:00', utcHour: 19, utcMinute: 0 },
  8:  { session: 3, offsetWeeks: 2, timeTRT: '22:30', utcHour: 19, utcMinute: 30 },
  9:  { session: 3, offsetWeeks: 2, timeTRT: '23:00', utcHour: 20, utcMinute: 0 },

  10: { session: 4, offsetWeeks: 3, timeTRT: '22:00', utcHour: 19, utcMinute: 0 },
  11: { session: 4, offsetWeeks: 3, timeTRT: '22:30', utcHour: 19, utcMinute: 30 },
  12: { session: 4, offsetWeeks: 3, timeTRT: '23:00', utcHour: 20, utcMinute: 0 },

  // Offset 4 weeks (Day 28) = DEVRE ARASI / Mid-Season Break (Skipped Monday, no fixtures)

  13: { session: 5, offsetWeeks: 5, timeTRT: '22:00', utcHour: 19, utcMinute: 0 },
  14: { session: 5, offsetWeeks: 5, timeTRT: '22:30', utcHour: 19, utcMinute: 30 },
  15: { session: 5, offsetWeeks: 5, timeTRT: '23:00', utcHour: 20, utcMinute: 0 },

  16: { session: 6, offsetWeeks: 6, timeTRT: '22:00', utcHour: 19, utcMinute: 0 },
  17: { session: 6, offsetWeeks: 6, timeTRT: '22:30', utcHour: 19, utcMinute: 30 },
  18: { session: 6, offsetWeeks: 6, timeTRT: '23:00', utcHour: 20, utcMinute: 0 },

  19: { session: 7, offsetWeeks: 7, timeTRT: '22:00', utcHour: 19, utcMinute: 0 },
  20: { session: 7, offsetWeeks: 7, timeTRT: '22:30', utcHour: 19, utcMinute: 30 },

  21: { session: 8, offsetWeeks: 8, timeTRT: '22:00', utcHour: 19, utcMinute: 0 },
  22: { session: 8, offsetWeeks: 8, timeTRT: '22:30', utcHour: 19, utcMinute: 30 },
};

/**
 * Returns session number, week offset from base Monday, TRT kick-off string, and UTC hours/minutes.
 */
export function getMondaySessionDetails(weekNumber: number): {
  session: number;
  offsetWeeks: number;
  timeTRT: string;
  utcHour: number;
  utcMinute: number;
} {
  if (MONDAY_SESSIONS_CONFIG[weekNumber]) {
    return MONDAY_SESSIONS_CONFIG[weekNumber];
  }
  // Graceful handling for extra weeks beyond 22
  const extraWeeks = weekNumber - 22;
  const extraSessions = Math.floor((extraWeeks - 1) / 2) + 1;
  const session = 8 + extraSessions;
  const offsetWeeks = 8 + extraSessions;
  const slotInSession = (extraWeeks - 1) % 2;
  const timeTRT = slotInSession === 0 ? '22:00' : '22:30';
  const utcHour = 19;
  const utcMinute = slotInSession === 0 ? 0 : 30;
  return { session, offsetWeeks, timeTRT, utcHour, utcMinute };
}

/**
 * Resolves the initial Monday date anchor from a given start date string.
 * If the provided date is not a Monday, rolls forward to the nearest upcoming Monday.
 * If the provided date is already a Monday, anchors to it directly.
 */
export function getFirstMondayDate(startDateStr: string): Date {
  const cleanStr = startDateStr.split('T')[0].split(' ')[0];
  const parts = cleanStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const dayOfWeek = d.getUTCDay(); // 0: Sunday, 1: Monday, ...
  const daysToAdd = (1 - dayOfWeek + 7) % 7;
  if (daysToAdd > 0) {
    d.setUTCDate(d.getUTCDate() + daysToAdd);
  }
  return d;
}

/**
 * Calculates the exact scheduled ISO timestamp and metadata for a given week.
 */
export function calculateWeekScheduledAt(
  startDateStr: string,
  weekNumber: number
): {
  scheduledAt: string;
  sessionNumber: number;
  timeTRT: string;
  mondayDateStr: string;
  isMidSeasonBreakBefore: boolean;
} {
  const baseMonday = getFirstMondayDate(startDateStr);
  const slot = getMondaySessionDetails(weekNumber);

  const matchDate = new Date(baseMonday.getTime());
  matchDate.setUTCDate(matchDate.getUTCDate() + slot.offsetWeeks * 7);

  const mondayDateStr = matchDate.toISOString().split('T')[0];
  matchDate.setUTCHours(slot.utcHour, slot.utcMinute, 0, 0);

  return {
    scheduledAt: matchDate.toISOString(),
    sessionNumber: slot.session,
    timeTRT: slot.timeTRT,
    mondayDateStr,
    isMidSeasonBreakBefore: weekNumber === 13
  };
}

/**
 * Returns metadata about the mid-season break (Devre Arası).
 */
export function getMidSeasonBreakInfo(startDateStr: string): {
  breakMondayDate: string;
  weekBefore: number;
  weekAfter: number;
  description: string;
} {
  const baseMonday = getFirstMondayDate(startDateStr);
  const breakMonday = new Date(baseMonday.getTime());
  // Devre arası is offset 4 weeks from base Monday
  breakMonday.setUTCDate(breakMonday.getUTCDate() + 4 * 7);
  return {
    breakMondayDate: breakMonday.toISOString().split('T')[0],
    weekBefore: 12,
    weekAfter: 13,
    description: 'Devre Arası & Transfer Dönemi (Maç Oynanmaz)'
  };
}

export interface FixturePreviewItem {
  week: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  scheduled_at: string;
  is_duplicate: boolean;
  session_number?: number;
  time_trt?: string;
}

export interface FixturePreviewResult {
  totalMatches: number;
  newMatchesCount: number;
  duplicateMatchesCount: number;
  weeksCount: number;
  breakInfo?: {
    breakMondayDate: string;
    weekBefore: number;
    weekAfter: number;
    description: string;
  };
  preview: FixturePreviewItem[];
}

/**
 * Standard Round-Robin Algorithm (Berger / Polygon system)
 * Works for both even and odd number of teams.
 * Odd numbers are handled by a 'BYE' team.
 */
export function generateRoundRobin(teams: TeamRef[], doubleRound: boolean = true): MatchPair[] {
  if (!teams || teams.length < 2) return [];

  const participants = [...teams];
  if (participants.length % 2 !== 0) {
    participants.push({ id: 'BYE', name: 'BYE' });
  }

  const n = participants.length;
  const rounds = n - 1;
  const half = n / 2;
  const pairs: MatchPair[] = [];

  // First round (ilk devre)
  for (let r = 0; r < rounds; r++) {
    const week = r + 1;
    for (let i = 0; i < half; i++) {
      const home = participants[i];
      const away = participants[n - 1 - i];

      // Skip dummy BYE matches
      if (home.id === 'BYE' || away.id === 'BYE') continue;

      // Alternate home/away to avoid unfair advantage
      if (r % 2 === 1 && i === 0) {
        pairs.push({ home: away, away: home, week });
      } else {
        pairs.push({ home, away, week });
      }
    }

    // Rotate elements except first
    const last = participants.pop()!;
    participants.splice(1, 0, last);
  }

  // Second round (ikinci devre - rövanş maçları)
  if (doubleRound) {
    const firstRoundPairs = [...pairs];
    for (const p of firstRoundPairs) {
      pairs.push({
        home: p.away,
        away: p.home,
        week: p.week + rounds
      });
    }
  }

  return pairs;
}

/**
 * Computes fixture preview, calculates Monday Session dates & slots, and detects collision/duplicates
 * against already scheduled fixtures without writing to the database.
 */
export function computeFixturePreview(
  teams: TeamRef[],
  existingFixtures: { home_team_id: string; away_team_id: string; week_number?: number }[],
  startDateStr: string,
  doubleRound: boolean = true
): FixturePreviewResult {
  const matchPairs = generateRoundRobin(teams, doubleRound);
  if (matchPairs.length === 0) {
    return {
      totalMatches: 0,
      newMatchesCount: 0,
      duplicateMatchesCount: 0,
      weeksCount: 0,
      preview: []
    };
  }

  const existingPairs = new Set(
    existingFixtures.map(f => `${f.home_team_id}:${f.away_team_id}`)
  );

  let duplicateCount = 0;

  const preview: FixturePreviewItem[] = matchPairs.map(mp => {
    const { scheduledAt, sessionNumber, timeTRT } = calculateWeekScheduledAt(startDateStr, mp.week);

    const isDuplicate = existingPairs.has(`${mp.home.id}:${mp.away.id}`);
    if (isDuplicate) duplicateCount++;

    return {
      week: mp.week,
      home_team_id: mp.home.id,
      home_team_name: mp.home.name || 'Ev Sahibi',
      away_team_id: mp.away.id,
      away_team_name: mp.away.name || 'Deplasman',
      scheduled_at: scheduledAt,
      is_duplicate: isDuplicate,
      session_number: sessionNumber,
      time_trt: timeTRT
    };
  });

  const weeksCount = Math.max(...matchPairs.map(m => m.week), 0);
  const breakInfo = getMidSeasonBreakInfo(startDateStr);

  return {
    totalMatches: preview.length,
    newMatchesCount: preview.length - duplicateCount,
    duplicateMatchesCount: duplicateCount,
    weeksCount,
    breakInfo,
    preview
  };
}

/**
 * Validates updates to a fixture.
 * Ensures:
 * 1. Week number is a positive integer (> 0).
 * 2. Home and away teams are different.
 * 3. Teams cannot be modified if a match record is linked (preserves composite FK).
 * 4. Status belongs to allowed fixture status enum.
 */
export function validateFixtureUpdate(
  currentFixture: { home_team_id: string; away_team_id: string; week_number: number; status: string },
  data: { home_team_id?: string; away_team_id?: string; week_number?: number; status?: string; scheduled_at?: string },
  hasLinkedMatch: boolean
): { success: true } | { error: string } {
  if (data.week_number !== undefined) {
    if (!Number.isInteger(data.week_number) || data.week_number < 1) {
      return { error: 'Hafta numarası 1 veya daha büyük bir tam sayı olmalıdır.' };
    }
  }

  const newHome = data.home_team_id || currentFixture.home_team_id;
  const newAway = data.away_team_id || currentFixture.away_team_id;

  if (newHome === newAway) {
    return { error: 'Ev sahibi ve deplasman takımları aynı olamaz.' };
  }

  if (data.home_team_id || data.away_team_id) {
    if (hasLinkedMatch) {
      return {
        error: 'Bu fikstüre bağlı oynanmış/kaydedilmiş bir maç kaydı bulunmaktadır. Takımları değiştirmek için önce bağlı maçı silmelisiniz.'
      };
    }
  }

  if (data.status) {
    const validStatuses = ['SCHEDULED', 'POSTPONED', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(data.status)) {
      return { error: 'Geçersiz fikstür durumu: ' + data.status };
    }
  }

  if (data.scheduled_at) {
    const parsed = new Date(data.scheduled_at);
    if (isNaN(parsed.getTime())) {
      return { error: 'Geçersiz maç tarihi.' };
    }
  }

  return { success: true };
}

/**
 * Validates match score input and ensures decoupling:
 * Setting or editing a score NEVER auto-approves a match.
 */
export function validateAndDetermineScoreStatus(
  homeScore: number,
  awayScore: number,
  existingMatch: { id: string; status: string } | null
): { success: true; targetStatus: string; isPreservedStatus: boolean } | { error: string } {
  if (
    typeof homeScore !== 'number' ||
    typeof awayScore !== 'number' ||
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    return { error: 'Geçersiz skor: Skorlar negatif olamaz ve tam sayı olmalıdır.' };
  }

  if (existingMatch) {
    // Status is strictly preserved (never promoted to APPROVED)
    return {
      success: true,
      targetStatus: existingMatch.status,
      isPreservedStatus: true
    };
  } else {
    // New match record is created in PENDING_REVIEW (never APPROVED)
    return {
      success: true,
      targetStatus: 'PENDING_REVIEW',
      isPreservedStatus: false
    };
  }
}
