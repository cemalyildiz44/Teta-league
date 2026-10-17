'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { logAdminAudit } from '@/lib/audit';
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  UploadedFile,
  applyWeeklyImport,
  previewWeeklyImport,
  requireAdmin,
} from '@/lib/fixture-import-service';
import { UUID_RE } from '@/lib/fixture-weekly';

async function readInput(formData: FormData) {
  const seasonId = String(formData.get('seasonId') ?? '');
  const leagueId = String(formData.get('leagueId') ?? '');
  if (!UUID_RE.test(seasonId) || !UUID_RE.test(leagueId)) return { error: 'Sezon ve lig seçmelisiniz.' as const };
  const entries = formData.getAll('files').filter((f): f is File => typeof f !== 'string');
  if (entries.length === 0) return { error: 'Dosya seçilmedi.' as const };
  if (entries.length > MAX_FILES) return { error: `En fazla ${MAX_FILES} dosya yüklenebilir.` as const };
  const files: UploadedFile[] = [];
  for (const f of entries) {
    if (f.size > MAX_FILE_BYTES) files.push({ name: f.name, text: 'x'.repeat(MAX_FILE_BYTES + 1) });
    else files.push({ name: f.name, text: await f.text() });
  }
  const accepted = formData.getAll('accepted').map(String).filter((v) => UUID_RE.test(v));
  const rm = String(formData.get('removalMode') ?? '');
  const removalMode: 'cancel' | 'keep' | undefined = rm === 'cancel' || rm === 'keep' ? rm : undefined;
  return { seasonId, leagueId, files, accepted, removalMode };
}

/** Read-only: validates and diffs; never writes. */
export async function previewFixtureImportAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return { error: auth.error };
  const input = await readInput(formData);
  if ('error' in input) return { error: input.error };
  const preview = await previewWeeklyImport(supabase, {
    seasonId: input.seasonId,
    leagueId: input.leagueId,
    files: input.files,
    acceptedFixtureIds: input.accepted,
    removalMode: input.removalMode,
  });
  return { preview };
}

/** Writes through the atomic RPC, only after the admin confirmed the exact previewed plan. */
export async function applyFixtureImportAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return { error: auth.error };
  const input = await readInput(formData);
  if ('error' in input) return { error: input.error };

  let expectedHashes: Record<string, string | null> = {};
  try {
    expectedHashes = JSON.parse(String(formData.get('planHashes') ?? '{}'));
  } catch {
    return { error: 'Önizleme bilgisi geçersiz; önizlemeyi yenileyin.' };
  }
  if (formData.get('confirm') !== 'yes') return { error: 'Değişiklikler onaylanmadı.' };

  const result = await applyWeeklyImport(supabase, {
    seasonId: input.seasonId,
    leagueId: input.leagueId,
    files: input.files,
    acceptedFixtureIds: input.accepted,
    removalMode: input.removalMode,
    expectedHashes,
  });
  if (!result.ok) return { error: result.error };

  await logAdminAudit({
    action: 'IMPORT_WEEKLY_FIXTURES',
    entity_type: 'fixtures',
    entity_id: input.leagueId,
    entity_label: `${result.applied?.length ?? 0} haftalık fikstür dosyası`,
    description: 'Haftalık fikstür JSON dosyaları içe aktarıldı.',
    new_data: { files: result.applied },
    actor_id: auth.userId,
  });
  revalidatePath('/admin/fixtures');
  revalidatePath('/admin/fixtures/import');
  return { success: true as const, applied: result.applied };
}
