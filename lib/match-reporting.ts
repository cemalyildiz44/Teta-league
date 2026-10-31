export const STARTING_LINEUP_COUNT = 11;

export type ReportPosition = 'GK' | 'DEF' | 'MID' | 'FWD';
export type ReportStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

/**
 * Computes the required starting lineup size for a team based on its active eligible roster size.
 * - Standard teams with >= 11 active players must select 11 unique starting players.
 * - Teams with < 11 active players in team_memberships (e.g. season roster_min = 7..10)
 *   must select all of their active eligible players without duplication.
 */
export function getRequiredLineupCount(activeRosterCount: number): number {
  if (activeRosterCount <= 0) return STARTING_LINEUP_COUNT;
  return Math.min(STARTING_LINEUP_COUNT, activeRosterCount);
}

/**
 * Returns true if an EA API / EA JSON match ended in a draw (equal scores).
 * EA draw matches are NEVER auto-imported; they are routed to captain manual reporting.
 */
export function isEaMatchDraw(homeScore: number, awayScore: number): boolean {
  return (
    typeof homeScore === 'number' &&
    typeof awayScore === 'number' &&
    !Number.isNaN(homeScore) &&
    !Number.isNaN(awayScore) &&
    homeScore === awayScore
  );
}

export interface ReportPlayerStatInput {
  player_id: string;
  position: ReportPosition;
  goals: number;
  assists: number;
  rating: number | null;
  shots: number;
  passes_made: number;
  pass_attempts: number;
  tackles_made: number;
  tackle_attempts: number;
  saves: number;
  goals_conceded: number;
  cleansheets_gk: number;
  cleansheets_def: number;
  yellow_cards?: number;
  red_cards: number;
  minutes_played?: number;
  is_mom: boolean;
}

export interface ExistingTeamReportSummary {
  id: string;
  team_id: string;
  home_score: number;
  away_score: number;
  status: ReportStatus;
  is_stats_applied?: boolean;
}

export interface TeamMatchReportValidationInput {
  fixtureId: string;
  captainTeamId: string;
  fixtureHomeTeamId: string;
  fixtureAwayTeamId: string;
  fixtureStatus?: string | null;
  matchStatus?: string | null;
  matchSource?: string | null;
  myTeamHasSavedStats?: boolean;
  homeScore: number;
  awayScore: number;
  playedAt: string;
  screenshotUrl?: string | null;
  notes?: string | null;
  players: ReportPlayerStatInput[];
  allowedRosterPlayerIds: string[];
  bannedOrSuspendedPlayerIds?: string[];
  existingTeamReports?: ExistingTeamReportSummary[];
  requiredPlayerCount?: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?:
    | 'MISSING_FIELDS'
    | 'UNAUTHORIZED_TEAM'
    | 'MATCH_ALREADY_PLAYED'
    | 'INVALID_SCORE'
    | 'DUPLICATE_ACTIVE_REPORT'
    | 'EMPTY_ROSTER'
    | 'INVALID_PLAYER_COUNT'
    | 'DUPLICATE_PLAYER'
    | 'UNAUTHORIZED_PLAYER'
    | 'SUSPENDED_PLAYER'
    | 'INVALID_STATS'
    | 'MULTIPLE_MOM';
}

const VALID_POSITIONS: ReadonlySet<string> = new Set(['GK', 'DEF', 'MID', 'FWD']);

/**
 * Validates the selected starting players and their statistics.
 * Enforces:
 * - Eligible active roster is non-empty
 * - Exact required starting count (11 for rosters >= 11, or activeRosterCount when < 11)
 * - No duplicate player selection
 * - Every player belongs to the captain's active team roster
 * - No banned/suspended players
 * - Non-negative integer stats (0..1000) and rating (0..10)
 * - At most 1 MOM per team report
 */
export function validateStartingLineupAndStats(
  players: ReportPlayerStatInput[],
  allowedRosterPlayerIds: string[],
  options?: {
    requiredCount?: number;
    bannedOrSuspendedPlayerIds?: string[];
  }
): ValidationResult {
  const bannedSet = new Set(options?.bannedOrSuspendedPlayerIds ?? []);
  const eligibleRosterIds = (allowedRosterPlayerIds || []).filter((id) => !bannedSet.has(id));

  if (eligibleRosterIds.length === 0) {
    return {
      valid: false,
      code: 'EMPTY_ROSTER',
      error:
        'Takımınızın bu sezon için aktif kadrosunda uygun oyuncu bulunmadığından rapor gönderilemez.',
    };
  }

  const requiredCount =
    options?.requiredCount ?? getRequiredLineupCount(eligibleRosterIds.length);

  if (!Array.isArray(players) || players.length !== requiredCount) {
    return {
      valid: false,
      code: 'INVALID_PLAYER_COUNT',
      error: `Maç raporunda tam ${requiredCount} ilk 11 oyuncusu seçilmelidir (Seçilen: ${
        Array.isArray(players) ? players.length : 0
      }).`,
    };
  }

  const rosterSet = new Set(allowedRosterPlayerIds);
  const seenPlayerIds = new Set<string>();
  let momCount = 0;

  const integerStatFields: Array<keyof ReportPlayerStatInput> = [
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

  for (const player of players) {
    if (!player || typeof player.player_id !== 'string' || !player.player_id.trim()) {
      return {
        valid: false,
        code: 'INVALID_PLAYER_COUNT',
        error: 'İlk 11 kadrosundaki tüm oyuncu alanları seçilmelidir.',
      };
    }

    const playerId = player.player_id.trim();

    if (seenPlayerIds.has(playerId)) {
      return {
        valid: false,
        code: 'DUPLICATE_PLAYER',
        error: 'Aynı oyuncu kadroda birden fazla kez seçilemez.',
      };
    }
    seenPlayerIds.add(playerId);

    if (bannedSet.has(playerId)) {
      return {
        valid: false,
        code: 'SUSPENDED_PLAYER',
        error: 'Cezalı veya askıya alınmış oyuncular maç kadrosuna eklenemez.',
      };
    }

    if (!rosterSet.has(playerId)) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_PLAYER',
        error: 'Yalnızca kendi takımınızın aktif kadrosundaki oyuncuları seçebilirsiniz.',
      };
    }

    if (!VALID_POSITIONS.has(player.position)) {
      return {
        valid: false,
        code: 'INVALID_STATS',
        error: 'Geçersiz oyuncu pozisyonu seçildi.',
      };
    }

    for (const field of integerStatFields) {
      const val = Number(player[field] ?? 0);
      if (!Number.isInteger(val) || val < 0 || val > 1000) {
        return {
          valid: false,
          code: 'INVALID_STATS',
          error: `Geçersiz istatistik değeri (${String(
            field
          )}). Değerler 0 ile 1000 arasında tam sayı olmalıdır.`,
        };
      }
    }

    if (player.rating !== null && player.rating !== undefined) {
      const ratingNum = Number(player.rating);
      if (Number.isNaN(ratingNum) || ratingNum < 0 || ratingNum > 10) {
        return {
          valid: false,
          code: 'INVALID_STATS',
          error: 'Oyuncu reytingi 0.0 ile 10.0 arasında olmalıdır.',
        };
      }
    }

    if (player.is_mom) {
      momCount += 1;
    }
  }

  if (momCount > 1) {
    return {
      valid: false,
      code: 'MULTIPLE_MOM',
      error: 'Bir maçta en fazla 1 Maçın Oyuncusu (MOM) seçilebilir.',
    };
  }

  return { valid: true };
}

/**
 * Validates a full team match report submission before persisting.
 * Blocks COMPLETED / APPROVED / already-played matches and allows all unplayed SCHEDULED fixtures
 * without any draw-only or date filter.
 */
export function validateTeamMatchReportSubmission(
  input: TeamMatchReportValidationInput
): ValidationResult {
  if (!input.fixtureId || !input.captainTeamId || !input.playedAt) {
    return {
      valid: false,
      code: 'MISSING_FIELDS',
      error: 'Gerekli alanları doldurun.',
    };
  }

  const parsedDate = new Date(input.playedAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return {
      valid: false,
      code: 'MISSING_FIELDS',
      error: 'Geçerli bir oynanma tarihi girin.',
    };
  }

  if (
    input.captainTeamId !== input.fixtureHomeTeamId &&
    input.captainTeamId !== input.fixtureAwayTeamId
  ) {
    return {
      valid: false,
      code: 'UNAUTHORIZED_TEAM',
      error: 'Sadece kendi takımınızın maçlarını girebilirsiniz.',
    };
  }

  if (
    input.fixtureStatus !== undefined &&
    input.fixtureStatus !== null &&
    input.fixtureStatus !== 'SCHEDULED'
  ) {
    return {
      valid: false,
      code: 'MATCH_ALREADY_PLAYED',
      error:
        'Tamamlanmış (COMPLETED) veya geçmişte oynanmış fikstürler kaptan raporlamasına kapalıdır.',
    };
  }

  if (
    input.matchStatus === 'APPROVED' ||
    input.matchStatus === 'CANCELLED' ||
    input.matchSource === 'AUTO' ||
    input.matchSource === 'FORFEIT' ||
    input.myTeamHasSavedStats
  ) {
    return {
      valid: false,
      code: 'MATCH_ALREADY_PLAYED',
      error:
        'Onaylanmış (APPROVED) veya geçmişte oynanmış maçlar kaptan raporlamasına kapalıdır.',
    };
  }

  if (
    !Number.isInteger(input.homeScore) ||
    !Number.isInteger(input.awayScore) ||
    input.homeScore < 0 ||
    input.homeScore > 99 ||
    input.awayScore < 0 ||
    input.awayScore > 99
  ) {
    return {
      valid: false,
      code: 'INVALID_SCORE',
      error: 'Skor değerleri 0 ile 99 arasında tam sayı olmalıdır.',
    };
  }

  const existingActiveForMyTeam = (input.existingTeamReports ?? []).find(
    (r) =>
      r.team_id === input.captainTeamId &&
      (r.status === 'PENDING_REVIEW' || r.status === 'APPROVED')
  );

  if (existingActiveForMyTeam) {
    return {
      valid: false,
      code: 'DUPLICATE_ACTIVE_REPORT',
      error: 'Takımınız bu maç için zaten aktif veya onaylanmış bir rapor göndermiş.',
    };
  }

  return validateStartingLineupAndStats(input.players, input.allowedRosterPlayerIds, {
    requiredCount: input.requiredPlayerCount,
    bannedOrSuspendedPlayerIds: input.bannedOrSuspendedPlayerIds,
  });
}

/**
 * Determines whether a fixture should be visible in the captain's unplayed match reporting list.
 * - COMPLETED, CANCELLED, POSTPONED, FORFEITED fixtures are excluded.
 * - APPROVED, CANCELLED, AUTO (EA imported), or FORFEIT matches are excluded.
 * - Only unplayed SCHEDULED fixtures (including those with pending/rejected manual captain reports) are shown.
 */
/**
 * Determines whether a fixture is already finished/completed/closed in a terminal state
 * (COMPLETED, APPROVED, FORFEITED/FORFEIT, or CANCELLED) for the captain Match Management list.
 * Note: An EA match (`source = 'AUTO'`) whose fixture is still `SCHEDULED` and whose match status
 * is still `PENDING_REVIEW` or `REJECTED` is NOT yet completed (`isFinished = false`), so it is
 * never falsely labeled "BİTTİ" before approval/completion.
 */
export function isFixtureFinishedForCaptain(params: {
  fixtureStatus: string;
  matchSource?: 'AUTO' | 'MANUAL' | 'FORFEIT' | string | null;
  matchStatus?: ReportStatus | 'CANCELLED' | string | null;
}): boolean {
  const { fixtureStatus, matchSource, matchStatus } = params;

  if (
    fixtureStatus === 'COMPLETED' ||
    fixtureStatus === 'FORFEITED' ||
    fixtureStatus === 'CANCELLED'
  ) {
    return true;
  }

  if (matchStatus === 'APPROVED' || matchStatus === 'CANCELLED') {
    return true;
  }

  if (matchSource === 'FORFEIT') {
    return true;
  }

  return false;
}

/**
 * Computes the read-only vs actionable display state for each fixture row in the captain's
 * Match Management (/takim/yonet/maclar) table.
 * - Completed/approved matches show statusLabel = 'BİTTİ'.
 * - Cancelled matches show statusLabel = 'İPTAL'.
 * - Forfeited matches show statusLabel = 'HÜKMEN'.
 * - Unapproved EA (`source = 'AUTO'`) matches remain read-only (`canSubmit = false`) but show their
 *   actual match status (`PENDING_REVIEW` / `REJECTED`) instead of being falsely labeled 'BİTTİ'.
 * - Unplayed SCHEDULED matches preserve the "SONUÇ GİR" / "YENİDEN RAPOR GÖNDER" flow.
 */
export function getCaptainFixtureRowState(params: {
  fixtureStatus: string;
  matchSource?: 'AUTO' | 'MANUAL' | 'FORFEIT' | string | null;
  matchStatus?: ReportStatus | 'CANCELLED' | string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  myTeamReportStatus?: ReportStatus | null;
  oppTeamReportStatus?: ReportStatus | null;
  myTeamHasSavedStats?: boolean;
}): {
  isFinished: boolean;
  statusLabel: string;
  scoreText: string | null;
  canSubmit: boolean;
  isResubmission: boolean;
  canViewPendingDetails: boolean;
  hasDualReports: boolean;
} {
  const {
    fixtureStatus,
    matchSource,
    matchStatus,
    homeScore,
    awayScore,
    myTeamReportStatus,
    oppTeamReportStatus,
    myTeamHasSavedStats,
  } = params;

  const isCancelled =
    fixtureStatus === 'CANCELLED' || matchStatus === 'CANCELLED';
  const isForfeited =
    !isCancelled &&
    (fixtureStatus === 'FORFEITED' || matchSource === 'FORFEIT');
  const isFinished = isFixtureFinishedForCaptain({
    fixtureStatus,
    matchSource,
    matchStatus,
  });

  const hasScore =
    homeScore !== null &&
    homeScore !== undefined &&
    awayScore !== null &&
    awayScore !== undefined;
  const scoreText = hasScore ? `${homeScore} - ${awayScore}` : null;
  const hasDualReports = Boolean(myTeamReportStatus || oppTeamReportStatus);

  if (isFinished) {
    const terminalLabel = isCancelled
      ? 'İPTAL'
      : isForfeited
      ? 'HÜKMEN'
      : 'BİTTİ';
    return {
      isFinished: true,
      statusLabel: terminalLabel,
      scoreText,
      canSubmit: false,
      isResubmission: false,
      canViewPendingDetails: false,
      hasDualReports,
    };
  }

  const eligibility = canCaptainSubmitTeamReport({
    fixtureStatus,
    matchSource,
    matchStatus,
    homeScore,
    awayScore,
    myTeamReportStatus,
    myTeamHasSavedStats,
    hasAnyTeamReports: hasDualReports,
  });

  return {
    isFinished: false,
    statusLabel: matchStatus ? String(matchStatus) : fixtureStatus,
    scoreText,
    canSubmit: eligibility.canSubmit,
    isResubmission: eligibility.isResubmission,
    canViewPendingDetails:
      !eligibility.canSubmit &&
      matchSource !== 'AUTO' &&
      myTeamReportStatus === 'PENDING_REVIEW' &&
      Boolean(matchStatus),
    hasDualReports,
  };
}

/**
 * Determines whether a fixture is open for captain reporting (unplayed).
 */
export function isFixtureOpenForCaptainView(params: {
  fixtureStatus: string;
  matchSource?: 'AUTO' | 'MANUAL' | 'FORFEIT' | string | null;
  matchStatus?: ReportStatus | 'CANCELLED' | string | null;
  hasAnyTeamReports?: boolean;
}): boolean {
  const { fixtureStatus, matchSource, matchStatus, hasAnyTeamReports } = params;

  if (fixtureStatus !== 'SCHEDULED') {
    return false;
  }

  if (matchStatus === 'APPROVED' || matchStatus === 'CANCELLED') {
    return false;
  }

  if (matchSource === 'AUTO' || matchSource === 'FORFEIT') {
    return false;
  }

  if (matchStatus === 'PENDING_REVIEW' && matchSource === 'MANUAL' && hasAnyTeamReports === false) {
    return false;
  }

  return true;
}

/**
 * Determines whether a captain can submit (or re-submit) a team report for a fixture.
 * Final Business Rules:
 * 1. COMPLETED, APPROVED, CANCELLED, POSTPONED, FORFEIT, or EA AUTO matches are strictly closed.
 * 2. All unplayed SCHEDULED fixtures are open to captain reporting (not restricted to draws or dates).
 * 3. Each captain can submit 1 active report for their team; if REJECTED (while match is unapproved), can re-submit.
 */
export function canCaptainSubmitTeamReport(params: {
  fixtureStatus: string;
  matchSource?: 'AUTO' | 'MANUAL' | 'FORFEIT' | string | null;
  matchStatus?: ReportStatus | 'CANCELLED' | string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  myTeamReportStatus?: ReportStatus | null;
  myTeamHasSavedStats?: boolean;
  hasAnyTeamReports?: boolean;
}): {
  canSubmit: boolean;
  isResubmission: boolean;
  reason?: string;
} {
  const {
    fixtureStatus,
    matchSource,
    matchStatus,
    myTeamReportStatus,
    myTeamHasSavedStats,
    hasAnyTeamReports,
  } = params;

  if (fixtureStatus !== 'SCHEDULED') {
    return {
      canSubmit: false,
      isResubmission: false,
      reason:
        fixtureStatus === 'COMPLETED'
          ? 'Tamamlanmış (COMPLETED) fikstürler kaptan raporlamasına kapalıdır.'
          : 'Ertelenmiş, iptal edilmiş veya tamamlanmış fikstürler için rapor gönderilemez.',
    };
  }

  if (matchStatus === 'APPROVED' || matchStatus === 'CANCELLED') {
    return {
      canSubmit: false,
      isResubmission: false,
      reason: 'Onaylanmış (APPROVED) veya geçmişte oynanmış maçlar kaptan raporlamasına kapalıdır.',
    };
  }

  if (matchSource === 'AUTO' || matchSource === 'FORFEIT') {
    return {
      canSubmit: false,
      isResubmission: false,
      reason:
        'EA API üzerinden işlenmiş veya hükmen sonuçlanmış maçlar kaptan raporlamasına kapalıdır.',
    };
  }

  if (myTeamHasSavedStats) {
    return {
      canSubmit: false,
      isResubmission: false,
      reason: 'Bu maç için takımınızın oyuncu istatistikleri zaten işlenmiştir.',
    };
  }

  if (matchStatus === 'PENDING_REVIEW' && matchSource === 'MANUAL' && hasAnyTeamReports === false) {
    return {
      canSubmit: false,
      isResubmission: false,
      reason: 'Bu fikstür için zaten bir maç sonucu girilmiş.',
    };
  }

  if (myTeamReportStatus === 'PENDING_REVIEW') {
    return {
      canSubmit: false,
      isResubmission: false,
      reason: 'Takımınızın bu maç için onaya gönderilmiş aktif bir raporu bulunuyor.',
    };
  }

  if (myTeamReportStatus === 'APPROVED') {
    return {
      canSubmit: false,
      isResubmission: false,
      reason: 'Takımınızın bu maç raporu zaten onaylanmış.',
    };
  }

  if (myTeamReportStatus === 'REJECTED') {
    return {
      canSubmit: true,
      isResubmission: true,
    };
  }

  return {
    canSubmit: true,
    isResubmission: false,
  };
}

/**
 * Checks whether the report being reviewed has a score mismatch against either:
 * - the already-approved match score, OR
 * - the opponent captain's active report score.
 */
export function detectReportScoreMismatch(params: {
  targetReport: { home_score: number; away_score: number; team_id: string };
  otherReport?: {
    home_score: number;
    away_score: number;
    status: ReportStatus;
    team_id: string;
  } | null;
  currentMatch?: {
    home_score: number;
    away_score: number;
    status: ReportStatus;
  } | null;
}): {
  hasMismatch: boolean;
  targetScoreText: string;
  referenceScoreText: string | null;
  reason?: string;
} {
  const { targetReport, otherReport, currentMatch } = params;
  const targetScoreText = `${targetReport.home_score} - ${targetReport.away_score}`;

  if (currentMatch && currentMatch.status === 'APPROVED') {
    const matchScoreText = `${currentMatch.home_score} - ${currentMatch.away_score}`;
    if (
      targetReport.home_score !== currentMatch.home_score ||
      targetReport.away_score !== currentMatch.away_score
    ) {
      return {
        hasMismatch: true,
        targetScoreText,
        referenceScoreText: matchScoreText,
        reason: `Rapor skoru (${targetScoreText}), onaylanmış resmi maç skoru (${matchScoreText}) ile uyuşmuyor.`,
      };
    }
  }

  if (
    otherReport &&
    (otherReport.status === 'PENDING_REVIEW' || otherReport.status === 'APPROVED')
  ) {
    const otherScoreText = `${otherReport.home_score} - ${otherReport.away_score}`;
    if (
      targetReport.home_score !== otherReport.home_score ||
      targetReport.away_score !== otherReport.away_score
    ) {
      return {
        hasMismatch: true,
        targetScoreText,
        referenceScoreText: otherScoreText,
        reason: `İki kaptanın bildirdiği skorlar uyuşmuyor (${targetScoreText} vs ${otherScoreText}).`,
      };
    }
  }

  return {
    hasMismatch: false,
    targetScoreText,
    referenceScoreText: null,
  };
}

export interface SimulatedMatchState {
  matchStatus: ReportStatus;
  homeScore: number;
  awayScore: number;
  fixtureStatus: 'SCHEDULED' | 'COMPLETED';
  reports: Record<
    string,
    {
      id: string;
      team_id: string;
      home_score: number;
      away_score: number;
      status: ReportStatus;
      is_stats_applied: boolean;
      rejection_reason?: string | null;
      players: ReportPlayerStatInput[];
    }
  >;
  appliedPlayerStatsByTeam: Record<string, ReportPlayerStatInput[]>;
}

/**
 * Pure state transition for approving one team's match report.
 * Guarantees:
 * - Idempotency: cannot approve or apply stats twice for the same report.
 * - Score mismatch protection: blocks approval if scores differ unless allowScoreMismatch=true.
 * - First report approval sets official match score & status=APPROVED and writes 1st team's player stats.
 * - Second report approval NEVER overwrites the first approved match score and writes ONLY 2nd team's player stats.
 */
export function applyTeamReportApproval(
  state: SimulatedMatchState,
  reportId: string,
  options?: { allowScoreMismatch?: boolean }
): {
  success: boolean;
  error?: string;
  code?: 'NOT_FOUND' | 'ALREADY_APPROVED' | 'SCORE_MISMATCH';
  isFirstApproval?: boolean;
  scoreMismatchResolved?: boolean;
  nextState: SimulatedMatchState;
} {
  const targetReport = state.reports[reportId];
  if (!targetReport) {
    return {
      success: false,
      code: 'NOT_FOUND',
      error: 'Onaylanacak takım raporu bulunamadı.',
      nextState: state,
    };
  }

  if (targetReport.status === 'APPROVED' || targetReport.is_stats_applied) {
    return {
      success: false,
      code: 'ALREADY_APPROVED',
      error: 'Bu rapor zaten onaylanmış ve oyuncu istatistikleri işlenmiş.',
      nextState: state,
    };
  }

  const otherReport = Object.values(state.reports).find(
    (r) =>
      r.id !== targetReport.id &&
      r.team_id !== targetReport.team_id &&
      (r.status === 'PENDING_REVIEW' || r.status === 'APPROVED')
  );

  const isFirstApproval = state.matchStatus !== 'APPROVED';

  const mismatch = detectReportScoreMismatch({
    targetReport,
    otherReport: otherReport ?? null,
    currentMatch: {
      home_score: state.homeScore,
      away_score: state.awayScore,
      status: state.matchStatus,
    },
  });

  if (mismatch.hasMismatch && !options?.allowScoreMismatch) {
    return {
      success: false,
      code: 'SCORE_MISMATCH',
      error: `SKOR_UYUSMAZLIGI: ${mismatch.reason}`,
      nextState: state,
    };
  }

  const nextReports = {
    ...state.reports,
    [reportId]: {
      ...targetReport,
      status: 'APPROVED' as const,
      is_stats_applied: true,
      rejection_reason: null,
    },
  };

  // Apply ONLY this team's player stats, preserving the other team's stats untouched
  const nextAppliedStats = {
    ...state.appliedPlayerStatsByTeam,
    [targetReport.team_id]: targetReport.players.map((p) => ({ ...p })),
  };

  const nextState: SimulatedMatchState = {
    matchStatus: 'APPROVED',
    // First approval sets the official score; second approval preserves the already approved score!
    homeScore: isFirstApproval ? targetReport.home_score : state.homeScore,
    awayScore: isFirstApproval ? targetReport.away_score : state.awayScore,
    fixtureStatus: 'COMPLETED',
    reports: nextReports,
    appliedPlayerStatsByTeam: nextAppliedStats,
  };

  return {
    success: true,
    isFirstApproval,
    scoreMismatchResolved: mismatch.hasMismatch,
    nextState,
  };
}

/**
 * Pure state transition for rejecting one team's match report.
 */
export function applyTeamReportRejection(
  state: SimulatedMatchState,
  reportId: string,
  rejectionReason?: string
): {
  success: boolean;
  error?: string;
  nextState: SimulatedMatchState;
} {
  const targetReport = state.reports[reportId];
  if (!targetReport) {
    return {
      success: false,
      error: 'Reddedilecek takım raporu bulunamadı.',
      nextState: state,
    };
  }

  const nextReports = {
    ...state.reports,
    [reportId]: {
      ...targetReport,
      status: 'REJECTED' as const,
      is_stats_applied: false,
      rejection_reason: rejectionReason?.trim() || 'Yönetici tarafından reddedildi.',
    },
  };

  const nextAppliedStats = { ...state.appliedPlayerStatsByTeam };
  delete nextAppliedStats[targetReport.team_id];

  const otherActiveReport = Object.values(nextReports).find(
    (r) =>
      r.id !== reportId &&
      r.team_id !== targetReport.team_id &&
      (r.status === 'PENDING_REVIEW' || r.status === 'APPROVED')
  );

  let nextMatchStatus = state.matchStatus;
  if (!otherActiveReport) {
    nextMatchStatus = 'REJECTED';
  } else if (otherActiveReport.status === 'PENDING_REVIEW' && state.matchStatus === 'APPROVED') {
    nextMatchStatus = 'PENDING_REVIEW';
  }

  return {
    success: true,
    nextState: {
      ...state,
      matchStatus: nextMatchStatus,
      reports: nextReports,
      appliedPlayerStatsByTeam: nextAppliedStats,
    },
  };
}
