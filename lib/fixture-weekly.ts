/* eslint-disable @typescript-eslint/no-explicit-any -- untrusted JSON / row shapes are validated at runtime */
import { createHash } from 'node:crypto';

/**
 * `teta.fixtures` v2 — one file = one season + one league + one week.
 * (v1, see fixture-export.ts, is the whole-season export and is kept unchanged.)
 *
 * checksum = sha256(canonical JSON of { schemaVersion, kind, scope, teams, fixtures }).
 * exportId, generatedAt, window, issues and checksum itself are NOT part of the checksum.
 * A checksum identifies *content*; it never proves recency — use generatedAt/sourceRevision for that.
 */

export const WEEKLY_SCHEMA = 'teta.fixtures';
export const WEEKLY_SCHEMA_VERSION = 2;
export const WEEKLY_KIND = 'week';
export const IMPORTABLE_STATUSES = ['SCHEDULED', 'POSTPONED', 'CANCELLED'] as const;
export const ALL_STATUSES = ['SCHEDULED', 'COMPLETED', 'POSTPONED', 'CANCELLED', 'FORFEITED'] as const;
const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LiveFixture {
  id: string;
  season_id: string;
  league_id: string;
  week_number: number;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  status: string;
  notes: string | null;
  updated_at: string;
}
export interface LiveMatch {
  id: string;
  fixture_id: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  ea_match_id: string | null;
}
export interface LiveTeam {
  id: string;
  name: string;
  slug: string;
  ea_club_id: number | string | null;
  ea_club_name: string | null;
}

export interface WeeklyTeam {
  id: string;
  name: string;
  slug: string;
  eaClubId: number;
  eaClubName: string | null;
  activeInLeague: boolean;
}
export interface WeeklyFixture {
  id: string;
  weekNumber: number;
  scheduledAt: string;
  status: string;
  notes: string | null;
  homeTeamId: string;
  awayTeamId: string;
  updatedAt: string;
  match: { id: string; status: string; homeScore: number | null; awayScore: number | null; eaMatchId: string | null } | null;
}
export interface WeeklyDoc {
  schema: typeof WEEKLY_SCHEMA;
  schemaVersion: typeof WEEKLY_SCHEMA_VERSION;
  kind: typeof WEEKLY_KIND;
  exportId: string;
  checksum: string;
  generatedAt: string;
  sourceRevision: string | null;
  scope: { seasonId: string; seasonSlug: string; leagueId: string; leagueName: string; weekNumber: number };
  window: { from: string | null; to: string | null; fromDate: string | null; toDate: string | null; timezone: string };
  teams: WeeklyTeam[];
  fixtures: WeeklyFixture[];
  issues: { code: string; message: string }[];
}

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function computeWeeklyChecksum(d: Pick<WeeklyDoc, 'scope' | 'teams' | 'fixtures'>): string {
  return sha256(
    canonicalJson({ schemaVersion: WEEKLY_SCHEMA_VERSION, kind: WEEKLY_KIND, scope: d.scope, teams: d.teams, fixtures: d.fixtures })
  );
}

export function toTurkeyDate(iso: string): string {
  return new Date(new Date(iso).getTime() + TURKEY_OFFSET_MS).toISOString().slice(0, 10);
}
const validIso = (s: unknown): s is string => typeof s === 'string' && !isNaN(new Date(s).getTime());
export const toMs = (s: string) => new Date(s).getTime();
export const normIso = (s: string) => new Date(s).toISOString();

function asciiSlug(s: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  return s.replace(/[çğıöşüÇĞİÖŞÜ]/g, (m) => map[m]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'x';
}

export function weeklyFileName(scope: { seasonSlug: string; leagueName: string; weekNumber: number }): string {
  return `teta-fixtures_${asciiSlug(scope.seasonSlug)}_${asciiSlug(scope.leagueName)}_w${String(scope.weekNumber).padStart(2, '0')}.json`;
}

/** ZIP file name for a multi-file export. ASCII-only so it is always a valid HTTP header value. */
export function exportZipFileName(seasonSlug: string, fileCount: number): string {
  return `teta-fixtures_${asciiSlug(seasonSlug)}_${fileCount}-files.zip`;
}

/**
 * Issue codes that make an exported file unusable for the importer (missing/invalid EA club id, unknown team).
 * Such files are never delivered; they are reported instead. TEAM_NOT_IN_LEAGUE is only a warning.
 */
export const BLOCKING_ISSUE_CODES: readonly string[] = ['TEAM_NOT_FOUND', 'MISSING_EA_CLUB_ID'];

function parseEa(raw: number | string | null): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export interface BuildWeeklyInput {
  season: { id: string; slug: string };
  league: { id: string; name: string };
  teams: LiveTeam[];
  leagueTeams: { team_id: string; is_active: boolean }[];
  fixtures: LiveFixture[]; // all weeks of the league (filtered here)
  matches: LiveMatch[];
  weeks: number[];
  generatedAt?: Date;
}

export interface BuildWeeklyResult {
  docs: WeeklyDoc[];
  missingWeeks: number[];
}

export function buildWeeklyDocs(input: BuildWeeklyInput): BuildWeeklyResult {
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const ltById = new Map(input.leagueTeams.map((l) => [l.team_id, l]));
  const matchByFixture = new Map<string, LiveMatch>();
  for (const m of input.matches) if (m.fixture_id && !matchByFixture.has(m.fixture_id)) matchByFixture.set(m.fixture_id, m);

  const docs: WeeklyDoc[] = [];
  const missingWeeks: number[] = [];
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();

  for (const week of [...new Set(input.weeks)].sort((a, b) => a - b)) {
    const wf = input.fixtures
      .filter((f) => f.league_id === input.league.id && f.season_id === input.season.id && f.week_number === week)
      .sort((a, b) => toMs(a.scheduled_at) - toMs(b.scheduled_at) || a.id.localeCompare(b.id));
    if (wf.length === 0) {
      missingWeeks.push(week);
      continue;
    }
    const issues: { code: string; message: string }[] = [];
    const teamIds = [...new Set(wf.flatMap((f) => [f.home_team_id, f.away_team_id]))].sort();
    const teams: WeeklyTeam[] = teamIds.map((id) => {
      const t = teamById.get(id);
      const ea = t ? parseEa(t.ea_club_id) : null;
      if (!t) issues.push({ code: 'TEAM_NOT_FOUND', message: `Takım bulunamadı: ${id}` });
      else if (ea === null) issues.push({ code: 'MISSING_EA_CLUB_ID', message: `${t.name} takımının EA kulüp ID'si eksik/geçersiz.` });
      const lt = ltById.get(id);
      if (!lt) issues.push({ code: 'TEAM_NOT_IN_LEAGUE', message: `${t?.name ?? id} ligin kadrosunda değil.` });
      return {
        id,
        name: t?.name ?? '',
        slug: t?.slug ?? '',
        eaClubId: ea as number, // null is surfaced via issues and rejected by the importer
        eaClubName: t?.ea_club_name ?? null,
        activeInLeague: lt?.is_active ?? false,
      };
    });
    const fixtures: WeeklyFixture[] = wf.map((f) => {
      const m = matchByFixture.get(f.id);
      return {
        id: f.id,
        weekNumber: f.week_number,
        scheduledAt: normIso(f.scheduled_at),
        status: f.status,
        notes: f.notes ?? null,
        homeTeamId: f.home_team_id,
        awayTeamId: f.away_team_id,
        updatedAt: normIso(f.updated_at),
        match: m ? { id: m.id, status: m.status, homeScore: m.home_score, awayScore: m.away_score, eaMatchId: m.ea_match_id } : null,
      };
    });
    const scope = { seasonId: input.season.id, seasonSlug: input.season.slug, leagueId: input.league.id, leagueName: input.league.name, weekNumber: week };
    const checksum = computeWeeklyChecksum({ scope, teams, fixtures });
    const times = fixtures.map((f) => toMs(f.scheduledAt));
    const from = new Date(Math.min(...times)).toISOString();
    const to = new Date(Math.max(...times)).toISOString();
    const rev = fixtures.map((f) => toMs(f.updatedAt));
    docs.push({
      schema: WEEKLY_SCHEMA,
      schemaVersion: WEEKLY_SCHEMA_VERSION,
      kind: WEEKLY_KIND,
      exportId: 'tfw_' + checksum.slice(0, 32),
      checksum,
      generatedAt,
      sourceRevision: new Date(Math.max(...rev)).toISOString(),
      scope,
      window: { from, to, fromDate: toTurkeyDate(from), toDate: toTurkeyDate(to), timezone: 'Europe/Istanbul' },
      teams,
      fixtures,
      issues,
    });
  }
  return { docs, missingWeeks };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  doc?: WeeklyDoc;
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Structural + self-consistency validation of an uploaded file. Never trusts the file. */
export function validateWeeklyDoc(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['Dosya bir JSON nesnesi değil.'] };
  if (raw.schema !== WEEKLY_SCHEMA) errors.push(`schema "${WEEKLY_SCHEMA}" olmalı.`);
  if (raw.schemaVersion === 1) {
    return { ok: false, errors: ['schemaVersion 1 (tüm sezon dışa aktarması) haftalık içe aktarmada kullanılamaz; haftalık (v2) dosya gerekir.'] };
  }
  if (raw.schemaVersion !== WEEKLY_SCHEMA_VERSION) errors.push(`Desteklenmeyen schemaVersion: ${String(raw.schemaVersion)} (beklenen ${WEEKLY_SCHEMA_VERSION}).`);
  if (raw.kind !== WEEKLY_KIND) errors.push(`kind "${WEEKLY_KIND}" olmalı.`);
  if (typeof raw.exportId !== 'string' || !raw.exportId) errors.push('exportId eksik.');
  if (typeof raw.checksum !== 'string' || !/^[0-9a-f]{64}$/.test(raw.checksum)) errors.push('checksum geçersiz.');
  if (!validIso(raw.generatedAt)) errors.push('generatedAt geçersiz.');
  if (raw.sourceRevision !== null && raw.sourceRevision !== undefined && !validIso(raw.sourceRevision)) errors.push('sourceRevision geçersiz.');

  const s = raw.scope;
  if (!isObj(s)) errors.push('scope eksik.');
  else {
    if (!UUID_RE.test(String(s.seasonId))) errors.push('scope.seasonId geçersiz.');
    if (!UUID_RE.test(String(s.leagueId))) errors.push('scope.leagueId geçersiz.');
    if (!Number.isInteger(s.weekNumber) || s.weekNumber < 1) errors.push('scope.weekNumber geçersiz.');
  }
  if (!Array.isArray(raw.teams)) errors.push('teams dizisi eksik.');
  if (!Array.isArray(raw.fixtures) || raw.fixtures.length === 0) errors.push('fixtures dizisi boş veya eksik.');
  if (errors.length || !isObj(s) || !Array.isArray(raw.teams) || !Array.isArray(raw.fixtures)) return { ok: false, errors };

  const teamIds = new Set<string>();
  const eaSeen = new Map<number, string>();
  raw.teams.forEach((t: any, i: number) => {
    if (!isObj(t) || !UUID_RE.test(String(t.id))) return void errors.push(`teams[${i}].id geçersiz.`);
    if (teamIds.has(t.id)) errors.push(`teams içinde tekrar eden takım: ${t.id}`);
    teamIds.add(t.id);
    if (!Number.isSafeInteger(t.eaClubId) || t.eaClubId <= 0) errors.push(`Takım ${t.id} için EA kulüp ID'si eksik/geçersiz.`);
    else if (eaSeen.has(t.eaClubId)) errors.push(`EA kulüp ID'si ${t.eaClubId} birden fazla takımda (${eaSeen.get(t.eaClubId)}, ${t.id}).`);
    else eaSeen.set(t.eaClubId, t.id);
    if (typeof t.activeInLeague !== 'boolean') errors.push(`teams[${i}].activeInLeague boolean olmalı.`);
  });

  const fxIds = new Set<string>();
  const pair = new Set<string>();
  const perTeam = new Map<string, number>();
  raw.fixtures.forEach((f: any, i: number) => {
    const p = `fixtures[${i}]`;
    if (!isObj(f) || !UUID_RE.test(String(f.id))) return void errors.push(`${p}.id geçersiz.`);
    if (fxIds.has(f.id)) errors.push(`Tekrar eden fikstür kimliği: ${f.id}`);
    fxIds.add(f.id);
    if (f.weekNumber !== s.weekNumber) errors.push(`${p} hafta numarası (${f.weekNumber}) dosya haftasıyla (${s.weekNumber}) uyuşmuyor.`);
    if (!validIso(f.scheduledAt)) errors.push(`${p}.scheduledAt geçersiz.`);
    if (!validIso(f.updatedAt)) errors.push(`${p}.updatedAt geçersiz.`);
    if (!ALL_STATUSES.includes(f.status)) errors.push(`${p}.status geçersiz: ${String(f.status)}`);
    if (f.notes !== null && f.notes !== undefined && typeof f.notes !== 'string') errors.push(`${p}.notes string veya null olmalı.`);
    if (!teamIds.has(f.homeTeamId) || !teamIds.has(f.awayTeamId)) errors.push(`${p} takımları teams listesinde yok.`);
    if (f.homeTeamId === f.awayTeamId) errors.push(`${p} ev sahibi ve deplasman aynı.`);
    const key = `${f.homeTeamId}:${f.awayTeamId}`;
    if (pair.has(key)) errors.push(`${p} aynı hafta içinde tekrar eden eşleşme.`);
    pair.add(key);
    for (const t of [f.homeTeamId, f.awayTeamId]) perTeam.set(t, (perTeam.get(t) ?? 0) + 1);
  });
  // Teams listed but unused would hide mismatches; require exact set.
  for (const id of teamIds) if (!perTeam.has(id)) errors.push(`teams içindeki ${id} hiçbir fikstürde yok.`);
  if (errors.length) return { ok: false, errors };

  const doc = raw as unknown as WeeklyDoc;
  if (computeWeeklyChecksum(doc) !== doc.checksum) {
    errors.push('checksum içerikle uyuşmuyor (dosya değiştirilmiş veya bozulmuş).');
    return { ok: false, errors };
  }
  const times = doc.fixtures.map((f) => toMs(f.scheduledAt));
  const from = new Date(Math.min(...times)).toISOString();
  const to = new Date(Math.max(...times)).toISOString();
  if (!isObj(doc.window) || doc.window.from !== from || doc.window.to !== to) {
    errors.push('window, fikstür zamanlarıyla uyuşmuyor.');
    return { ok: false, errors };
  }
  return { ok: true, errors: [], doc };
}
