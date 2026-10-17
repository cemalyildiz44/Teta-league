/* eslint-disable @typescript-eslint/no-explicit-any -- untrusted JSON / row shapes are validated at runtime */
import { BLOCKING_ISSUE_CODES, buildWeeklyDocs, validateWeeklyDoc, weeklyFileName } from './fixture-weekly.ts';
import type { LiveFixture, LiveMatch, LiveTeam, WeeklyDoc } from './fixture-weekly.ts';
import { emptyRejectedPlan, planWeeklyImport, summarizePlan } from './fixture-import-plan.ts';
import type { FilePlan, HistoryRow, LiveContext } from './fixture-import-plan.ts';

/**
 * Server-side orchestration for weekly fixture export/import.
 * Takes a Supabase client (user-session client => RLS stays in force) so it is testable.
 * Reads only, except applyImport() which calls the atomic RPC.
 */

type Supa = any;

export const MAX_FILES = 60;
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_EXPORT_FILES = 200;
const FIXTURE_COLS = 'id, season_id, league_id, week_number, home_team_id, away_team_id, scheduled_at, status, notes, updated_at';

export async function requireAdmin(supabase: Supa): Promise<{ ok: true; userId: string } | { ok: false; error: string; status: 401 | 403 }> {
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return { ok: false, error: 'Giriş yapmalısınız.', status: 401 };
  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  if (!role) return { ok: false, error: 'Yetkisiz erişim.', status: 403 };
  return { ok: true, userId: user.id };
}

interface LeagueData {
  season: { id: string; slug: string; name: string } | null;
  league: { id: string; season_id: string; name: string } | null;
  fixtures: LiveFixture[];
  matches: LiveMatch[];
  leagueTeams: { team_id: string; is_active: boolean }[];
  teams: LiveTeam[];
}

async function loadLeagueData(supabase: Supa, seasonId: string, leagueId: string): Promise<{ data?: LeagueData; error?: string }> {
  const [s, l, f, m, lt] = await Promise.all([
    supabase.from('seasons').select('id, slug, name').eq('id', seasonId).maybeSingle(),
    supabase.from('leagues').select('id, season_id, name').eq('id', leagueId).maybeSingle(),
    supabase.from('fixtures').select(FIXTURE_COLS).eq('league_id', leagueId).limit(5000),
    supabase.from('matches').select('id, fixture_id, status, home_score, away_score, ea_match_id').eq('league_id', leagueId).limit(5000),
    supabase.from('league_teams').select('team_id, is_active').eq('league_id', leagueId).limit(1000),
  ]);
  const err = s.error || l.error || f.error || m.error || lt.error;
  if (err) return { error: 'Veri okunamadı: ' + err.message };
  const fixtures: LiveFixture[] = f.data ?? [];
  const leagueTeams = lt.data ?? [];
  const teamIds = [...new Set<string>([...leagueTeams.map((x: any) => x.team_id), ...fixtures.flatMap((x) => [x.home_team_id, x.away_team_id])])];
  let teams: LiveTeam[] = [];
  if (teamIds.length) {
    const t = await supabase.from('teams').select('id, name, slug, ea_club_id, ea_club_name').in('id', teamIds);
    if (t.error) return { error: 'Takımlar okunamadı: ' + t.error.message };
    teams = t.data ?? [];
  }
  return { data: { season: s.data, league: l.data, fixtures, matches: m.data ?? [], leagueTeams, teams } };
}

// ---------------------------------------------------------------- export

export interface ExportParams {
  seasonId: string;
  leagueIds: string[];
  weekFrom?: number;
  weekTo?: number;
  generatedAt?: Date;
}
export interface ExportedFile {
  name: string;
  doc: WeeklyDoc;
}
export interface ExportResult {
  files: ExportedFile[];
  report: { missing: { leagueId: string; weekNumber: number }[]; issues: { file: string; code: string; message: string }[] };
}

export async function exportWeeklyFiles(supabase: Supa, p: ExportParams): Promise<{ result?: ExportResult; error?: string; status?: number }> {
  const files: ExportedFile[] = [];
  const taken = new Set<string>();
  const report: ExportResult['report'] = { missing: [], issues: [] };
  for (const leagueId of [...new Set(p.leagueIds)]) {
    const { data, error } = await loadLeagueData(supabase, p.seasonId, leagueId);
    if (error || !data) return { error: error ?? 'Veri okunamadı.', status: 500 };
    if (!data.season) return { error: 'Sezon bulunamadı.', status: 404 };
    if (!data.league || data.league.season_id !== p.seasonId) return { error: `Lig bu sezonda bulunamadı: ${leagueId}`, status: 404 };
    const present = [...new Set(data.fixtures.filter((x) => x.season_id === p.seasonId).map((x) => x.week_number))].sort((a, b) => a - b);
    const from = p.weekFrom ?? present[0] ?? 1;
    const to = p.weekTo ?? present[present.length - 1] ?? from;
    if (to - from > MAX_EXPORT_FILES) return { error: 'Hafta aralığı çok geniş.', status: 400 };
    const weeks: number[] = [];
    for (let w = from; w <= to; w++) weeks.push(w);
    const built = buildWeeklyDocs({
      season: data.season,
      league: data.league,
      teams: data.teams,
      leagueTeams: data.leagueTeams,
      fixtures: data.fixtures,
      matches: data.matches,
      weeks,
      generatedAt: p.generatedAt,
    });
    for (const w of built.missingWeeks) report.missing.push({ leagueId, weekNumber: w });
    for (const doc of built.docs) {
      let name = weeklyFileName(doc.scope);
      // Two leagues whose names slugify identically must not overwrite each other inside one ZIP.
      if (taken.has(name)) name = name.replace(/.json$/, `_${doc.scope.leagueId.slice(0, 8)}.json`);
      taken.add(name);
      files.push({ name, doc });
      for (const i of doc.issues) report.issues.push({ file: name, ...i });
    }
  }
  if (files.length > MAX_EXPORT_FILES) return { error: 'Çok fazla dosya istendi.', status: 400 };
  if (files.length === 0) return { error: 'Seçilen kapsamda dışa aktarılacak fikstür yok.', status: 404 };
  return { result: { files, report } };
}

export interface BlockedExportFile {
  name: string;
  leagueId: string;
  weekNumber: number;
  issues: { code: string; message: string }[];
}
export interface ExportDelivery {
  /** Files that are safe to hand to the importer. */
  files: ExportedFile[];
  /** Files withheld because they would be rejected by the importer (missing EA club id, unknown team). */
  blocked: BlockedExportFile[];
  /** Human-readable (Turkish) notes: missing weeks, withheld files, non-blocking warnings. */
  notices: string[];
}

/**
 * Splits an export into deliverable and withheld files. Pure and read-only: nothing is written anywhere.
 * An unusable file is never delivered silently; it is listed in `blocked` and `notices`.
 */
export function prepareExportDelivery(result: ExportResult): ExportDelivery {
  const files: ExportedFile[] = [];
  const blocked: BlockedExportFile[] = [];
  const notices: string[] = [];
  for (const f of result.files) {
    const bad = f.doc.issues.filter((i) => BLOCKING_ISSUE_CODES.includes(i.code));
    if (bad.length) {
      blocked.push({ name: f.name, leagueId: f.doc.scope.leagueId, weekNumber: f.doc.scope.weekNumber, issues: bad });
      notices.push(`${f.name} verilmedi: ${bad.map((i) => i.message).join(' ')}`);
    } else {
      files.push(f);
    }
  }
  for (const m of result.report.missing) notices.push(`${m.weekNumber}. hafta için fikstür yok (lig ${m.leagueId}); dosya üretilmedi.`);
  for (const i of result.report.issues) {
    if (!BLOCKING_ISSUE_CODES.includes(i.code)) notices.push(`${i.file}: ${i.message}`);
  }
  return { files, blocked, notices };
}

// ---------------------------------------------------------------- import preview

export interface UploadedFile {
  name: string;
  text: string;
}
export interface PreviewResult {
  plans: FilePlan[];
  batchErrors: string[];
  /** true only when every file is READY/NOOP and at least one READY */
  canApply: boolean;
}

export async function previewWeeklyImport(
  supabase: Supa,
  p: { seasonId: string; leagueId: string; files: UploadedFile[]; acceptedFixtureIds?: string[]; removalMode?: 'cancel' | 'keep' }
): Promise<PreviewResult> {
  const batchErrors: string[] = [];
  if (p.files.length === 0) return { plans: [], batchErrors: ['Dosya seçilmedi.'], canApply: false };
  if (p.files.length > MAX_FILES) return { plans: [], batchErrors: [`En fazla ${MAX_FILES} dosya yüklenebilir.`], canApply: false };

  const parsed = p.files.map((f) => {
    if (f.text.length > MAX_FILE_BYTES) return { name: f.name, rejections: [`Dosya çok büyük (> ${MAX_FILE_BYTES / 1024} KB).`] };
    let raw: unknown;
    try {
      raw = JSON.parse(f.text);
    } catch {
      return { name: f.name, rejections: ['Geçerli bir JSON değil.'] };
    }
    const v = validateWeeklyDoc(raw);
    return v.ok ? { name: f.name, doc: v.doc! } : { name: f.name, rejections: v.errors };
  });

  const { data, error } = await loadLeagueData(supabase, p.seasonId, p.leagueId);
  if (error || !data) return { plans: [], batchErrors: [error ?? 'Veri okunamadı.'], canApply: false };

  const docs = parsed.filter((x): x is { name: string; doc: WeeklyDoc } => 'doc' in x && !!x.doc);
  const ids = [...new Set(docs.flatMap((d) => d.doc.fixtures.map((f) => f.id)))];
  const existingFixtureIds: LiveContext['existingFixtureIds'] = {};
  if (ids.length) {
    const r = await supabase.from('fixtures').select('id, season_id, league_id, week_number').in('id', ids);
    if (r.error) return { plans: [], batchErrors: ['Fikstürler okunamadı: ' + r.error.message], canApply: false };
    for (const x of r.data ?? []) existingFixtureIds[x.id] = { season_id: x.season_id, league_id: x.league_id, week_number: x.week_number };
  }
  const h = await supabase
    .from('fixture_import_history')
    .select('result, checksum, file_generated_at, source_revision, season_id, league_id, week_number')
    .eq('league_id', p.leagueId)
    .limit(5000);
  if (h.error) return { plans: [], batchErrors: ['Aktarım geçmişi okunamadı: ' + h.error.message], canApply: false };

  const matchesByFixture: LiveContext['matchesByFixture'] = {};
  for (const m of data.matches) if (m.fixture_id) (matchesByFixture[m.fixture_id] ??= []).push({ id: m.id, status: m.status });

  const live: LiveContext = {
    season: data.season,
    league: data.league,
    leagueFixtures: data.fixtures,
    matchesByFixture,
    leagueTeams: data.leagueTeams,
    teams: data.teams,
    existingFixtureIds,
    history: (h.data ?? []) as HistoryRow[],
  };

  // duplicate scopes / checksums inside the batch
  const seenScope = new Map<string, string>();
  const seenChecksum = new Map<string, string>();
  const plans: FilePlan[] = parsed.map((x) => {
    if (!('doc' in x) || !x.doc) return emptyRejectedPlan(x.name, (x as { rejections: string[] }).rejections);
    const key = `${x.doc.scope.seasonId}:${x.doc.scope.leagueId}:${x.doc.scope.weekNumber}`;
    const dupScope = seenScope.get(key);
    const dupSum = seenChecksum.get(x.doc.checksum);
    seenScope.set(key, x.name);
    seenChecksum.set(x.doc.checksum, x.name);
    if (dupSum) return emptyRejectedPlan(x.name, [`Aynı içerik bu yüklemede zaten var (${dupSum}).`], x.doc);
    if (dupScope) return emptyRejectedPlan(x.name, [`Aynı hafta için birden fazla dosya yüklendi (${dupScope}); hafta başına tek dosya olmalı.`], x.doc);
    return planWeeklyImport({
      fileName: x.name,
      doc: x.doc,
      selected: { seasonId: p.seasonId, leagueId: p.leagueId },
      live,
      acceptedFixtureIds: p.acceptedFixtureIds,
      removalMode: p.removalMode,
    });
  });

  const bad = plans.filter((x) => x.status === 'REJECTED' || x.status === 'BLOCKED');
  if (bad.length) batchErrors.push(`${bad.length} dosya reddedildi/engellendi; hiçbiri uygulanamaz: ${bad.map((b) => b.fileName).join(', ')}`);
  const pending = plans.filter((x) => x.status === 'NEEDS_DECISION');
  if (pending.length) batchErrors.push(`${pending.length} dosyada açık yönetici kararı bekleyen değişiklik var.`);
  const canApply = bad.length === 0 && pending.length === 0 && plans.some((x) => x.status === 'READY');
  return { plans, batchErrors, canApply };
}

// ---------------------------------------------------------------- apply (atomic RPC)

export interface ApplyResult {
  ok: boolean;
  error?: string;
  applied?: { fileName: string; summary: ReturnType<typeof summarizePlan> }[];
}

export async function applyWeeklyImport(
  supabase: Supa,
  p: {
    seasonId: string;
    leagueId: string;
    files: UploadedFile[];
    acceptedFixtureIds: string[];
    removalMode?: 'cancel' | 'keep';
    /** planHash per file name, as shown to the admin in the preview */
    expectedHashes: Record<string, string | null>;
  }
): Promise<ApplyResult> {
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const preview = await previewWeeklyImport(supabase, p);
  if (!preview.canApply) return { ok: false, error: preview.batchErrors.join(' ') || 'Uygulanabilir değişiklik yok.' };

  const ready = preview.plans.filter((x) => x.status === 'READY');
  for (const pl of ready) {
    if (p.expectedHashes[pl.fileName] !== pl.planHash) {
      return { ok: false, error: `Önizlemeden sonra canlı veri veya dosya değişti (${pl.fileName}); önizlemeyi yenileyin.` };
    }
  }

  const accepted = new Set(p.acceptedFixtureIds);
  const payload = ready.map((pl) => ({
    file_name: pl.fileName,
    export_id: pl.exportId,
    checksum: pl.checksum,
    schema_version: 2,
    season_id: pl.scope!.seasonId,
    league_id: pl.scope!.leagueId,
    week_number: pl.scope!.weekNumber,
    generated_at: pl.generatedAt,
    source_revision: pl.sourceRevision,
    ops: pl.ops,
    summary: summarizePlan(pl),
    decisions: pl.changes.filter((c) => c.reasons.length && accepted.has(c.fixtureId)).map((c) => ({ fixtureId: c.fixtureId, reasons: c.reasons })),
  }));

  const { error } = await supabase.rpc('apply_fixture_week_imports', { p_files: payload });
  if (error) {
    // The RPC runs in one transaction, so nothing was written. Record the failed attempt (best effort).
    // Separate request => separate transaction: it survives the rollback of the RPC above.
    let historyNote = '';
    try {
      const ins = await supabase.from('fixture_import_history').insert(
        payload.map((f) => ({
          actor_id: auth.userId,
          season_id: f.season_id,
          league_id: f.league_id,
          week_number: f.week_number,
          export_id: f.export_id,
          checksum: f.checksum,
          schema_version: 2,
          file_name: f.file_name,
          file_generated_at: f.generated_at,
          source_revision: f.source_revision,
          result: 'REJECTED',
          summary: f.summary,
          error_message: error.message,
        }))
      );
      if (ins?.error) historyNote = ' (Uyarı: başarısız deneme geçmişe yazılamadı: ' + ins.error.message + ')';
    } catch (e) {
      historyNote = ' (Uyarı: başarısız deneme geçmişe yazılamadı: ' + String((e as Error)?.message ?? e) + ')';
    }
    return { ok: false, error: 'Aktarım uygulanamadı, hiçbir değişiklik yazılmadı: ' + error.message + historyNote };
  }
  return { ok: true, applied: ready.map((pl) => ({ fileName: pl.fileName, summary: summarizePlan(pl) })) };
}
