import { canonicalJson, normIso, sha256, toMs } from './fixture-weekly.ts';
import type { LiveFixture, WeeklyDoc, WeeklyFixture } from './fixture-weekly.ts';

/**
 * Pure, read-only import planner: compares one validated weekly file against live state.
 * Produces added / changed / removed / conflicting fixture lists and the exact
 * operations the atomic RPC will perform. Nothing here touches the database.
 */

export interface HistoryRow {
  result: string;
  checksum: string;
  file_generated_at: string | null;
  source_revision: string | null;
  season_id: string;
  league_id: string;
  week_number: number;
}

export interface LiveContext {
  season: { id: string } | null;
  league: { id: string; season_id: string } | null;
  /** all fixtures of the league, every week */
  leagueFixtures: LiveFixture[];
  /** fixture id -> linked matches */
  matchesByFixture: Record<string, { id: string; status: string }[]>;
  leagueTeams: { team_id: string; is_active: boolean }[];
  teams: { id: string; name: string; ea_club_id: number | string | null }[];
  /** ids from the file that already exist anywhere (for cross-scope collision detection) */
  existingFixtureIds: Record<string, { season_id: string; league_id: string; week_number: number }>;
  history: HistoryRow[];
}

export type Op =
  | { op: 'insert'; id: string; values: Record<string, unknown> }
  | { op: 'update'; id: string; expectedUpdatedAt: string; allowPlayed: boolean; values: Record<string, unknown> }
  | { op: 'cancel'; id: string; expectedUpdatedAt: string; values: Record<string, unknown> };

export interface Conflict {
  fixtureId: string | null;
  kind: string;
  message: string;
  blocking: boolean; // blocking = cannot be applied even with an explicit decision
}
export interface FixtureChange {
  fixtureId: string;
  fields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  played: boolean;
  reasons: string[]; // non-empty => explicit admin decision required
}
export interface RelatedWeek {
  weekNumber: number;
  teamId: string;
  reason: 'OLD_TEAM_OTHER_WEEK_FIXTURES' | 'NEW_TEAM_OTHER_WEEK_FIXTURES' | 'INACTIVE_TEAM_FIXTURES';
  fixtureIds: string[];
  unplayedFixtureIds: string[];
}

export type PlanStatus = 'REJECTED' | 'BLOCKED' | 'NOOP' | 'NEEDS_DECISION' | 'READY';

export interface FilePlan {
  fileName: string;
  exportId: string | null;
  checksum: string | null;
  generatedAt: string | null;
  sourceRevision: string | null;
  scope: WeeklyDoc['scope'] | null;
  status: PlanStatus;
  rejections: string[];
  adds: { fixtureId: string; after: Record<string, unknown> }[];
  changes: FixtureChange[];
  removals: { fixtureId: string; before: Record<string, unknown>; played: boolean }[];
  unchanged: number;
  conflicts: Conflict[];
  warnings: string[];
  relatedWeeks: RelatedWeek[];
  /** team id -> display name, for readable previews */
  teamNames: Record<string, string>;
  /** true when unplayed fixtures are missing from the file and the admin has not chosen cancel/keep yet */
  removalDecisionRequired: boolean;
  ops: Op[];
  planHash: string | null;
}

const isPlayed = (f: LiveFixture, matches: Record<string, unknown[]>) =>
  f.status === 'COMPLETED' || f.status === 'FORFEITED' || (matches[f.id]?.length ?? 0) > 0;

const snap = (f: { scheduledAt?: string; status: string; notes: string | null; homeTeamId: string; awayTeamId: string }) => ({
  scheduledAt: f.scheduledAt ? normIso(f.scheduledAt) : null,
  status: f.status,
  notes: f.notes ?? null,
  homeTeamId: f.homeTeamId,
  awayTeamId: f.awayTeamId,
});
const liveSnap = (f: LiveFixture) =>
  snap({ scheduledAt: f.scheduled_at, status: f.status, notes: f.notes, homeTeamId: f.home_team_id, awayTeamId: f.away_team_id });

const FIELD_COLUMN: Record<string, string> = {
  scheduledAt: 'scheduled_at',
  status: 'status',
  notes: 'notes',
  homeTeamId: 'home_team_id',
  awayTeamId: 'away_team_id',
};

export function emptyRejectedPlan(fileName: string, rejections: string[], doc?: Partial<WeeklyDoc>): FilePlan {
  return {
    fileName,
    exportId: doc?.exportId ?? null,
    checksum: doc?.checksum ?? null,
    generatedAt: doc?.generatedAt ?? null,
    sourceRevision: doc?.sourceRevision ?? null,
    scope: doc?.scope ?? null,
    status: 'REJECTED',
    rejections,
    adds: [],
    changes: [],
    removals: [],
    unchanged: 0,
    conflicts: [],
    warnings: [],
    relatedWeeks: [],
    teamNames: {},
    removalDecisionRequired: false,
    ops: [],
    planHash: null,
  };
}

export function planWeeklyImport(args: {
  fileName: string;
  doc: WeeklyDoc;
  selected: { seasonId: string; leagueId: string };
  live: LiveContext;
  acceptedFixtureIds?: string[];
  /** What to do with unplayed live fixtures that are absent from the file. Never cancels unless 'cancel'. */
  removalMode?: 'cancel' | 'keep';
}): FilePlan {
  const { doc, selected, live, fileName } = args;
  const accepted = new Set(args.acceptedFixtureIds ?? []);
  const rejections: string[] = [];
  const conflicts: Conflict[] = [];
  const warnings: string[] = [];

  // ---- scope: file must match the admin's selection AND live relationships ----
  if (doc.scope.seasonId !== selected.seasonId) rejections.push('Dosyadaki sezon, seçilen sezonla uyuşmuyor.');
  if (doc.scope.leagueId !== selected.leagueId) rejections.push('Dosyadaki lig, seçilen ligle uyuşmuyor.');
  if (!live.season || live.season.id !== selected.seasonId) rejections.push('Seçilen sezon bulunamadı.');
  if (!live.league) rejections.push('Seçilen lig bulunamadı.');
  else if (live.league.season_id !== selected.seasonId) rejections.push('Seçilen lig, seçilen sezona ait değil.');

  // ---- version control against transfer history ----
  const hist = live.history.filter(
    (h) => h.result === 'APPLIED' && h.season_id === doc.scope.seasonId && h.league_id === doc.scope.leagueId && h.week_number === doc.scope.weekNumber
  );
  const base = (): FilePlan => ({
    ...emptyRejectedPlan(fileName, rejections, doc),
    status: 'REJECTED',
  });
  if (rejections.length) return base();

  if (hist.some((h) => h.checksum === doc.checksum)) {
    return { ...base(), status: 'NOOP', rejections: [], warnings: ['Bu dosya (aynı içerik) daha önce uygulanmış; yeniden uygulanmayacak.'] };
  }
  const gen = toMs(doc.generatedAt);
  const rev = doc.sourceRevision ? toMs(doc.sourceRevision) : null;
  for (const h of hist) {
    if (h.file_generated_at && gen < toMs(h.file_generated_at)) {
      rejections.push(`Dosya daha eski bir dışa aktarma (${doc.generatedAt}); bu hafta için daha yeni bir dosya (${h.file_generated_at}) zaten uygulanmış.`);
      break;
    }
    if (h.source_revision && rev !== null && rev < toMs(h.source_revision)) {
      rejections.push(`Dosyanın kaynak sürümü (${doc.sourceRevision}) uygulanmış sürümden (${h.source_revision}) eski.`);
      break;
    }
  }
  if (rejections.length) return base();

  // ---- team data integrity against live ----
  const liveTeam = new Map(live.teams.map((t) => [t.id, t]));
  const lt = new Map(live.leagueTeams.map((x) => [x.team_id, x]));
  for (const t of doc.teams) {
    const l = liveTeam.get(t.id);
    if (!l) conflicts.push({ fixtureId: null, kind: 'TEAM_NOT_FOUND', blocking: true, message: `Takım canlı veride yok: ${t.name || t.id}` });
    else if (l.ea_club_id === null || l.ea_club_id === undefined || Number(l.ea_club_id) !== t.eaClubId)
      conflicts.push({ fixtureId: null, kind: 'TEAM_EA_ID_MISMATCH', blocking: true, message: `${l.name}: dosyadaki EA kulüp ID'si (${t.eaClubId}) canlıdaki (${String(l.ea_club_id)}) ile uyuşmuyor.` });
  }

  const weekLive = live.leagueFixtures.filter((f) => f.week_number === doc.scope.weekNumber && f.season_id === doc.scope.seasonId);
  const liveById = new Map(weekLive.map((f) => [f.id, f]));
  const adds: FilePlan['adds'] = [];
  const changes: FixtureChange[] = [];
  const removals: FilePlan['removals'] = [];
  const ops: Op[] = [];
  let unchanged = 0;
  const affectedOld = new Set<string>();
  const affectedNew = new Set<string>();

  for (const f of doc.fixtures as WeeklyFixture[]) {
    const existing = liveById.get(f.id);
    const elsewhere = live.existingFixtureIds[f.id];

    if (!existing) {
      if (elsewhere) {
        conflicts.push({ fixtureId: f.id, kind: 'FIXTURE_ID_IN_OTHER_SCOPE', blocking: true, message: `Fikstür kimliği başka bir sezon/lig/haftada zaten var (hafta ${elsewhere.week_number}).` });
        continue;
      }
      if (f.status === 'COMPLETED' || f.status === 'FORFEITED') {
        conflicts.push({ fixtureId: f.id, kind: 'NEW_FIXTURE_ALREADY_PLAYED_STATUS', blocking: true, message: 'Yeni fikstür COMPLETED/FORFEITED olarak eklenemez.' });
        continue;
      }
      for (const tid of [f.homeTeamId, f.awayTeamId]) {
        const m = lt.get(tid);
        if (!m) conflicts.push({ fixtureId: f.id, kind: 'TEAM_NOT_IN_LEAGUE', blocking: true, message: `Takım (${tid}) bu ligin kadrosunda değil.` });
        else if (!m.is_active) conflicts.push({ fixtureId: f.id, kind: 'TEAM_INACTIVE_IN_LEAGUE', blocking: true, message: `Takım (${tid}) ligde pasif; yeni fikstüre eklenemez.` });
        affectedNew.add(tid);
      }
      const after = snap(f);
      adds.push({ fixtureId: f.id, after });
      ops.push({
        op: 'insert',
        id: f.id,
        values: {
          season_id: doc.scope.seasonId,
          league_id: doc.scope.leagueId,
          week_number: doc.scope.weekNumber,
          home_team_id: f.homeTeamId,
          away_team_id: f.awayTeamId,
          scheduled_at: after.scheduledAt,
          status: f.status,
          notes: f.notes,
        },
      });
      continue;
    }

    const before = liveSnap(existing);
    const after = snap(f);
    const fields = (Object.keys(before) as (keyof typeof before)[]).filter((k) =>
      k === 'scheduledAt' ? toMs(before.scheduledAt!) !== toMs(after.scheduledAt!) : before[k] !== after[k]
    );
    if (fields.length === 0) {
      unchanged++;
      continue;
    }
    const played = isPlayed(existing, live.matchesByFixture);
    const reasons: string[] = [];
    let blocked = false;

    const teamChanged = fields.includes('homeTeamId') || fields.includes('awayTeamId');
    const statusChanged = fields.includes('status');
    if (statusChanged && (f.status === 'COMPLETED' || f.status === 'FORFEITED')) {
      conflicts.push({ fixtureId: f.id, kind: 'STATUS_MANAGED_BY_MATCH_FLOW', blocking: true, message: 'COMPLETED/FORFEITED durumu yalnızca maç onayıyla belirlenir; dosyadan değiştirilemez.' });
      blocked = true;
    }
    if (played && (teamChanged || statusChanged)) {
      conflicts.push({ fixtureId: f.id, kind: 'PLAYED_FIXTURE_TEAM_OR_STATUS_CHANGE', blocking: true, message: 'Oynanmış/maçı olan fikstürde takım veya durum değiştirilemez (sonuç ve istatistikler korunur).' });
      blocked = true;
    }
    if (played && !blocked) reasons.push('PLAYED_FIXTURE');
    if (toMs(existing.updated_at) !== toMs(f.updatedAt)) reasons.push('LIVE_CHANGED_SINCE_EXPORT');
    if (teamChanged) {
      for (const tid of [f.homeTeamId, f.awayTeamId]) {
        const m = lt.get(tid);
        if (tid !== existing.home_team_id && tid !== existing.away_team_id) {
          affectedNew.add(tid);
          if (!m) conflicts.push({ fixtureId: f.id, kind: 'TEAM_NOT_IN_LEAGUE', blocking: true, message: `Takım (${tid}) bu ligin kadrosunda değil.` });
          else if (!m.is_active) conflicts.push({ fixtureId: f.id, kind: 'TEAM_INACTIVE_IN_LEAGUE', blocking: true, message: `Takım (${tid}) ligde pasif.` });
        }
      }
      for (const tid of [existing.home_team_id, existing.away_team_id]) {
        if (tid !== f.homeTeamId && tid !== f.awayTeamId) affectedOld.add(tid);
      }
    }

    changes.push({ fixtureId: f.id, fields, before, after, played, reasons });
    const values: Record<string, unknown> = {};
    for (const k of fields) values[FIELD_COLUMN[k]] = k === 'scheduledAt' ? after.scheduledAt : (after as Record<string, unknown>)[k];
    if (!blocked) ops.push({ op: 'update', id: f.id, expectedUpdatedAt: existing.updated_at, allowPlayed: played, values });
  }

  // ---- fixtures present live but absent from the (authoritative) week file ----
  const fileIds = new Set(doc.fixtures.map((f) => f.id));
  for (const lf of weekLive) {
    if (fileIds.has(lf.id) || lf.status === 'CANCELLED') continue;
    const played = isPlayed(lf, live.matchesByFixture);
    removals.push({ fixtureId: lf.id, before: liveSnap(lf), played });
    if (played) {
      conflicts.push({ fixtureId: lf.id, kind: 'REMOVAL_OF_PLAYED_FIXTURE', blocking: true, message: 'Oynanmış fikstür dosyada yok; iptal edilmeyecek, sonuç ve istatistikler korunur.' });
    } else if (args.removalMode === 'cancel') {
      affectedOld.add(lf.home_team_id);
      affectedOld.add(lf.away_team_id);
      ops.push({
        op: 'cancel',
        id: lf.id,
        expectedUpdatedAt: lf.updated_at,
        values: { status: 'CANCELLED', notes: `[TETA içe aktarma ${doc.exportId}] Dosyada yer almadığı için iptal edildi.${lf.notes ? ' | ' + lf.notes : ''}` },
      });
    }
  }

  // ---- resulting-week sanity: a team playing twice in the same week ----
  const resulting = new Map<string, number>();
  for (const f of doc.fixtures) if (f.status !== 'CANCELLED') for (const t of [f.homeTeamId, f.awayTeamId]) resulting.set(t, (resulting.get(t) ?? 0) + 1);
  for (const [t, n] of resulting) if (n > 1) warnings.push(`Takım (${t}) bu hafta ${n} maça atanmış.`);

  // ---- team change / withdrawal: look at the OTHER weeks of the league too ----
  const inactiveInFile = doc.teams.filter((t) => lt.get(t.id) && !lt.get(t.id)!.is_active).map((t) => t.id);
  const relatedWeeks: RelatedWeek[] = [];
  const scan = (teamIds: Iterable<string>, reason: RelatedWeek['reason']) => {
    for (const teamId of [...new Set(teamIds)].sort()) {
      const byWeek = new Map<number, LiveFixture[]>();
      for (const lf of live.leagueFixtures) {
        if (lf.week_number === doc.scope.weekNumber || lf.status === 'CANCELLED') continue;
        if (lf.home_team_id === teamId || lf.away_team_id === teamId) byWeek.set(lf.week_number, [...(byWeek.get(lf.week_number) ?? []), lf]);
      }
      for (const [weekNumber, fx] of [...byWeek].sort((a, b) => a[0] - b[0])) {
        relatedWeeks.push({
          weekNumber,
          teamId,
          reason,
          fixtureIds: fx.map((x) => x.id).sort(),
          unplayedFixtureIds: fx.filter((x) => !isPlayed(x, live.matchesByFixture)).map((x) => x.id).sort(),
        });
      }
    }
  };
  scan([...affectedOld].filter((t) => !affectedNew.has(t)), 'OLD_TEAM_OTHER_WEEK_FIXTURES');
  scan([...affectedNew].filter((t) => !affectedOld.has(t)), 'NEW_TEAM_OTHER_WEEK_FIXTURES');
  scan(inactiveInFile, 'INACTIVE_TEAM_FIXTURES');
  if (relatedWeeks.some((r) => r.unplayedFixtureIds.length)) {
    warnings.push('Takım değişikliği/çekilme diğer haftaları da etkiliyor; ilgili haftalara ait dosyaları ayrıca gözden geçirin (otomatik değiştirilmez).');
  }

  // ---- status ----
  const blocking = conflicts.some((c) => c.blocking);
  const undecided = changes.some((c) => c.reasons.length > 0 && !accepted.has(c.fixtureId));
  const removalDecisionRequired = !args.removalMode && removals.some((r) => !r.played);
  if (args.removalMode === 'keep' && removals.some((r) => !r.played)) {
    warnings.push('Dosyada olmayan oynanmamış fikstürler iptal EDİLMEYECEK (korunacak).');
  }
  let status: PlanStatus;
  if (blocking) status = 'BLOCKED';
  else if (undecided || removalDecisionRequired) status = 'NEEDS_DECISION';
  else if (!ops.length) status = 'NOOP';
  else status = 'READY';

  const plan: FilePlan = {
    fileName,
    exportId: doc.exportId,
    checksum: doc.checksum,
    generatedAt: doc.generatedAt,
    sourceRevision: doc.sourceRevision,
    scope: doc.scope,
    status,
    rejections: [],
    adds,
    changes,
    removals,
    unchanged,
    conflicts,
    warnings,
    relatedWeeks,
    teamNames: Object.fromEntries(live.teams.map((t) => [t.id, t.name])),
    removalDecisionRequired,
    ops,
    planHash: null,
  };
  plan.planHash = sha256(canonicalJson({ checksum: doc.checksum, scope: doc.scope, ops, removalMode: args.removalMode ?? null }));
  return plan;
}

export function summarizePlan(p: FilePlan) {
  return {
    added: p.adds.length,
    changed: p.changes.length,
    removed: p.ops.filter((o) => o.op === 'cancel').length,
    unchanged: p.unchanged,
    conflicts: p.conflicts.length,
    relatedWeeks: p.relatedWeeks.length,
  };
}
