export interface CsvSeasonStatsRawRow {
  lineNumber: number;
  rawLine: string;
  eaId: string;
  currentTeam: string;
  season: string;
  playedTeam: string;
  rawMatches: string;
  rawGoals: string;
  rawAssists: string;
  rawRating: string;
  columnCount: number;
}

export interface ImporterProfileRef {
  id: string;
  username: string;
  full_name?: string | null;
  current_ea_player_id: string | null;
  status?: string | null;
}

export interface ImporterTeamRef {
  id: string;
  name: string;
  logo_url?: string | null;
  is_active?: boolean;
}

export interface ImporterLeagueTeamRef {
  season_id: string;
  league_id: string;
  team_id: string;
  league_name: string;
}

export interface ImporterExistingLegacyStatRef {
  id: string;
  player_id: string;
  season_name: string;
  league_name: string;
  team_id: string | null;
  team_name: string;
  matches_played: number;
  goals: number;
  assists: number;
  rating_avg: number;
}

export type PlayerMatchStatus = 'EXACT' | 'AMBIGUOUS' | 'UNMATCHED' | 'MANUAL_LINKED';
export type TeamMatchStatus = 'EXACT' | 'UNRECOGNIZED' | 'MANUAL_EXISTING' | 'MANUAL_CUSTOM';

export type CsvRowImportStatus =
  | 'READY'
  | 'EXCLUDED_SEASON'
  | 'INVALID_STATS'
  | 'DUPLICATE_IN_CSV'
  | 'NEEDS_PLAYER_MATCH'
  | 'NEEDS_TEAM_MATCH'
  | 'EXISTING_IN_DB';

export type ManualTeamResolution =
  | { mode: 'EXISTING'; teamId: string }
  | { mode: 'CUSTOM'; customName?: string };

export interface EvaluatedCsvStatRow {
  lineNumber: number;
  eaId: string;
  currentTeam: string;
  csvSeason: string;
  playedTeam: string;
  matchesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  ratingAvg: number | null;
  status: CsvRowImportStatus;
  statusReasons: string[];
  playerMatchStatus: PlayerMatchStatus | null;
  resolvedPlayerId: string | null;
  resolvedPlayerUsername: string | null;
  candidateProfiles: ImporterProfileRef[];
  teamMatchStatus: TeamMatchStatus | null;
  resolvedTeamId: string | null;
  resolvedTeamName: string | null;
  resolvedLeagueName: string;
  targetSeasonName: string;
  existingDbRecordId: string | null;
  duplicateOfLineNumber: number | null;
}

export interface UnmatchedPlayerGroup {
  eaId: string;
  matchStatus: 'UNMATCHED' | 'AMBIGUOUS' | 'MANUAL_LINKED';
  rowCount: number;
  playedTeams: string[];
  candidateProfiles: ImporterProfileRef[];
  resolvedPlayerId: string | null;
  resolvedPlayerUsername: string | null;
  ambiguityReason: string | null;
}

export interface UnrecognizedTeamGroup {
  playedTeam: string;
  matchStatus: 'UNRECOGNIZED' | 'MANUAL_EXISTING' | 'MANUAL_CUSTOM';
  rowCount: number;
  candidateTeams: ImporterTeamRef[];
  resolvedTeamId: string | null;
  resolvedTeamName: string | null;
}

export interface CsvSeasonStatsPreviewResult {
  headerValid: boolean;
  headerError: string | null;
  detectedDelimiter: ';' | ',';
  headers: string[];
  totalCsvRows: number;
  includedSeasonRows: number;
  excludedSeasonRows: number;
  excludedReasonsBreakdown: Record<string, number>;
  uniqueEaIdsAll: number;
  uniqueEaIdsInScope: number;
  matchedPlayersCount: number;
  ambiguousPlayersCount: number;
  unmatchedPlayersCount: number;
  manuallyLinkedPlayersCount: number;
  multiTeamPlayersCount: number;
  teamBasedRecordCount: number;
  unrecognizedTeamsCount: number;
  invalidStatRowsCount: number;
  duplicateCsvRowsCount: number;
  existingDbCollisionsCount: number;
  readyToImportCount: number;
  skippedOrBlockedCount: number;
  unmatchedOrAmbiguousPlayerGroups: UnmatchedPlayerGroup[];
  unrecognizedTeamGroups: UnrecognizedTeamGroup[];
  rows: EvaluatedCsvStatRow[];
  readyPayloads: ReadyLegacyStatInsertPayload[];
}

export interface ReadyLegacyStatInsertPayload {
  lineNumber: number;
  eaId: string;
  player_id: string;
  player_username: string;
  season_name: string;
  league_name: string;
  team_id: string | null;
  team_name: string;
  matches_played: number;
  goals: number;
  assists: number;
  rating_avg: number;
}

export interface EvaluateCsvOptions {
  csvContent: string;
  targetCsvSeason?: string;
  targetSeasonName?: string;
  targetSeasonId?: string | null;
  defaultLeagueName?: string;
  profiles: ImporterProfileRef[];
  teams: ImporterTeamRef[];
  leagueTeams?: ImporterLeagueTeamRef[];
  existingLegacyStats: ImporterExistingLegacyStatRef[];
  manualPlayerOverrides?: Record<string, string>; // eaId -> profile.id
  manualTeamOverrides?: Record<string, ManualTeamResolution>; // playedTeam -> resolution
}

export const DEFAULT_TARGET_CSV_SEASON = 'TETA League 5. Sezon';
export const DEFAULT_TARGET_LEAGUE_NAME = 'TETA Süper Lig';

const CANONICAL_HEADER_LABELS = [
  'EA ID',
  'Güncel Takım',
  'Sezon',
  'Oynadığı Takım',
  'Maç',
  'Gol',
  'Asist',
  'Ort. Rating'
] as const;

export function stripUtf8Bom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

export function foldCase(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase();
}

/**
 * Normalizes an EA player ID for case-insensitive matching.
 * Trims leading/trailing whitespace and lowercases the string using standard lowercase.
 * Preserves underscores, hyphens, dots, numbers, and does not alter non-casing characters.
 */
export function normalizeEaIdCase(val: string | null | undefined): string {
  if (!val) return '';
  return val.trim().toLowerCase();
}

export function normalizeHeaderName(header: string): string {
  return foldCase(stripUtf8Bom(header).replace(/\s+/g, ' '));
}

const EXPECTED_HEADERS = CANONICAL_HEADER_LABELS.map(normalizeHeaderName);

/**
 * Splits a single CSV line respecting optional double quotes.
 */
export function splitCsvLine(line: string, delimiter: ';' | ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Checks if two season names represent the same season (supporting Season 5 canonical aliases).
 */
export function isEquivalentSeasonName(a: string, b: string): boolean {
  const fa = foldCase(a);
  const fb = foldCase(b);
  if (fa === fb) return true;

  const s5Aliases = new Set([
    'teta league 5. sezon',
    'teta season 5',
    '5. sezon',
    'sezon 5',
    'season 5',
    'teta s5'
  ]);

  if (s5Aliases.has(fa) && s5Aliases.has(fb)) {
    return true;
  }
  return false;
}

/**
 * Parses a strict non-negative integer string.
 */
export function parseStrictNonNegativeInt(
  raw: string,
  fieldLabel: string
): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') {
    return { value: null, error: `${fieldLabel} değeri eksik veya boş.` };
  }
  if (/^-\d+$/.test(trimmed)) {
    return { value: null, error: `${fieldLabel} negatif olamaz (${trimmed}).` };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { value: null, error: `${fieldLabel} geçerli bir tam sayı değil (${trimmed}).` };
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num < 0) {
    return { value: null, error: `${fieldLabel} geçerli aralıkta değil (${trimmed}).` };
  }
  return { value: num, error: null };
}

/**
 * Parses average rating in [0.00, 10.00], preserving decimal point (e.g. "8.05" or "8,05" -> 8.05).
 */
export function parseStrictRatingAvg(
  raw: string
): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') {
    return { value: null, error: 'Ort. Rating değeri eksik (boş).' };
  }
  const normalized = trimmed.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return { value: null, error: `Ort. Rating geçerli bir ondalık sayı değil (${trimmed}).` };
  }
  const num = Number(normalized);
  if (Number.isNaN(num)) {
    return { value: null, error: `Ort. Rating okunamadı (${trimmed}).` };
  }
  if (num < 0) {
    return { value: null, error: `Ort. Rating negatif olamaz (${trimmed}).` };
  }
  if (num > 10) {
    return { value: null, error: `Ort. Rating 10.00 değerinden büyük olamaz (${trimmed}).` };
  }
  const rounded = Math.round(num * 100) / 100;
  return { value: rounded, error: null };
}

/**
 * Parses raw CSV text into header validation + structured raw rows.
 */
export function parseSeasonStatsCsv(csvContent: string): {
  headerValid: boolean;
  headerError: string | null;
  detectedDelimiter: ';' | ',';
  headers: string[];
  rawRows: CsvSeasonStatsRawRow[];
} {
  const cleanText = stripUtf8Bom(csvContent || '');
  const allLines = cleanText.split(/\r?\n/);

  // Find first non-empty line as header
  let headerLineIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].trim().length > 0) {
      headerLineIdx = i;
      break;
    }
  }

  if (headerLineIdx === -1) {
    return {
      headerValid: false,
      headerError: 'CSV dosyası boş.',
      detectedDelimiter: ';',
      headers: [],
      rawRows: []
    };
  }

  const headerLine = allLines[headerLineIdx];
  const detectedDelimiter: ';' | ',' = headerLine.includes(';') ? ';' : ',';
  const rawHeaders = splitCsvLine(headerLine, detectedDelimiter);
  const normalizedHeaders = rawHeaders.map(normalizeHeaderName);

  if (rawHeaders.length !== EXPECTED_HEADERS.length) {
    return {
      headerValid: false,
      headerError: `CSV sütun sayısı hatalı: ${EXPECTED_HEADERS.length} sütun bekleniyordu (EA ID; Güncel Takım; Sezon; Oynadığı Takım; Maç; Gol; Asist; Ort. Rating), ancak ${rawHeaders.length} sütun bulundu.`,
      detectedDelimiter,
      headers: rawHeaders,
      rawRows: []
    };
  }

  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (normalizedHeaders[i] !== EXPECTED_HEADERS[i]) {
      return {
        headerValid: false,
        headerError: `CSV ${i + 1}. sütun başlığı hatalı: "${EXPECTED_HEADERS[i]}" bekleniyordu, "${rawHeaders[i]}" bulundu.`,
        detectedDelimiter,
        headers: rawHeaders,
        rawRows: []
      };
    }
  }

  const rawRows: CsvSeasonStatsRawRow[] = [];
  for (let i = headerLineIdx + 1; i < allLines.length; i++) {
    const line = allLines[i];
    if (line.trim().length === 0) continue;
    const cols = splitCsvLine(line, detectedDelimiter);
    rawRows.push({
      lineNumber: i + 1,
      rawLine: line,
      eaId: (cols[0] ?? '').trim(),
      currentTeam: (cols[1] ?? '').trim(),
      season: (cols[2] ?? '').trim(),
      playedTeam: (cols[3] ?? '').trim(),
      rawMatches: (cols[4] ?? '').trim(),
      rawGoals: (cols[5] ?? '').trim(),
      rawAssists: (cols[6] ?? '').trim(),
      rawRating: (cols[7] ?? '').trim(),
      columnCount: cols.length
    });
  }

  return {
    headerValid: true,
    headerError: null,
    detectedDelimiter,
    headers: rawHeaders,
    rawRows
  };
}

/**
 * Evaluates parsed CSV rows against profiles, teams, and existing DB legacy career stats.
 * Pure, deterministic function with zero side effects.
 */
export function evaluateSeasonStatsCsv(options: EvaluateCsvOptions): CsvSeasonStatsPreviewResult {
  const targetCsvSeason = (options.targetCsvSeason || DEFAULT_TARGET_CSV_SEASON).trim();
  const targetSeasonName = (options.targetSeasonName || targetCsvSeason).trim();
  const defaultLeagueName = (options.defaultLeagueName || DEFAULT_TARGET_LEAGUE_NAME).trim();
  const manualPlayerOverrides = options.manualPlayerOverrides || {};
  const manualTeamOverrides = options.manualTeamOverrides || {};

  const parsed = parseSeasonStatsCsv(options.csvContent);
  if (!parsed.headerValid) {
    return {
      headerValid: false,
      headerError: parsed.headerError,
      detectedDelimiter: parsed.detectedDelimiter,
      headers: parsed.headers,
      totalCsvRows: 0,
      includedSeasonRows: 0,
      excludedSeasonRows: 0,
      excludedReasonsBreakdown: {},
      uniqueEaIdsAll: 0,
      uniqueEaIdsInScope: 0,
      matchedPlayersCount: 0,
      ambiguousPlayersCount: 0,
      unmatchedPlayersCount: 0,
      manuallyLinkedPlayersCount: 0,
      multiTeamPlayersCount: 0,
      teamBasedRecordCount: 0,
      unrecognizedTeamsCount: 0,
      invalidStatRowsCount: 0,
      duplicateCsvRowsCount: 0,
      existingDbCollisionsCount: 0,
      readyToImportCount: 0,
      skippedOrBlockedCount: 0,
      unmatchedOrAmbiguousPlayerGroups: [],
      unrecognizedTeamGroups: [],
      rows: [],
      readyPayloads: []
    };
  }

  // 1. Index profiles by exact EA ID and case-insensitive normalized EA ID
  const profileById = new Map<string, ImporterProfileRef>();
  const profilesByNormEaId = new Map<string, ImporterProfileRef[]>();

  for (const p of options.profiles) {
    profileById.set(p.id, p);
    const ea = p.current_ea_player_id?.trim();
    if (ea) {
      const normEa = normalizeEaIdCase(ea);
      const list = profilesByNormEaId.get(normEa) || [];
      list.push(p);
      profilesByNormEaId.set(normEa, list);
    }
  }

  // 2. Index teams by exact name and case-folded name
  const teamById = new Map<string, ImporterTeamRef>();
  const teamsByFoldedName = new Map<string, ImporterTeamRef[]>();
  for (const t of options.teams) {
    teamById.set(t.id, t);
    const folded = foldCase(t.name);
    const list = teamsByFoldedName.get(folded) || [];
    list.push(t);
    teamsByFoldedName.set(folded, list);
  }

  // 3. Index league_teams by (season_id, team_id) for automatic league_name resolution
  const leagueNameByTeamId = new Map<string, string>();
  if (options.leagueTeams && options.targetSeasonId) {
    for (const lt of options.leagueTeams) {
      if (lt.season_id === options.targetSeasonId && lt.team_id && lt.league_name) {
        leagueNameByTeamId.set(lt.team_id, lt.league_name);
      }
    }
  }

  // 4. Analyze unique EA IDs across all rows and within target season scope
  const allEaIdsSet = new Set<string>();
  const inScopeEaIdsSet = new Set<string>();
  const inScopeTeamsByEaId = new Map<string, Set<string>>();

  for (const r of parsed.rawRows) {
    if (r.eaId) allEaIdsSet.add(r.eaId);
    if (r.season === targetCsvSeason && r.eaId) {
      inScopeEaIdsSet.add(r.eaId);
      if (!inScopeTeamsByEaId.has(r.eaId)) {
        inScopeTeamsByEaId.set(r.eaId, new Set());
      }
      if (r.playedTeam) {
        inScopeTeamsByEaId.get(r.eaId)!.add(r.playedTeam);
      }
    }
  }

  // 5. Resolve each unique in-scope EA ID -> profile
  interface ResolvedEaPlayerInfo {
    status: PlayerMatchStatus;
    profile: ImporterProfileRef | null;
    candidates: ImporterProfileRef[];
    ambiguityReason: string | null;
  }

  const isProfileActive = (p: ImporterProfileRef) => !p.status || p.status === 'ACTIVE';

  const eaResolutionMap = new Map<string, ResolvedEaPlayerInfo>();
  for (const eaId of inScopeEaIdsSet) {
    const normEa = normalizeEaIdCase(eaId);
    const allCandidates = profilesByNormEaId.get(normEa) || [];
    const activeCandidates = allCandidates.filter(isProfileActive);

    // Check manual override first
    const manualProfileId = manualPlayerOverrides[eaId];
    if (manualProfileId && profileById.has(manualProfileId)) {
      const mp = profileById.get(manualProfileId)!;
      eaResolutionMap.set(eaId, {
        status: 'MANUAL_LINKED',
        profile: mp,
        candidates: allCandidates,
        ambiguityReason: null
      });
      continue;
    }

    if (activeCandidates.length === 0) {
      eaResolutionMap.set(eaId, {
        status: 'UNMATCHED',
        profile: null,
        candidates: allCandidates,
        ambiguityReason: allCandidates.length > 0
          ? `Bu EA ID ile eşleşen profil aktif değil (${allCandidates.map(c => c.username).join(', ')}). Admin seçimi gereklidir.`
          : null
      });
    } else if (activeCandidates.length > 1) {
      eaResolutionMap.set(eaId, {
        status: 'AMBIGUOUS',
        profile: null,
        candidates: activeCandidates,
        ambiguityReason: `Bu EA ID ile büyük/küçük harf duyarsız eşleşen birden fazla (${activeCandidates.length}) aktif oyuncu profili bulundu. Admin seçimi gereklidir.`
      });
    } else {
      const single = activeCandidates[0];
      eaResolutionMap.set(eaId, {
        status: 'EXACT',
        profile: single,
        candidates: [single],
        ambiguityReason: null
      });
    }
  }

  // Guard: Prevent linking two distinct EA IDs (different normalized names) to the same profile in the same import
  const eaIdsByResolvedProfileId = new Map<string, string[]>();
  for (const [eaId, res] of eaResolutionMap.entries()) {
    if (res.profile) {
      const list = eaIdsByResolvedProfileId.get(res.profile.id) || [];
      list.push(eaId);
      eaIdsByResolvedProfileId.set(res.profile.id, list);
    }
  }
  for (const [, eaList] of eaIdsByResolvedProfileId.entries()) {
    const distinctNorm = new Set(eaList.map(normalizeEaIdCase));
    if (distinctNorm.size > 1) {
      for (const eaId of eaList) {
        const current = eaResolutionMap.get(eaId)!;
        const uname = current.profile?.username || '';
        eaResolutionMap.set(eaId, {
          status: 'AMBIGUOUS',
          profile: null,
          candidates: current.candidates,
          ambiguityReason: `@${uname} profili aynı içe aktarmada birden fazla farklı EA ID (${eaList.join(', ')}) için seçilmiş. Her farklı EA ID ayrı bir profile bağlanmalıdır.`
        });
      }
    }
  }

  // 6. Resolve each unique in-scope playedTeam -> team
  interface ResolvedTeamInfo {
    status: TeamMatchStatus;
    teamId: string | null;
    teamName: string;
    candidates: ImporterTeamRef[];
  }

  const uniqueInScopeTeams = new Set<string>();
  for (const r of parsed.rawRows) {
    if (r.season === targetCsvSeason && r.playedTeam && r.playedTeam !== '-') {
      uniqueInScopeTeams.add(r.playedTeam);
    }
  }

  const teamResolutionMap = new Map<string, ResolvedTeamInfo>();
  for (const playedTeam of uniqueInScopeTeams) {
    const folded = foldCase(playedTeam);
    const candidates = teamsByFoldedName.get(folded) || [];

    const manualOverride = manualTeamOverrides[playedTeam];
    if (manualOverride) {
      if (manualOverride.mode === 'EXISTING' && teamById.has(manualOverride.teamId)) {
        const t = teamById.get(manualOverride.teamId)!;
        teamResolutionMap.set(playedTeam, {
          status: 'MANUAL_EXISTING',
          teamId: t.id,
          teamName: t.name,
          candidates
        });
        continue;
      } else if (manualOverride.mode === 'CUSTOM') {
        teamResolutionMap.set(playedTeam, {
          status: 'MANUAL_CUSTOM',
          teamId: null,
          teamName: (manualOverride.customName || playedTeam).trim(),
          candidates
        });
        continue;
      }
    }

    const exactMatches = candidates.filter(t => t.name.trim() === playedTeam);
    if (exactMatches.length === 1 && candidates.length === 1) {
      teamResolutionMap.set(playedTeam, {
        status: 'EXACT',
        teamId: exactMatches[0].id,
        teamName: exactMatches[0].name,
        candidates
      });
    } else {
      teamResolutionMap.set(playedTeam, {
        status: 'UNRECOGNIZED',
        teamId: null,
        teamName: playedTeam,
        candidates
      });
    }
  }

  // 7. Evaluate rows sequentially
  const excludedReasonsBreakdown: Record<string, number> = {};
  const seenCsvComboLine = new Map<string, number>(); // key -> first lineNumber
  const seenResolvedComboLine = new Map<string, number>(); // resolvedPlayer+Season+Team -> first lineNumber
  const evaluatedRows: EvaluatedCsvStatRow[] = [];

  for (const raw of parsed.rawRows) {
    // Check season filter first
    if (raw.season !== targetCsvSeason) {
      let reason = '';
      if (raw.season === '-') {
        reason = "Sezon '-' olduğu için kapsam dışı";
      } else if (raw.season === '') {
        reason = 'Sezon alanı boş olduğu için kapsam dışı';
      } else {
        reason = `Farklı veya tanınmayan sezon ("${raw.season}")`;
      }
      excludedReasonsBreakdown[reason] = (excludedReasonsBreakdown[reason] || 0) + 1;

      evaluatedRows.push({
        lineNumber: raw.lineNumber,
        eaId: raw.eaId,
        currentTeam: raw.currentTeam,
        csvSeason: raw.season,
        playedTeam: raw.playedTeam,
        matchesPlayed: null,
        goals: null,
        assists: null,
        ratingAvg: null,
        status: 'EXCLUDED_SEASON',
        statusReasons: [reason],
        playerMatchStatus: null,
        resolvedPlayerId: null,
        resolvedPlayerUsername: null,
        candidateProfiles: [],
        teamMatchStatus: null,
        resolvedTeamId: null,
        resolvedTeamName: null,
        resolvedLeagueName: defaultLeagueName,
        targetSeasonName,
        existingDbRecordId: null,
        duplicateOfLineNumber: null
      });
      continue;
    }

    // In-scope Season 5 row: validate column count & stats
    const statErrors: string[] = [];
    if (raw.columnCount !== EXPECTED_HEADERS.length) {
      statErrors.push(`Satırda ${ EXPECTED_HEADERS.length } yerine ${ raw.columnCount } sütun bulundu.`);
    }
    if (!raw.eaId || raw.eaId === '-') {
      statErrors.push("EA ID boş veya '-' olamaz.");
    }
    if (!raw.playedTeam || raw.playedTeam === '-') {
      statErrors.push("Oynadığı Takım boş veya '-' olamaz.");
    }

    const pMatches = parseStrictNonNegativeInt(raw.rawMatches, 'Maç');
    if (pMatches.error) statErrors.push(pMatches.error);

    const pGoals = parseStrictNonNegativeInt(raw.rawGoals, 'Gol');
    if (pGoals.error) statErrors.push(pGoals.error);

    const pAssists = parseStrictNonNegativeInt(raw.rawAssists, 'Asist');
    if (pAssists.error) statErrors.push(pAssists.error);

    const pRating = parseStrictRatingAvg(raw.rawRating);
    if (pRating.error) statErrors.push(pRating.error);

    const eaRes = eaResolutionMap.get(raw.eaId) || {
      status: 'UNMATCHED' as PlayerMatchStatus,
      profile: null,
      candidates: [],
      ambiguityReason: null
    };

    const teamRes = teamResolutionMap.get(raw.playedTeam) || {
      status: 'UNRECOGNIZED' as TeamMatchStatus,
      teamId: null,
      teamName: raw.playedTeam,
      candidates: []
    };

    const resolvedLeagueName =
      (teamRes.teamId && leagueNameByTeamId.get(teamRes.teamId)) || defaultLeagueName;

    // Duplicate check within CSV (by raw EA ID + season + playedTeam)
    const rawComboKey = `${normalizeEaIdCase(raw.eaId)}||${foldCase(raw.season)}||${foldCase(raw.playedTeam)}`;
    let duplicateOfLine: number | null = null;
    if (raw.eaId && raw.playedTeam) {
      if (seenCsvComboLine.has(rawComboKey)) {
        duplicateOfLine = seenCsvComboLine.get(rawComboKey)!;
      } else {
        seenCsvComboLine.set(rawComboKey, raw.lineNumber);
      }
    }

    // Also check duplicate by resolved (player_id + season + team) in case two different EA IDs were manually linked to the same profile and same team
    if (duplicateOfLine === null && eaRes.profile && (teamRes.teamId || teamRes.status === 'MANUAL_CUSTOM')) {
      const resolvedTeamKey = teamRes.teamId ? `id:${teamRes.teamId}` : `name:${foldCase(teamRes.teamName)}`;
      const resolvedComboKey = `${eaRes.profile.id}||${foldCase(targetSeasonName)}||${resolvedTeamKey}`;
      if (seenResolvedComboLine.has(resolvedComboKey)) {
        duplicateOfLine = seenResolvedComboLine.get(resolvedComboKey)!;
      } else {
        seenResolvedComboLine.set(resolvedComboKey, raw.lineNumber);
      }
    }

    // Check existing DB collision if player and team are resolved
    let existingDbRecordId: string | null = null;
    if (eaRes.profile && (teamRes.teamId || teamRes.status === 'MANUAL_CUSTOM')) {
      const matchExisting = options.existingLegacyStats.find(ex => {
        if (ex.player_id !== eaRes.profile!.id) return false;
        if (!isEquivalentSeasonName(ex.season_name, targetSeasonName)) return false;
        if (teamRes.teamId && ex.team_id) {
          return ex.team_id === teamRes.teamId;
        }
        return foldCase(ex.team_name) === foldCase(teamRes.teamName);
      });
      if (matchExisting) {
        existingDbRecordId = matchExisting.id;
      }
    }

    // Determine primary status & reasons
    let status: CsvRowImportStatus = 'READY';
    const reasons: string[] = [];

    if (statErrors.length > 0) {
      status = 'INVALID_STATS';
      reasons.push(...statErrors);
    } else if (duplicateOfLine !== null) {
      status = 'DUPLICATE_IN_CSV';
      reasons.push(`CSV içinde mükerrer kayıt (Satır ${duplicateOfLine} ile aynı oyuncu + sezon + takım kombinasyonu).`);
    } else if (!eaRes.profile) {
      status = 'NEEDS_PLAYER_MATCH';
      if (eaRes.status === 'AMBIGUOUS' && eaRes.ambiguityReason) {
        reasons.push(eaRes.ambiguityReason);
      } else {
        reasons.push(`EA ID "${raw.eaId}" sistemdeki hiçbir oyuncu profiliyle eşleşmedi.`);
      }
    } else if (teamRes.status === 'UNRECOGNIZED') {
      status = 'NEEDS_TEAM_MATCH';
      reasons.push(`Oynadığı Takım "${raw.playedTeam}" sistemdeki takımlarla tam eşleşmedi.`);
    } else if (existingDbRecordId !== null) {
      status = 'EXISTING_IN_DB';
      reasons.push(`@${eaRes.profile.username} için "${targetSeasonName}" sezonunda "${teamRes.teamName}" takım kaydı veritabanında zaten mevcut.`);
    } else {
      status = 'READY';
      reasons.push('İçe aktarmaya hazır.');
    }

    evaluatedRows.push({
      lineNumber: raw.lineNumber,
      eaId: raw.eaId,
      currentTeam: raw.currentTeam,
      csvSeason: raw.season,
      playedTeam: raw.playedTeam,
      matchesPlayed: pMatches.value,
      goals: pGoals.value,
      assists: pAssists.value,
      ratingAvg: pRating.value,
      status,
      statusReasons: reasons,
      playerMatchStatus: eaRes.status,
      resolvedPlayerId: eaRes.profile?.id || null,
      resolvedPlayerUsername: eaRes.profile?.username || null,
      candidateProfiles: eaRes.candidates,
      teamMatchStatus: teamRes.status,
      resolvedTeamId: teamRes.teamId,
      resolvedTeamName: teamRes.teamName,
      resolvedLeagueName,
      targetSeasonName,
      existingDbRecordId,
      duplicateOfLineNumber: duplicateOfLine
    });
  }

  // 8. Compute summary counts & groups
  const inScopeRows = evaluatedRows.filter(r => r.status !== 'EXCLUDED_SEASON');
  const excludedRows = evaluatedRows.filter(r => r.status === 'EXCLUDED_SEASON');

  let matchedPlayersCount = 0;
  let ambiguousPlayersCount = 0;
  let unmatchedPlayersCount = 0;
  let manuallyLinkedPlayersCount = 0;
  const unmatchedOrAmbiguousPlayerGroups: UnmatchedPlayerGroup[] = [];

  for (const [eaId, res] of eaResolutionMap.entries()) {
    const teamsSet = inScopeTeamsByEaId.get(eaId) || new Set<string>();
    const rowCount = inScopeRows.filter(r => r.eaId === eaId).length;
    if (res.status === 'EXACT') {
      matchedPlayersCount++;
    } else if (res.status === 'MANUAL_LINKED') {
      matchedPlayersCount++;
      manuallyLinkedPlayersCount++;
      unmatchedOrAmbiguousPlayerGroups.push({
        eaId,
        matchStatus: 'MANUAL_LINKED',
        rowCount,
        playedTeams: Array.from(teamsSet),
        candidateProfiles: res.candidates,
        resolvedPlayerId: res.profile?.id || null,
        resolvedPlayerUsername: res.profile?.username || null,
        ambiguityReason: res.ambiguityReason
      });
    } else if (res.status === 'AMBIGUOUS') {
      ambiguousPlayersCount++;
      unmatchedOrAmbiguousPlayerGroups.push({
        eaId,
        matchStatus: 'AMBIGUOUS',
        rowCount,
        playedTeams: Array.from(teamsSet),
        candidateProfiles: res.candidates,
        resolvedPlayerId: null,
        resolvedPlayerUsername: null,
        ambiguityReason: res.ambiguityReason
      });
    } else {
      unmatchedPlayersCount++;
      unmatchedOrAmbiguousPlayerGroups.push({
        eaId,
        matchStatus: 'UNMATCHED',
        rowCount,
        playedTeams: Array.from(teamsSet),
        candidateProfiles: [],
        resolvedPlayerId: null,
        resolvedPlayerUsername: null,
        ambiguityReason: null
      });
    }
  }

  const unrecognizedTeamGroups: UnrecognizedTeamGroup[] = [];
  let unrecognizedTeamsCount = 0;
  for (const [playedTeam, tRes] of teamResolutionMap.entries()) {
    if (tRes.status !== 'EXACT') {
      if (tRes.status === 'UNRECOGNIZED') {
        unrecognizedTeamsCount++;
      }
      const rowCount = inScopeRows.filter(r => r.playedTeam === playedTeam).length;
      unrecognizedTeamGroups.push({
        playedTeam,
        matchStatus: tRes.status,
        rowCount,
        candidateTeams: tRes.candidates,
        resolvedTeamId: tRes.teamId,
        resolvedTeamName: tRes.teamName
      });
    }
  }

  let multiTeamPlayersCount = 0;
  for (const [, tSet] of inScopeTeamsByEaId.entries()) {
    if (tSet.size > 1) multiTeamPlayersCount++;
  }

  const invalidStatRowsCount = inScopeRows.filter(r => r.status === 'INVALID_STATS').length;
  const duplicateCsvRowsCount = inScopeRows.filter(r => r.status === 'DUPLICATE_IN_CSV').length;
  const existingDbCollisionsCount = inScopeRows.filter(r => r.status === 'EXISTING_IN_DB').length;
  const readyRows = inScopeRows.filter(r => r.status === 'READY');

  const readyPayloads: ReadyLegacyStatInsertPayload[] = readyRows.map(r => ({
    lineNumber: r.lineNumber,
    eaId: r.eaId,
    player_id: r.resolvedPlayerId!,
    player_username: r.resolvedPlayerUsername!,
    season_name: r.targetSeasonName,
    league_name: r.resolvedLeagueName,
    team_id: r.resolvedTeamId,
    team_name: r.resolvedTeamName!,
    matches_played: r.matchesPlayed!,
    goals: r.goals!,
    assists: r.assists!,
    rating_avg: r.ratingAvg!
  }));

  return {
    headerValid: true,
    headerError: null,
    detectedDelimiter: parsed.detectedDelimiter,
    headers: parsed.headers,
    totalCsvRows: parsed.rawRows.length,
    includedSeasonRows: inScopeRows.length,
    excludedSeasonRows: excludedRows.length,
    excludedReasonsBreakdown,
    uniqueEaIdsAll: allEaIdsSet.size,
    uniqueEaIdsInScope: inScopeEaIdsSet.size,
    matchedPlayersCount,
    ambiguousPlayersCount,
    unmatchedPlayersCount,
    manuallyLinkedPlayersCount,
    multiTeamPlayersCount,
    teamBasedRecordCount: inScopeRows.length,
    unrecognizedTeamsCount,
    invalidStatRowsCount,
    duplicateCsvRowsCount,
    existingDbCollisionsCount,
    readyToImportCount: readyPayloads.length,
    skippedOrBlockedCount: evaluatedRows.length - readyPayloads.length,
    unmatchedOrAmbiguousPlayerGroups,
    unrecognizedTeamGroups,
    rows: evaluatedRows,
    readyPayloads
  };
}

// ════════════════════════════════════════════════════════════════════════════
// STRICT ALL-OR-NOTHING SERVER-SIDE BATCH VALIDATOR
// ════════════════════════════════════════════════════════════════════════════

export interface ServerCsvImportRecordInput {
  lineNumber: number;
  eaId: string;
  player_id: string;
  team_id: string | null;
  team_name: string;
  league_name: string;
  matches_played: number;
  goals: number;
  assists: number;
  rating_avg: number;
}

export interface ServerCsvImportRowIssue {
  lineNumber: number;
  eaId: string;
  teamName: string;
  reason: string;
}

export interface ServerLegacyStatDbInsertRow {
  player_id: string;
  season_name: string;
  league_name: string;
  team_id: string | null;
  team_name: string;
  matches_played: number;
  wins: null;
  draws: null;
  losses: null;
  goals: number;
  assists: number;
  rating_avg: number;
  clean_sheets: number;
  red_cards: number;
  market_value: number;
  notes: null;
  created_by: string;
}

export interface ValidateServerBatchOptions {
  records: ServerCsvImportRecordInput[];
  seasonName: string;
  defaultLeagueName: string;
  validProfiles: Array<{ id: string; username: string }>;
  validTeams: Array<{ id: string; name: string }>;
  existingStats: Array<{
    id: string;
    player_id: string;
    season_name: string;
    team_id: string | null;
    team_name: string;
  }>;
  actorUserId: string;
}

export interface ValidateServerBatchResult {
  abortedDueToValidationError: boolean;
  insertPayloads: ServerLegacyStatDbInsertRow[];
  rowErrors: ServerCsvImportRowIssue[];
  skippedRows: ServerCsvImportRowIssue[];
}

const SERVER_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Re-validates a submitted CSV import batch on the server with strict all-or-nothing semantics:
 * - If even a single row fails validation, `abortedDueToValidationError = true` and `insertPayloads = []`.
 * - Pre-existing DB records are never overwritten; they are collected in `skippedRows`.
 */
export function validateAndPrepareCsvImportBatch(
  options: ValidateServerBatchOptions
): ValidateServerBatchResult {
  const {
    records,
    seasonName,
    defaultLeagueName,
    validProfiles,
    validTeams,
    existingStats,
    actorUserId
  } = options;

  const validProfileMap = new Map<string, { id: string; username: string }>(
    validProfiles.map(p => [p.id, p])
  );
  const validTeamMap = new Map<string, { id: string; name: string }>(
    validTeams.map(t => [t.id, t])
  );

  // Prevent linking multiple distinct EA IDs to the same player_id within the batch
  const eaIdsByPlayerId = new Map<string, Set<string>>();
  for (const rec of records) {
    if (rec.player_id && rec.eaId) {
      if (!eaIdsByPlayerId.has(rec.player_id)) {
        eaIdsByPlayerId.set(rec.player_id, new Set());
      }
      eaIdsByPlayerId.get(rec.player_id)!.add(normalizeEaIdCase(rec.eaId));
    }
  }

  const rowErrors: ServerCsvImportRowIssue[] = [];
  const skippedRows: ServerCsvImportRowIssue[] = [];
  const seenBatchCombo = new Set<string>();
  const candidatePayloads: ServerLegacyStatDbInsertRow[] = [];

  for (const rec of records) {
    const lineNum = Number(rec.lineNumber) || 0;
    const eaId = String(rec.eaId || '').trim();
    const rawTeamName = String(rec.team_name || '').trim();

    if (!eaId || eaId === '-') {
      rowErrors.push({
        lineNumber: lineNum,
        eaId,
        teamName: rawTeamName,
        reason: "EA ID boş veya '-' olamaz."
      });
      continue;
    }

    if (!rec.player_id || !SERVER_UUID_REGEX.test(rec.player_id) || !validProfileMap.has(rec.player_id)) {
      rowErrors.push({
        lineNumber: lineNum,
        eaId,
        teamName: rawTeamName,
        reason: 'Geçerli bir oyuncu profili bulunamadı.'
      });
      continue;
    }

    const distinctEaForPlayer = eaIdsByPlayerId.get(rec.player_id);
    if (distinctEaForPlayer && distinctEaForPlayer.size > 1) {
      rowErrors.push({
        lineNumber: lineNum,
        eaId,
        teamName: rawTeamName,
        reason: 'Aynı oyuncu profiline birden fazla farklı EA ID bağlanamaz.'
      });
      continue;
    }

    // Resolve team strictly
    let resolvedTeamId: string | null = null;
    let resolvedTeamName = '';

    if (rec.team_id) {
      if (!SERVER_UUID_REGEX.test(rec.team_id) || !validTeamMap.has(rec.team_id)) {
        rowErrors.push({
          lineNumber: lineNum,
          eaId,
          teamName: rawTeamName,
          reason: 'Seçilen takım veritabanında bulunamadı.'
        });
        continue;
      }
      const tObj = validTeamMap.get(rec.team_id)!;
      resolvedTeamId = tObj.id;
      resolvedTeamName = tObj.name; // Forced from DB
    } else {
      if (!rawTeamName || rawTeamName === '-' || rawTeamName.length > 80) {
        rowErrors.push({
          lineNumber: lineNum,
          eaId,
          teamName: rawTeamName,
          reason: 'Geçersiz özel/tarihsel takım adı.'
        });
        continue;
      }
      resolvedTeamId = null;
      resolvedTeamName = rawTeamName;
    }

    const leagueName = String(rec.league_name || defaultLeagueName).trim() || defaultLeagueName;
    if (leagueName.length > 100) {
      rowErrors.push({
        lineNumber: lineNum,
        eaId,
        teamName: resolvedTeamName,
        reason: 'Lig adı 100 karakterden uzun olamaz.'
      });
      continue;
    }

    // Validate numeric stats
    const m = Number(rec.matches_played);
    const g = Number(rec.goals);
    const a = Number(rec.assists);
    const rat = Number(rec.rating_avg);

    if (
      !Number.isInteger(m) || m < 0 ||
      !Number.isInteger(g) || g < 0 ||
      !Number.isInteger(a) || a < 0 ||
      Number.isNaN(rat) || !Number.isFinite(rat) || rat < 0 || rat > 10
    ) {
      rowErrors.push({
        lineNumber: lineNum,
        eaId,
        teamName: resolvedTeamName,
        reason: 'Maç, Gol, Asist veya Ort. Rating değeri geçersiz aralıkta.'
      });
      continue;
    }

    const ratingAvg = Math.round(rat * 100) / 100;

    // Check duplicate within the submitted batch
    const batchTeamKey = resolvedTeamId ? `id:${resolvedTeamId}` : `name:${foldCase(resolvedTeamName)}`;
    const batchComboKey = `${rec.player_id}||${foldCase(seasonName)}||${batchTeamKey}`;
    if (seenBatchCombo.has(batchComboKey)) {
      rowErrors.push({
        lineNumber: lineNum,
        eaId,
        teamName: resolvedTeamName,
        reason: 'Aynı oyuncu + sezon + takım kombinasyonu bu içe aktarma paketinde birden fazla kez yer alıyor.'
      });
      continue;
    }
    seenBatchCombo.add(batchComboKey);

    // Check existing DB record collision (do NOT overwrite existing records)
    const existingCollision = existingStats.find(ex => {
      if (ex.player_id !== rec.player_id) return false;
      if (!isEquivalentSeasonName(ex.season_name, seasonName)) return false;
      if (resolvedTeamId && ex.team_id) {
        return ex.team_id === resolvedTeamId;
      }
      return foldCase(ex.team_name || '') === foldCase(resolvedTeamName);
    });

    if (existingCollision) {
      const uname = validProfileMap.get(rec.player_id)?.username || eaId;
      skippedRows.push({
        lineNumber: lineNum,
        eaId,
        teamName: resolvedTeamName,
        reason: `@${uname} için "${seasonName}" sezonunda "${resolvedTeamName}" takım kaydı veritabanında zaten mevcut (üzerine yazılmadı).`
      });
      continue;
    }

    candidatePayloads.push({
      player_id: rec.player_id,
      season_name: seasonName,
      league_name: leagueName,
      team_id: resolvedTeamId,
      team_name: resolvedTeamName,
      matches_played: m,
      wins: null,
      draws: null,
      losses: null,
      goals: g,
      assists: a,
      rating_avg: ratingAvg,
      clean_sheets: 0,
      red_cards: 0,
      market_value: 0,
      notes: null,
      created_by: actorUserId
    });
  }

  // STRICT ALL-OR-NOTHING: If ANY row failed validation, abort the entire batch (0 records prepared)
  if (rowErrors.length > 0) {
    return {
      abortedDueToValidationError: true,
      insertPayloads: [],
      rowErrors,
      skippedRows
    };
  }

  return {
    abortedDueToValidationError: false,
    insertPayloads: candidatePayloads,
    rowErrors: [],
    skippedRows
  };
}
