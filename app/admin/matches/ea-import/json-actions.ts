'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { logAdminAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/fixture-import-service';
import { UUID_RE } from '@/lib/fixture-weekly';
import { MAX_MATCH_FILE_BYTES, applyMatchImport, loadReviewMatchWithRosters, previewMatchImport, validateReviewRosterAssignment } from '@/lib/match-import-service';
import type { LinkDecision } from '@/lib/match-import-plan';
import { assignPlayerStatsProfileAction } from '../actions';

// JSON-based match transfer screen: one file (teta.weekly-matches v1), matches are sent to the admin review queue one by one.
// Everything is validated on the server again; the browser only chooses what to send.

async function readInput(formData: FormData) {
  const seasonId = String(formData.get('seasonId') ?? '');
  const leagueId = String(formData.get('leagueId') ?? '');
  const weekNumber = Number(formData.get('week'));
  if (!UUID_RE.test(seasonId) || !UUID_RE.test(leagueId)) return { error: 'Sezon ve lig seçmelisiniz.' as const };
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 200) return { error: 'Hafta seçmelisiniz.' as const };
  const file = formData.get('file');
  if (!file || typeof file === 'string') return { error: 'JSON dosyası seçilmedi.' as const };
  const text = file.size > MAX_MATCH_FILE_BYTES ? 'x'.repeat(MAX_MATCH_FILE_BYTES + 1) : await file.text();
  const acceptedOutOfWindow = formData.getAll('oow').map(String).filter((v) => /^[1-9][0-9]{0,23}$/.test(v));
  let acceptedLinks: LinkDecision[] = [];
  try {
    const raw = JSON.parse(String(formData.get('links') ?? '[]'));
    if (Array.isArray(raw) && raw.length <= 2000) {
      acceptedLinks = raw.filter(
        (l): l is LinkDecision => !!l && /^[1-9][0-9]{0,23}$/.test(String(l.eaMatchId)) && typeof l.eaPlayerId === 'string' && l.eaPlayerId.length > 0 && l.eaPlayerId.length <= 24 && UUID_RE.test(String(l.profileId))
      );
    }
  } catch {
    return { error: 'Oyuncu bağlantı kararları geçersiz; dosyayı yeniden doğrulayın.' as const };
  }
  return { seasonId, leagueId, weekNumber, files: [{ name: file.name, text }], acceptedOutOfWindow, acceptedLinks };
}

/** Read-only: validates the file, checks it against the selected season/league/week and live fixtures, and reports each match's state. */
export async function previewJsonMatchesAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return { error: auth.error };
  const input = await readInput(formData);
  if ('error' in input) return { error: input.error };
  const preview = await previewMatchImport(supabase, input);
  return { preview, records: await loadRecordSummaries(supabase, preview) };
}

type Supa = ReturnType<typeof createClient>;

/**
 * Stored state of the file's matches that were already sent (score and profile links may have been edited after sending),
 * so the compact cards show the record, not the file. Read-only.
 */
async function loadRecordSummaries(supabase: Supa, preview: Awaited<ReturnType<typeof previewMatchImport>>) {
  const ids = preview.plans.flatMap((pl) => pl.matches.map((m) => m.recordId)).filter((id): id is string => !!id);
  const records: Record<string, { status: string; homeScore: number | null; awayScore: number | null; players: number; linked: number }> = {};
  if (!ids.length) return records;
  const [{ data: matches }, { data: stats }] = await Promise.all([
    supabase.from('matches').select('id, status, home_score, away_score').in('id', ids),
    supabase.from('match_player_stats').select('match_id, player_id').in('match_id', ids).limit(5000),
  ]);
  for (const m of matches ?? []) records[m.id] = { status: m.status, homeScore: m.home_score, awayScore: m.away_score, players: 0, linked: 0 };
  for (const st of stats ?? []) {
    const r = records[st.match_id];
    if (!r) continue;
    r.players += 1;
    if (st.player_id) r.linked += 1;
  }
  return records;
}

/**
 * Review panel of a match that is already stored (sent to review / reviewed). Read-only; edits go through the existing
 * admin actions (assignReviewMatchPlayerAction, updatePlayerStatsAction, updateMatchScoreAction) with their own checks.
 * The raw EA player id is not returned: it is only used on the server for matching.
 */
export async function getReviewMatchAction(matchId: string) {
  const supabase = createClient(await cookies());
  if (!UUID_RE.test(String(matchId))) return { error: 'Geçersiz maç kimliği.' };
  return loadReviewMatchWithRosters(supabase, matchId);
}

/**
 * Assigns a stored match_player_stats row to a registered TETA player profile after strictly verifying on the server
 * that the profile is an active member of that side's team in the match's season and not duplicated in the same match.
 */
export async function assignReviewMatchPlayerAction(statsId: string, profileId: string) {
  const supabase = createClient(await cookies());
  if (!UUID_RE.test(String(statsId)) || !UUID_RE.test(String(profileId))) {
    return { error: 'Geçersiz kayıt veya oyuncu profili kimliği.' };
  }
  const check = await validateReviewRosterAssignment(supabase, { statsId, profileId });
  if (!check.ok) return { error: check.error };

  const res = await assignPlayerStatsProfileAction(statsId, profileId, 'EA JSON inceleme ekranı — takım kadrosundan eşleştirme');
  if ('error' in res && res.error) return { error: res.error };

  revalidatePath('/admin/matches/ea-import');
  return {
    success: true as const,
    profile: {
      id: check.profile.id,
      username: check.profile.username,
      fullName: check.profile.full_name ?? null,
    },
  };
}

/** Sends ONE draft match to the admin review queue (PENDING_REVIEW) through the atomic RPC. Never approves. */
export async function sendMatchToReviewAction(formData: FormData) {
  const supabase = createClient(await cookies());
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return { error: auth.error };
  const input = await readInput(formData);
  if ('error' in input) return { error: input.error };
  const eaMatchId = String(formData.get('eaMatchId') ?? '');
  if (!/^[1-9][0-9]{0,23}$/.test(eaMatchId)) return { error: 'Geçersiz EA maç kimliği.' };
  const sendHash = String(formData.get('sendHash') ?? '');
  if (!sendHash) return { error: 'Önizleme bilgisi eksik; dosyayı yeniden doğrulayın.' };

  const result = await applyMatchImport(supabase, {
    ...input,
    onlyEaMatchId: eaMatchId,
    expectedHashes: { [input.files[0].name]: sendHash },
  });
  if (!result.ok) return { error: result.error };

  await logAdminAudit({
    action: 'SEND_JSON_MATCH_TO_REVIEW',
    entity_type: 'matches',
    entity_id: input.leagueId,
    entity_label: `EA Maç #${eaMatchId} (PENDING_REVIEW)`,
    description: `JSON dosyasından EA maçı #${eaMatchId} onay kuyruğuna gönderildi.`,
    new_data: { file: input.files[0].name, eaMatchId },
    actor_id: auth.userId,
  });
  revalidatePath('/admin/matches');
  revalidatePath('/admin/matches/ea-import');
  return { success: true as const };
}
