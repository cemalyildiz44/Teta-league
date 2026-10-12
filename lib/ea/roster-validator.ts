export interface ProfileCandidate {
  id: string;
  username: string;
  full_name?: string | null;
  current_ea_player_id?: string | null;
}

export interface TeamMembershipCandidate {
  id?: string;
  player_id: string;
  team_id: string;
  season_id: string;
  left_at?: string | null;
  teams?: {
    id: string;
    name: string;
  } | null;
}

export type PlayerMatchStatus = 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS';
export type RosterValidationStatus = 'VALID' | 'ROSTER_MISMATCH' | 'UNLICENSED' | 'UNMATCHED' | 'AMBIGUOUS';

export interface PlayerMatchResult {
  player_id: string | null;
  status: PlayerMatchStatus;
  warning?: string | null;
  matched_profile?: ProfileCandidate | null;
}

export interface RosterValidationResult {
  roster_status: RosterValidationStatus;
  registered_team_id: string | null;
  registered_team_name: string | null;
  roster_warning: string | null;
}

/**
 * Normalizes an EA player identifier (gamertag or ID) by trimming and lowercasing.
 */
export function normalizeEaId(val: string | null | undefined): string {
  if (!val) return '';
  return val.trim().toLowerCase();
}

/**
 * Matches a single player against a pool of profile candidates using case-insensitive normalization.
 * Detects ambiguous collisions and never guesses unknown players.
 */
export function matchPlayerToProfile(
  player: { ea_player_id?: string | null; ea_player_name?: string | null },
  profiles: ProfileCandidate[]
): PlayerMatchResult {
  const normId = normalizeEaId(player.ea_player_id);
  const normName = normalizeEaId(player.ea_player_name);

  if (!normId && !normName) {
    return {
      player_id: null,
      status: 'UNMATCHED',
      warning: 'PROFİL EŞLEŞMEDİ: Oyuncu EA kimliği veya adı bulunamadı'
    };
  }

  // Index profiles by normalized EA identifier
  const idToProfiles = new Map<string, ProfileCandidate[]>();
  for (const p of profiles) {
    if (!p.current_ea_player_id) continue;
    const key = normalizeEaId(p.current_ea_player_id);
    if (!key) continue;
    const existing = idToProfiles.get(key) || [];
    existing.push(p);
    idToProfiles.set(key, existing);
  }

  const matchesFromId = normId ? idToProfiles.get(normId) || [] : [];
  const matchesFromName = normName ? idToProfiles.get(normName) || [] : [];

  // Check collision / ambiguity for matches from ea_player_id
  if (matchesFromId.length > 1) {
    return {
      player_id: null,
      status: 'AMBIGUOUS',
      warning: `Belirsiz eşleşme: EA ID ("${player.ea_player_id}") birden fazla profille eşleşti (${matchesFromId.map(m => m.username).join(', ')})`
    };
  }

  // Check collision / ambiguity for matches from ea_player_name
  if (matchesFromName.length > 1) {
    return {
      player_id: null,
      status: 'AMBIGUOUS',
      warning: `Belirsiz eşleşme: EA Oyuncu Adı ("${player.ea_player_name}") birden fazla profille eşleşti (${matchesFromName.map(m => m.username).join(', ')})`
    };
  }

  const candidateId = matchesFromId[0] || null;
  const candidateName = matchesFromName[0] || null;

  // If both are found but point to DIFFERENT profiles, flag ambiguity
  if (candidateId && candidateName && candidateId.id !== candidateName.id) {
    return {
      player_id: null,
      status: 'AMBIGUOUS',
      warning: `Çakışan eşleşme: EA ID "${player.ea_player_id}" (${candidateId.username}) ve Oyuncu Adı "${player.ea_player_name}" (${candidateName.username}) farklı profillere ait.`
    };
  }

  const matched = candidateId || candidateName;

  if (matched) {
    return {
      player_id: matched.id,
      status: 'MATCHED',
      matched_profile: matched,
      warning: null
    };
  }

  return {
    player_id: null,
    status: 'UNMATCHED',
    warning: 'PROFİL EŞLEŞMEDİ'
  };
}

/**
 * Validates whether a matched player is actively licensed for the match team in the current season.
 */
export function validateRosterMembership({
  player_id,
  match_team_id,
  season_id,
  memberships
}: {
  player_id: string | null;
  match_team_id: string;
  season_id: string;
  memberships: TeamMembershipCandidate[];
}): RosterValidationResult {
  if (!player_id) {
    return {
      roster_status: 'UNMATCHED',
      registered_team_id: null,
      registered_team_name: null,
      roster_warning: 'PROFİL EŞLEŞMEDİ'
    };
  }

  const activeMembership = memberships.find(
    m => m.player_id === player_id && m.season_id === season_id && (!m.left_at || m.left_at === null)
  );

  if (!activeMembership) {
    return {
      roster_status: 'UNLICENSED',
      registered_team_id: null,
      registered_team_name: null,
      roster_warning: 'Lisanssız oyuncu: Bu sezonda aktif kulüp kaydı bulunmuyor'
    };
  }

  const registeredName = activeMembership.teams?.name || 'Başka Takım';

  if (activeMembership.team_id !== match_team_id) {
    return {
      roster_status: 'ROSTER_MISMATCH',
      registered_team_id: activeMembership.team_id,
      registered_team_name: registeredName,
      roster_warning: `Kadro uyuşmazlığı: Oyuncu "${registeredName}" kadrosunda lisanslı`
    };
  }

  return {
    roster_status: 'VALID',
    registered_team_id: match_team_id,
    registered_team_name: registeredName,
    roster_warning: null
  };
}

/**
 * Sanitizes user search query to prevent PostgREST .or() filter injection, syntax errors, and broad wildcard enumeration.
 */
export function sanitizeProfileSearchQuery(query: unknown): string {
  if (!query || typeof query !== 'string') return '';
  return query
    .replace(/,/g, ' ')
    .replace(/[()"\\]/g, '')
    .replace(/[%*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a safe PostgREST .or() filter string for player profile lookup across username, full_name, and current_ea_player_id.
 * Returns null if the sanitized query is shorter than 2 characters (preventing unnecessary DB queries).
 */
export function buildProfilesOrFilter(query: unknown): string | null {
  const clean = sanitizeProfileSearchQuery(query);
  if (clean.length < 2) return null;
  return `username.ilike.%${clean}%,full_name.ilike.%${clean}%,current_ea_player_id.ilike.%${clean}%`;
}
