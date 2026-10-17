/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client and untrusted JSON are validated at runtime */
import { requireAdmin } from './fixture-import-service.ts';
import { emptyRejected, planMatchImport } from './match-import-plan.ts';
import type { LinkDecision, MatchFilePlan, MatchLiveContext } from './match-import-plan.ts';
import { validateResultsDoc } from './match-results-weekly.ts';
import type { ResultsDoc } from './match-results-weekly.ts';

/**
 * Server-side orchestration for importing teta.weekly-matches v1 files.
 * Takes the user-session Supabase client (RLS stays in force). Reads only, except applyMatchImport(), which calls the
 * atomic RPC `apply_weekly_match_imports`. Matches are created as AUTO + PENDING_REVIEW and are never approved here.
 */

type Supa = any;

// Server actions accept ~1 MB bodies by default; realistic weekly result files are ~100 KB.
export const MAX_MATCH_FILES = 10;
export const MAX_MATCH_FILE_BYTES = 800 * 1024;

export interface UploadedFile {
  name: string;
  text: string;
}
export interface MatchPreview {
  plans: MatchFilePlan[];
  batchErrors: string[];
  /** true only when no file is rejected/blocked/undecided and at least one is READY */
  canApply: boolean;
}

async function loadContext(supabase: Supa, p: { seasonId: string; leagueId: string; fixtureIds: string[]; eaMatchIds: string[] }): Promise<{ live?: MatchLiveContext; error?: string }> {
  const [s, l, f] = await Promise.all([
    supabase.from('seasons').select('id').eq('id', p.seasonId).maybeSingle(),
    supabase.from('leagues').select('id, season_id').eq('id', p.leagueId).maybeSingle(),
    supabase.from('fixtures').select('id, season_id, league_id, week_number, home_team_id, away_team_id, scheduled_at, status, updated_at').eq('league_id', p.leagueId).limit(5000),
  ]);
  const err = s.error || l.error || f.error;
  if (err) return { error: 'Veri okunamadı: ' + err.message };
  const fixtures = f.data ?? [];
  const teamIds = [...new Set<string>(fixtures.flatMap((x: any) => [x.home_team_id, x.away_team_id]))];

  const [t, mf, me, h, fi, pr, ms] = await Promise.all([
    teamIds.length ? supabase.from('teams').select('id, name, ea_club_id').in('id', teamIds) : Promise.resolve({ data: [], error: null }),
    p.fixtureIds.length ? supabase.from('matches').select('id, fixture_id, status').in('fixture_id', p.fixtureIds) : Promise.resolve({ data: [], error: null }),
    p.eaMatchIds.length ? supabase.from('matches').select('id, fixture_id, ea_match_id').in('ea_match_id', p.eaMatchIds) : Promise.resolve({ data: [], error: null }),
    supabase.from('match_import_history').select('result, checksum, file_generated_at, season_id, league_id, week_number').eq('league_id', p.leagueId).limit(5000),
    supabase.from('fixture_import_history').select('result, checksum, week_number').eq('league_id', p.leagueId).limit(5000),
    supabase.from('profiles').select('id, username, full_name, current_ea_player_id').not('current_ea_player_id', 'is', null).limit(5000),
    // No embedded teams(...): team_memberships references league_teams (composite FK), so PostgREST has no direct relationship to teams.
    supabase.from('team_memberships').select('id, player_id, team_id, season_id, left_at').eq('season_id', p.seasonId).is('left_at', null).limit(5000),
  ]);
  const e2 = t.error || mf.error || me.error || pr.error || ms.error;
  if (e2) return { error: 'Veri okunamadı: ' + e2.message };
  // match_import_history is required (migration must be applied); fixture history is informational only
  if (h.error) return { error: 'İçe aktarma geçmişi okunamadı (migration uygulanmış mı?): ' + h.error.message };

  const matchesByFixture: MatchLiveContext['matchesByFixture'] = {};
  for (const m of mf.data ?? []) if (m.fixture_id) (matchesByFixture[m.fixture_id] ??= []).push({ id: m.id, status: m.status });
  const usedEaMatchIds: MatchLiveContext['usedEaMatchIds'] = {};
  for (const m of me.data ?? []) usedEaMatchIds[m.ea_match_id] = { id: m.id, fixture_id: m.fixture_id };

  return {
    live: {
      season: s.data,
      league: l.data,
      fixtures,
      teams: t.data ?? [],
      matchesByFixture,
      usedEaMatchIds,
      history: h.data ?? [],
      fixtureImports: fi.error ? [] : fi.data ?? [],
      profiles: pr.data ?? [],
      memberships: ms.data ?? [],
    },
  };
}

export async function previewMatchImport(
  supabase: Supa,
  p: { seasonId: string; leagueId: string; files: UploadedFile[]; acceptedOutOfWindow?: string[]; acceptedLinks?: LinkDecision[] }
): Promise<MatchPreview> {
  if (p.files.length === 0) return { plans: [], batchErrors: ['Dosya seçilmedi.'], canApply: false };
  if (p.files.length > MAX_MATCH_FILES) return { plans: [], batchErrors: [`En fazla ${MAX_MATCH_FILES} dosya yüklenebilir.`], canApply: false };

  const parsed = p.files.map((f) => {
    if (f.text.length > MAX_MATCH_FILE_BYTES) return { name: f.name, rejections: [`Dosya çok büyük (> ${MAX_MATCH_FILE_BYTES / 1024} KB).`] };
    let raw: unknown;
    try {
      raw = JSON.parse(f.text.replace(/^\uFEFF/, ''));
    } catch {
      return { name: f.name, rejections: ['Geçerli bir JSON değil.'] };
    }
    const v = validateResultsDoc(raw);
    return v.ok ? { name: f.name, doc: v.doc!, warnings: v.warnings } : { name: f.name, rejections: v.errors };
  });
  const docs = parsed.filter((x): x is { name: string; doc: ResultsDoc; warnings: string[] } => 'doc' in x && !!x.doc);
  const fixtureIds = [...new Set(docs.flatMap((d) => d.doc.matches.map((m) => m.fixtureId)))];
  const eaMatchIds = [...new Set(docs.flatMap((d) => d.doc.matches.map((m) => m.eaMatchId)))];

  const { live, error } = await loadContext(supabase, { seasonId: p.seasonId, leagueId: p.leagueId, fixtureIds, eaMatchIds });
  if (error || !live) return { plans: [], batchErrors: [error ?? 'Veri okunamadı.'], canApply: false };

  const seenScope = new Map<string, string>();
  const seenChecksum = new Map<string, string>();
  const seenEa = new Map<string, string>();
  const plans: MatchFilePlan[] = parsed.map((x) => {
    if (!('doc' in x) || !x.doc) return emptyRejected(x.name, (x as { rejections: string[] }).rejections);
    const key = `${x.doc.target.seasonId}:${x.doc.target.leagueId}:${x.doc.target.weekNumber}`;
    const dupScope = seenScope.get(key);
    const dupSum = seenChecksum.get(x.doc.checksum);
    const dupEa = x.doc.matches.map((m) => ({ id: m.eaMatchId, other: seenEa.get(m.eaMatchId) })).find((d) => d.other);
    seenScope.set(key, x.name);
    seenChecksum.set(x.doc.checksum, x.name);
    for (const m of x.doc.matches) if (!seenEa.has(m.eaMatchId)) seenEa.set(m.eaMatchId, x.name);
    if (dupSum) return emptyRejected(x.name, [`Aynı içerik bu yüklemede zaten var (${dupSum}).`], x.doc);
    if (dupScope) return emptyRejected(x.name, [`Aynı hafta için birden fazla dosya yüklendi (${dupScope}); hafta başına tek dosya olmalı.`], x.doc);
    if (dupEa) return emptyRejected(x.name, [`EA maçı ${dupEa.id} bu yüklemede başka bir dosyada da var (${dupEa.other}).`], x.doc);
    const plan = planMatchImport({
      fileName: x.name,
      doc: x.doc,
      selected: { seasonId: p.seasonId, leagueId: p.leagueId },
      live,
      acceptedOutOfWindow: p.acceptedOutOfWindow,
      acceptedLinks: p.acceptedLinks,
    });
    plan.warnings.push(...x.warnings);
    return plan;
  });

  const batchErrors: string[] = [];
  const bad = plans.filter((x) => x.status === 'REJECTED' || x.status === 'BLOCKED');
  if (bad.length) batchErrors.push(`${bad.length} dosya reddedildi/engellendi; hiçbiri uygulanamaz: ${bad.map((b) => b.fileName).join(', ')}`);
  const pending = plans.filter((x) => x.status === 'NEEDS_DECISION');
  if (pending.length) batchErrors.push(`${pending.length} dosyada açık yönetici kararı bekleyen maç var.`);
  const canApply = bad.length === 0 && pending.length === 0 && plans.some((x) => x.status === 'READY');
  return { plans, batchErrors, canApply };
}

export interface MatchApplyResult {
  ok: boolean;
  error?: string;
  applied?: { fileName: string; exportId: string | null; matches: number }[];
}

export async function applyMatchImport(
  supabase: Supa,
  p: {
    seasonId: string;
    leagueId: string;
    files: UploadedFile[];
    acceptedOutOfWindow?: string[];
    acceptedLinks?: LinkDecision[];
    /** planHash per file name, exactly as shown to the admin in the preview */
    expectedHashes: Record<string, string | null>;
  }
): Promise<MatchApplyResult> {
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const preview = await previewMatchImport(supabase, p);
  if (!preview.canApply) return { ok: false, error: preview.batchErrors.join(' ') || 'Uygulanabilir maç yok.' };
  const ready = preview.plans.filter((x) => x.status === 'READY');
  for (const pl of ready) {
    if (p.expectedHashes[pl.fileName] !== pl.planHash) return { ok: false, error: `Önizlemeden sonra canlı veri veya dosya değişti (${pl.fileName}); önizlemeyi yenileyin.` };
  }

  const payload = ready.map((pl) => pl.rpc!);
  const { error } = await supabase.rpc('apply_weekly_match_imports', { p_files: payload });
  if (error) {
    // One transaction: nothing was written. Record the failed attempt separately (best effort, survives the rollback).
    let note = '';
    try {
      const ins = await supabase.from('match_import_history').insert(
        payload.map((f: any) => ({
          actor_id: auth.userId,
          season_id: f.season_id,
          league_id: f.league_id,
          week_number: f.week_number,
          export_id: f.export_id,
          checksum: f.checksum,
          schema_version: 1,
          file_name: f.file_name,
          file_generated_at: f.generated_at,
          source_fixtures_checksum: f.source_fixtures_checksum,
          result: 'REJECTED',
          summary: f.summary,
          error_message: error.message,
        }))
      );
      if (ins?.error) note = ' (Uyarı: başarısız deneme geçmişe yazılamadı: ' + ins.error.message + ')';
    } catch (e) {
      note = ' (Uyarı: başarısız deneme geçmişe yazılamadı: ' + String((e as Error)?.message ?? e) + ')';
    }
    return { ok: false, error: 'İçe aktarma uygulanamadı, hiçbir maç yazılmadı: ' + error.message + note };
  }
  return { ok: true, applied: ready.map((pl) => ({ fileName: pl.fileName, exportId: pl.exportId, matches: pl.matches.length })) };
}
