export interface TeamRef {
  id: string;
  name?: string;
}

export interface MatchPair {
  home: TeamRef;
  away: TeamRef;
  week: number;
}

export interface FixturePreviewItem {
  week: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  scheduled_at: string;
  is_duplicate: boolean;
}

export interface FixturePreviewResult {
  totalMatches: number;
  newMatchesCount: number;
  duplicateMatchesCount: number;
  weeksCount: number;
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
 * Computes fixture preview, calculates dates, and detects collision/duplicates
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

  const startDate = new Date(startDateStr);
  let duplicateCount = 0;

  const preview: FixturePreviewItem[] = matchPairs.map(mp => {
    const scheduledAt = new Date(startDate.getTime());
    // 7 days between each week
    scheduledAt.setDate(startDate.getDate() + (mp.week - 1) * 7);

    const isDuplicate = existingPairs.has(`${mp.home.id}:${mp.away.id}`);
    if (isDuplicate) duplicateCount++;

    return {
      week: mp.week,
      home_team_id: mp.home.id,
      home_team_name: mp.home.name || 'Ev Sahibi',
      away_team_id: mp.away.id,
      away_team_name: mp.away.name || 'Deplasman',
      scheduled_at: scheduledAt.toISOString(),
      is_duplicate: isDuplicate
    };
  });

  const weeksCount = Math.max(...matchPairs.map(m => m.week), 0);

  return {
    totalMatches: preview.length,
    newMatchesCount: preview.length - duplicateCount,
    duplicateMatchesCount: duplicateCount,
    weeksCount,
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
