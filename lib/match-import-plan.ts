import { canonicalJson, normIso, sha256, toMs } from './fixture-weekly.ts';
import { getMatchNightWindow } from './ea/matcher.ts';
import { matchPlayerToProfile, validateRosterMembership } from './ea/roster-validator.ts';
import type { ProfileCandidate, TeamMembershipCandidate } from './ea/roster-validator.ts';
import type { ResultsDoc, ResultsMatch } from './match-results-weekly.ts';

/**
 * Pure, read-only planner for `teta.weekly-matches` v1: compares ONE validated results file with live TETA state.
 * Nothing here touches the database. Rules:
 *  - teams / EA club ids / fixture state / window are taken from LIVE data; the file is never trusted for them
 *  - matches are only ever created as source AUTO + status PENDING_REVIEW (the existing admin review flow approves them)
 *  - the file's `eaPlayerId` is a raw EA key, NOT a verified profile id: player_id stays null unless the admin
 *    explicitly accepts a suggested link, and a suggestion is only made when it is unambiguous
 */

export interface LiveFixtureLite {
  id: string;
  season_id: string;
  league_id: string;
  week_number: number;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  status: string;
  updated_at: string;
}
export interface MatchHistoryRow {
  result: string;
  checksum: string;
  file_generated_at: string | null;
  season_id: string;
  league_id: string;
  week_number: number;
}
export interface MatchLiveContext {
  season: { id: string } | null;
  league: { id: string; season_id: string } | null;
  fixtures: LiveFixtureLite[];
  teams: { id: string; name: string; ea_club_id: number | string | null }[];
  matchesByFixture: Record<string, { id: string; status: string }[]>;
  /** matches that already carry one of the file's ea_match_id values */
  usedEaMatchIds: Record<string, { id: string; fixture_id: string | null }>;
  history: MatchHistoryRow[];
  /** fixture_import_history rows of the league (informational: was the source fixtures file applied here?) */
  fixtureImports: { result: string; checksum: string; week_number: number }[];
  profiles: ProfileCandidate[];
  memberships: TeamMembershipCandidate[];
}

export interface PlanIssue {
  code: string;
  message: string;
}
export interface LinkDecision {
  eaMatchId: string;
  eaPlayerId: string;
  profileId: string;
}
export interface PlayerPlan {
  eaPlayerId: string;
  eaPlayerName: string | null;
  side: 'home' | 'away';
  teamId: string;
  /** Suggestion only. Never applied unless the admin accepts it. */
  suggestion: { status: 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS'; profileId: string | null; username: string | null; warning: string | null };
  /** profile that WILL be linked (admin accepted the suggestion), else null */
  linkedProfileId: string | null;
  rosterStatus: string;
  /** values exactly as in the file (shown in the preview so the admin sees what will be written) */
  stats: { position: string | null; goals: number; assists: number; rating: number | null; shots: number; passesMade: number; passAttempts: number; tacklesMade: number; tackleAttempts: number; saves: number; mom: boolean };
}
export interface MatchPlan {
  fixtureId: string;
  eaMatchId: string;
  homeName: string;
  awayName: string;
  scheduledAt: string | null;
  playedAt: string;
  homeScore: number;
  awayScore: number;
  /** blocking: the file cannot be applied while any exists */
  errors: PlanIssue[];
  warnings: PlanIssue[];
  outOfWindow: boolean;
  outOfWindowAccepted: boolean;
  players: PlayerPlan[];
}
export type PlanStatus = 'REJECTED' | 'BLOCKED' | 'NOOP' | 'NEEDS_DECISION' | 'READY';
export interface MatchFilePlan {
  fileName: string;
  exportId: string | null;
  checksum: string | null;
  generatedAt: string | null;
  scope: ResultsDoc['target'] | null;
  status: PlanStatus;
  rejections: string[];
  warnings: string[];
  matches: MatchPlan[];
  /** payload for apply_weekly_match_imports (READY only) */
  rpc: Record<string, unknown> | null;
  planHash: string | null;
}

export function emptyRejected(fileName: string, rejections: string[], doc?: Partial<ResultsDoc>): MatchFilePlan {
  return {
    fileName,
    exportId: doc?.exportId ?? null,
    checksum: doc?.checksum ?? null,
    generatedAt: doc?.generatedAt ?? null,
    scope: doc?.target ?? null,
    status: 'REJECTED',
    rejections,
    warnings: [],
    matches: [],
    rpc: null,
    planHash: null,
  };
}

const COLUMN_STATS = {
  goals: 'goals',
  assists: 'assists',
  shots: 'shots',
  passes_made: 'passesMade',
  pass_attempts: 'passAttempts',
  tackles_made: 'tacklesMade',
  tackle_attempts: 'tackleAttempts',
  saves: 'saves',
  goals_conceded: 'goalsConceded',
  cleansheets_gk: 'cleanSheetsGk',
  cleansheets_def: 'cleanSheetsDef',
  red_cards: 'redCards',
} as const;

export function planMatchImport(args: {
  fileName: string;
  doc: ResultsDoc;
  selected: { seasonId: string; leagueId: string };
  live: MatchLiveContext;
  acceptedOutOfWindow?: string[];
  acceptedLinks?: LinkDecision[];
}): MatchFilePlan {
  const { doc, selected, live, fileName } = args;
  const oowOk = new Set(args.acceptedOutOfWindow ?? []);
  const rejections: string[] = [];

  if (doc.target.seasonId !== selected.seasonId) rejections.push('Dosyadaki sezon, seçilen sezonla uyuşmuyor.');
  if (doc.target.leagueId !== selected.leagueId) rejections.push('Dosyadaki lig, seçilen ligle uyuşmuyor.');
  if (!live.season || live.season.id !== selected.seasonId) rejections.push('Seçilen sezon bulunamadı.');
  if (!live.league) rejections.push('Seçilen lig bulunamadı.');
  else if (live.league.season_id !== selected.seasonId) rejections.push('Seçilen lig, seçilen sezona ait değil.');
  if (rejections.length) return emptyRejected(fileName, rejections, doc);

  // ---- file-level history: same content / older export ----
  const applied = live.history.filter(
    (h) => h.result === 'APPLIED' && h.league_id === doc.target.leagueId && h.season_id === doc.target.seasonId && h.week_number === doc.target.weekNumber
  );
  if (applied.some((h) => h.checksum === doc.checksum)) {
    return { ...emptyRejected(fileName, [], doc), status: 'NOOP', warnings: ['Bu dosya (aynı içerik) daha önce uygulanmış; yeniden uygulanmayacak.'] };
  }
  const gen = toMs(doc.generatedAt);
  for (const h of applied) {
    if (h.file_generated_at && gen < toMs(h.file_generated_at)) {
      return emptyRejected(fileName, [`Dosya daha eski bir dışa aktarma (${doc.generatedAt}); bu hafta için daha yeni bir dosya (${h.file_generated_at}) zaten uygulanmış.`], doc);
    }
  }

  const warnings: string[] = [];
  if (!live.fixtureImports.some((x) => x.result === 'APPLIED' && x.week_number === doc.target.weekNumber && x.checksum === doc.source.fixturesChecksum)) {
    warnings.push('Dosyanın dayandığı fikstür dosyası bu sistemde uygulanmış olarak kayıtlı değil; fikstür değişikliklerini dikkatle kontrol edin.');
  }

  const fixtureById = new Map(live.fixtures.map((f) => [f.id, f]));
  const teamById = new Map(live.teams.map((t) => [t.id, t]));
  const links = new Map((args.acceptedLinks ?? []).map((l) => [`${l.eaMatchId}:${l.eaPlayerId}`, l.profileId]));
  const memberships = live.memberships;

  const matches: MatchPlan[] = doc.matches.map((m: ResultsMatch): MatchPlan => {
    const errors: PlanIssue[] = [];
    const mw: PlanIssue[] = [];
    const bad = (code: string, message: string) => errors.push({ code, message });
    const f = fixtureById.get(m.fixtureId);
    const homeLive = teamById.get(m.home.teamId);
    const awayLive = teamById.get(m.away.teamId);
    let outOfWindow = false;

    if (!f) bad('FIXTURE_NOT_FOUND', 'Fikstür bu ligde bulunamadı.');
    else {
      if (f.season_id !== doc.target.seasonId || f.league_id !== doc.target.leagueId || f.week_number !== doc.target.weekNumber) {
        bad('FIXTURE_OUT_OF_SCOPE', `Fikstür dosyanın sezon/lig/haftasına ait değil (canlıda hafta ${f.week_number}).`);
      }
      if (f.status !== 'SCHEDULED') bad('FIXTURE_NOT_SCHEDULED', `Fikstür durumu ${f.status}; yalnızca SCHEDULED fikstüre maç eklenebilir.`);
      if (toMs(f.updated_at) !== toMs(m.fixtureUpdatedAt)) bad('FIXTURE_CHANGED', 'Fikstür dosya üretildikten sonra canlıda değişmiş; fikstür dosyasını ve sonuçları yeniden üretin.');
      if ((live.matchesByFixture[f.id]?.length ?? 0) > 0) bad('FIXTURE_HAS_MATCH', 'Bu fikstüre bağlı bir maç zaten var; ikinci maç eklenemez.');
      if (f.home_team_id !== m.home.teamId || f.away_team_id !== m.away.teamId) bad('TEAM_MISMATCH', 'Dosyadaki ev/deplasman takımları canlı fikstürle uyuşmuyor.');
      const eaOf = (id: string) => {
        const t = teamById.get(id);
        const n = t?.ea_club_id === null || t?.ea_club_id === undefined ? NaN : Number(t.ea_club_id);
        return Number.isSafeInteger(n) ? n : null;
      };
      if (eaOf(f.home_team_id) !== m.home.eaClubId || eaOf(f.away_team_id) !== m.away.eaClubId) {
        bad('EA_CLUB_MISMATCH', 'Dosyadaki EA kulüp kimlikleri canlı takım kayıtlarıyla uyuşmuyor.');
      }
      const w = getMatchNightWindow(f.scheduled_at);
      const t = toMs(m.playedAt);
      outOfWindow = !(t >= w.start && t < w.end);
    }
    if (usedBy(live, m.eaMatchId)) bad('EA_MATCH_ALREADY_USED', 'Bu EA maçı sistemde zaten kayıtlı.');
    if (outOfWindow) {
      if (oowOk.has(m.eaMatchId)) mw.push({ code: 'OUT_OF_WINDOW_ACCEPTED', message: 'Maç fikstürün EA zaman aralığı dışında; yönetici onayıyla alınacak.' });
      else mw.push({ code: 'OUT_OF_WINDOW', message: 'Maç fikstürün EA zaman aralığı (UTC 17:00–23:00) dışında; açık yönetici kararı gerekir.' });
    }
    if (m.home.score === 0 && m.away.score === 0) mw.push({ code: 'ZERO_ZERO', message: '0-0 sonuç (şüpheli).' });
    if (m.players.length === 0) mw.push({ code: 'NO_PLAYERS', message: 'Oyuncu verisi yok.' });
    else {
      const sum = (side: 'home' | 'away') => m.players.filter((p) => p.side === side).reduce((s, p) => s + p.goals, 0);
      if (sum('home') !== m.home.score || sum('away') !== m.away.score) mw.push({ code: 'GOALS_MISMATCH', message: 'Oyuncu golleri skorla uyuşmuyor.' });
    }

    // ---- player identity: suggestions only ----
    const suggestions = m.players.map((p) => matchPlayerToProfile({ ea_player_id: p.eaPlayerId, ea_player_name: p.eaPlayerName }, live.profiles));
    const usage = new Map<string, number>();
    for (const s of suggestions) if (s.player_id) usage.set(s.player_id, (usage.get(s.player_id) ?? 0) + 1);
    const players: PlayerPlan[] = m.players.map((p, i) => {
      const s = suggestions[i];
      let status = s.status;
      let warning = s.warning ?? null;
      let profileId = s.player_id;
      if (profileId && (usage.get(profileId) ?? 0) > 1) {
        status = 'AMBIGUOUS';
        warning = 'Belirsiz/çakışan eşleşme: Bu profil aynı maçta birden fazla EA oyuncusuyla eşleşti';
        profileId = null;
      }
      const teamId = p.side === 'home' ? m.home.teamId : m.away.teamId;
      const accepted = links.get(`${m.eaMatchId}:${p.eaPlayerId}`) ?? null;
      let linked: string | null = null;
      if (accepted) {
        if (status === 'MATCHED' && profileId === accepted) linked = accepted;
        else bad('LINK_NOT_VALID', `${p.eaPlayerName ?? p.eaPlayerId}: kabul edilen profil bağlantısı artık geçerli bir öneri değil.`);
      }
      const roster = validateRosterMembership({ player_id: linked, match_team_id: teamId, season_id: doc.target.seasonId, memberships });
      return {
        eaPlayerId: p.eaPlayerId,
        eaPlayerName: p.eaPlayerName,
        side: p.side,
        teamId,
        suggestion: { status, profileId, username: s.matched_profile?.username ?? null, warning },
        linkedProfileId: linked,
        rosterStatus: roster.roster_status,
        stats: { position: p.position, goals: p.goals, assists: p.assists, rating: p.rating, shots: p.shots, passesMade: p.passesMade, passAttempts: p.passAttempts, tacklesMade: p.tacklesMade, tackleAttempts: p.tackleAttempts, saves: p.saves, mom: p.mom },
      };
    });

    return {
      fixtureId: m.fixtureId,
      eaMatchId: m.eaMatchId,
      homeName: homeLive?.name ?? '?',
      awayName: awayLive?.name ?? '?',
      scheduledAt: f ? normIso(f.scheduled_at) : null,
      playedAt: normIso(m.playedAt),
      homeScore: m.home.score,
      awayScore: m.away.score,
      errors,
      warnings: mw,
      outOfWindow,
      outOfWindowAccepted: outOfWindow && oowOk.has(m.eaMatchId),
      players,
    };
  });

  const blocked = matches.some((x) => x.errors.length > 0);
  const undecided = matches.some((x) => x.outOfWindow && !x.outOfWindowAccepted);
  const status: PlanStatus = blocked ? 'BLOCKED' : undecided ? 'NEEDS_DECISION' : 'READY';

  let rpc: Record<string, unknown> | null = null;
  if (status === 'READY') {
    rpc = {
      file_name: fileName,
      export_id: doc.exportId,
      checksum: doc.checksum,
      schema_version: 1,
      season_id: doc.target.seasonId,
      league_id: doc.target.leagueId,
      week_number: doc.target.weekNumber,
      generated_at: doc.generatedAt,
      source_fixtures_checksum: doc.source.fixturesChecksum,
      matches: doc.matches.map((m, i) => {
        const f = fixtureById.get(m.fixtureId)!;
        const plan = matches[i];
        return {
          fixture_id: m.fixtureId,
          expected_fixture_updated_at: f.updated_at,
          ea_match_id: m.eaMatchId,
          played_at: normIso(m.playedAt),
          home_team_id: f.home_team_id,
          away_team_id: f.away_team_id,
          home_score: m.home.score,
          away_score: m.away.score,
          out_of_window_accepted: plan.outOfWindowAccepted,
          players: m.players.map((p, j) => {
            const pp = plan.players[j];
            const extra = {
              import: 'weekly-results',
              export_id: doc.exportId,
              ea_identifier_status: pp.suggestion.status,
              suggested_profile_id: pp.suggestion.profileId,
              linked_by_admin: pp.linkedProfileId !== null,
              roster_status: pp.rosterStatus,
              match_team_id: pp.teamId,
            };
            const stats: Record<string, number> = {};
            for (const [col, key] of Object.entries(COLUMN_STATS)) stats[col] = p[key as keyof typeof p] as number;
            return {
              ea_player_id: p.eaPlayerId,
              ea_player_name: p.eaPlayerName,
              team_id: pp.teamId,
              position: p.position,
              player_id: pp.linkedProfileId,
              rating: p.rating,
              is_mom: p.mom,
              ...stats,
              extra_stats: extra,
            };
          }),
        };
      }),
      summary: { matches: doc.matches.length, players: doc.matches.reduce((n, m) => n + m.players.length, 0), linked: matches.reduce((n, m) => n + m.players.filter((p) => p.linkedProfileId).length, 0) },
      decisions: matches.filter((x) => x.outOfWindowAccepted).map((x) => ({ eaMatchId: x.eaMatchId, accepted: 'OUT_OF_WINDOW' })),
    };
  }

  const planHash = sha256(
    canonicalJson({
      checksum: doc.checksum,
      scope: doc.target,
      matches: matches.map((x) => ({ f: x.fixtureId, e: x.eaMatchId, o: x.outOfWindowAccepted, l: x.players.filter((p) => p.linkedProfileId).map((p) => [p.eaPlayerId, p.linkedProfileId]) })),
    })
  );
  return { fileName, exportId: doc.exportId, checksum: doc.checksum, generatedAt: doc.generatedAt, scope: doc.target, status, rejections: [], warnings, matches, rpc, planHash };
}

function usedBy(live: MatchLiveContext, eaMatchId: string): boolean {
  return !!live.usedEaMatchIds[eaMatchId];
}
