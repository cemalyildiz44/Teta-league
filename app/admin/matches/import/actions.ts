'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { logAdminAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/fixture-import-service';
import { UUID_RE } from '@/lib/fixture-weekly';
import { MAX_MATCH_FILES, MAX_MATCH_FILE_BYTES, applyMatchImport, previewMatchImport } from '@/lib/match-import-service';
import type { UploadedFile } from '@/lib/match-import-service';
import type { LinkDecision } from '@/lib/match-import-plan';

async function readInput(formData: FormData) {
  const seasonId = String(formData.get('seasonId') ?? '');
  const leagueId = String(formData.get('leagueId') ?? '');
  if (!UUID_RE.test(seasonId) || !UUID_RE.test(leagueId)) return { error: 'Sezon ve lig seçmelisiniz.' as const };
  const entries = formData.getAll('files').filter((f): f is File => typeof f !== 'string');
  if (entries.length === 0) return { error: 'Dosya seçilmedi.' as const };
  if (entries.length > MAX_MATCH_FILES) return { error: `En fazla ${MAX_MATCH_FILES} dosya yüklenebilir.` as const };
  const files: UploadedFile[] = [];
  for (const f of entries) {
    if (f.size > MAX_MATCH_FILE_BYTES) files.push({ name: f.name, text: 'x'.repeat(MAX_MATCH_FILE_BYTES + 1) });
    else files.push({ name: f.name, text: await f.text() });
  }
  const acceptedOutOfWindow = formData.getAll('oow').map(String).filter((v) => /^[1-9][0-9]{0,23}$/.test(v));
  let acceptedLinks: LinkDecision[] = [];
  try {
    const raw = JSON.parse(String(formData.get('links') ?? '[]'));
    if (Array.isArray(raw) && raw.length <= 2000) {
      acceptedLinks = raw.filter(
        (l): l is LinkDecision =>
          !!l && /^[1-9][0-9]{0,23}$/.test(String(l.eaMatchId)) && typeof l.eaPlayerId === 'string' && l.eaPlayerId.length > 0 && l.eaPlayerId.length <= 24 && UUID_RE.test(String(l.profileId))
      );
    }
  } catch {
    return { error: 'Oyuncu bağlantı kararları geçersiz; önizlemeyi yenileyin.' as const };
  }
  return { seasonId, leagueId, files, acceptedOutOfWindow, acceptedLinks };
}

/** Read-only: validates the files and diffs them against live data; never writes. */
export async function previewMatchImportAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return { error: auth.error };
  const input = await readInput(formData);
  if ('error' in input) return { error: input.error };
  return { preview: await previewMatchImport(supabase, input) };
}

/** Writes through the atomic RPC, only after the admin confirmed the exact previewed plan. Matches become PENDING_REVIEW. */
export async function applyMatchImportAction(formData: FormData) {
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
  if (formData.get('confirm') !== 'yes') return { error: 'İçe aktarma onaylanmadı.' };

  const result = await applyMatchImport(supabase, { ...input, expectedHashes });
  if (!result.ok) return { error: result.error };

  await logAdminAudit({
    action: 'IMPORT_WEEKLY_MATCHES',
    entity_type: 'matches',
    entity_id: input.leagueId,
    entity_label: `${result.applied?.reduce((n, a) => n + a.matches, 0) ?? 0} maç (PENDING_REVIEW)`,
    description: 'Haftalık maç sonuçları JSON dosyasından içe aktarıldı; maçlar inceleme bekliyor.',
    new_data: { files: result.applied },
    actor_id: auth.userId,
  });
  revalidatePath('/admin/matches');
  revalidatePath('/admin/matches/import');
  return { success: true as const, applied: result.applied };
}
