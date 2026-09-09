'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// ──────────────────────────────────────────────────
// Auth helper — same pattern used across admin actions
// ──────────────────────────────────────────────────
async function checkAdmin(supabase: any, user: any) {
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();
  return !!roleData;
}

// ──────────────────────────────────────────────────
// Escalation business rules
// ──────────────────────────────────────────────────
// active_count = 0 → 1st violation → WARNING (0 pts)
// active_count = 1 → 2nd violation → POINTS_DEDUCTION (3 pts)
// active_count = 2 → 3rd violation → POINTS_DEDUCTION (6 pts)
// active_count = 3 → 4th violation → POINTS_DEDUCTION (9 pts)
// active_count >= 4 → 5th+ violation → EXPULSION (0 pts, removed from race)

interface EscalationResult {
  penalty_type: 'WARNING' | 'POINTS_DEDUCTION' | 'EXPULSION';
  points_deducted: number;
  violation_order: number;
}

function computeEscalation(activeCount: number): EscalationResult {
  const violation_order = activeCount + 1;

  if (activeCount === 0) {
    return { penalty_type: 'WARNING', points_deducted: 0, violation_order };
  }
  if (activeCount === 1) {
    return { penalty_type: 'POINTS_DEDUCTION', points_deducted: 3, violation_order };
  }
  if (activeCount === 2) {
    return { penalty_type: 'POINTS_DEDUCTION', points_deducted: 6, violation_order };
  }
  if (activeCount === 3) {
    return { penalty_type: 'POINTS_DEDUCTION', points_deducted: 9, violation_order };
  }
  // 4+ → EXPULSION
  return { penalty_type: 'EXPULSION', points_deducted: 0, violation_order };
}

// UUID format validator
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ──────────────────────────────────────────────────
// issuePenaltyAction
// ──────────────────────────────────────────────────
export async function issuePenaltyAction(formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 1. Auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz erişim. Lütfen giriş yapın.' };

    const isAdmin = await checkAdmin(supabase, user);
    if (!isAdmin) return { error: 'Bu işlemi yapmaya yetkiniz yok. Yalnızca adminler ceza verebilir.' };

    // 2. Extract & validate form fields
    const teamId = formData.get('team_id') as string;
    const leagueId = formData.get('league_id') as string;
    const seasonId = formData.get('season_id') as string;
    const matchId = (formData.get('match_id') as string)?.trim() || null;
    const targetUserId = (formData.get('target_user_id') as string)?.trim() || null;
    const reason = (formData.get('reason') as string)?.trim() || '';

    // 3. UUID validations
    if (!teamId || !UUID_RE.test(teamId)) {
      return { error: 'Geçersiz takım kimliği.' };
    }
    if (!leagueId || !UUID_RE.test(leagueId)) {
      return { error: 'Geçersiz lig kimliği.' };
    }
    if (!seasonId || !UUID_RE.test(seasonId)) {
      return { error: 'Geçersiz sezon kimliği.' };
    }
    if (matchId && !UUID_RE.test(matchId)) {
      return { error: 'Geçersiz maç kimliği.' };
    }
    if (targetUserId && !UUID_RE.test(targetUserId)) {
      return { error: 'Geçersiz hedef kullanıcı kimliği.' };
    }

    // 4. Reason validation
    if (!reason || reason.length < 5) {
      return { error: 'Ceza gerekçesi en az 5 karakter olmalıdır.' };
    }
    if (reason.length > 1000) {
      return { error: 'Ceza gerekçesi en fazla 1000 karakter olabilir.' };
    }

    // 5. Verify team is registered in this league+season
    const { data: leagueTeam, error: ltErr } = await supabase
      .from('league_teams')
      .select('id, team_id, league_id, season_id')
      .eq('league_id', leagueId)
      .eq('season_id', seasonId)
      .eq('team_id', teamId)
      .eq('is_active', true)
      .maybeSingle();

    if (ltErr || !leagueTeam) {
      return { error: 'Bu takım belirtilen lig ve sezonda kayıtlı değil.' };
    }

    // 6. If targetUserId provided, verify they are the active captain of this team
    if (targetUserId) {
      const { data: captainRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('team_id', teamId)
        .eq('role', 'CAPTAIN')
        .eq('is_active', true)
        .maybeSingle();

      if (!captainRole) {
        return { error: 'Belirtilen kullanıcı bu takımın aktif kaptanı değil.' };
      }
    }

    // 7. If matchId provided, verify match belongs to the same team + league + season
    if (matchId) {
      const { data: match } = await supabase
        .from('matches')
        .select('id, league_id, season_id, home_team_id, away_team_id')
        .eq('id', matchId)
        .maybeSingle();

      if (!match) {
        return { error: 'Belirtilen maç bulunamadı.' };
      }
      if (match.league_id !== leagueId || match.season_id !== seasonId) {
        return { error: 'Maç, belirtilen lig ve sezon bağlamında değil.' };
      }
      if (match.home_team_id !== teamId && match.away_team_id !== teamId) {
        return { error: 'Maç, belirtilen takıma ait değil.' };
      }
    }

    // 8. Count active (non-revoked) penalties for this team+season
    const { count: activeCount, error: countErr } = await supabase
      .from('team_penalties')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .eq('is_revoked', false);

    if (countErr) {
      return { error: `Aktif ceza sayısı alınamadı: ${countErr.message}` };
    }

    // 9. Compute escalation (server-side — NEVER trust client)
    const escalation = computeEscalation(activeCount ?? 0);

    // 10. Check if team is already expelled
    if (activeCount !== null && activeCount >= 4) {
      // Check if there's already an active EXPULSION
      const { data: existingExpulsion } = await supabase
        .from('team_penalties')
        .select('id')
        .eq('team_id', teamId)
        .eq('season_id', seasonId)
        .eq('penalty_type', 'EXPULSION')
        .eq('is_revoked', false)
        .maybeSingle();

      if (existingExpulsion) {
        return { error: 'Bu takım zaten ihraç edilmiş durumda. Yeni ceza verilemez.' };
      }
    }

    // 11. Insert penalty — the partial unique index on (team_id, season_id, violation_order) WHERE is_revoked = false
    //     serves as a concurrency safety net against duplicate violation_order insertions
    const { error: insertErr } = await supabase
      .from('team_penalties')
      .insert({
        team_id: teamId,
        league_id: leagueId,
        season_id: seasonId,
        penalty_type: escalation.penalty_type,
        points_deducted: escalation.points_deducted,
        violation_order: escalation.violation_order,
        reason,
        match_id: matchId,
        target_user_id: targetUserId,
        issued_by: user.id,
      });

    if (insertErr) {
      // Handle unique constraint violation (race condition)
      if (insertErr.code === '23505') {
        return { error: 'Bu ihlal sırası zaten mevcut. Başka bir yönetici aynı anda ceza vermiş olabilir. Lütfen sayfayı yenileyip tekrar deneyin.' };
      }
      console.error('issuePenaltyAction insert error:', insertErr);
      return { error: `Ceza oluşturulamadı: ${insertErr.message}` };
    }

    // 12. Revalidate
    revalidatePath('/admin/penalties');
    revalidatePath('/lig');
    revalidatePath('/takim/yonet');

    const typeLabels: Record<string, string> = {
      WARNING: 'UYARI',
      POINTS_DEDUCTION: `PUAN CEZASI (${escalation.points_deducted} puan)`,
      EXPULSION: 'İHRAÇ',
    };

    return {
      success: `Ceza başarıyla verildi: ${typeLabels[escalation.penalty_type]} — İhlal #${escalation.violation_order}`,
    };
  } catch (err: any) {
    console.error('issuePenaltyAction unexpected error:', err);
    return { error: err.message || 'Beklenmeyen bir hata oluştu.' };
  }
}

// ──────────────────────────────────────────────────
// revokePenaltyAction — soft revoke (no DELETE)
// ──────────────────────────────────────────────────
export async function revokePenaltyAction(formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 1. Auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz erişim. Lütfen giriş yapın.' };

    const isAdmin = await checkAdmin(supabase, user);
    if (!isAdmin) return { error: 'Bu işlemi yapmaya yetkiniz yok. Yalnızca adminler ceza iptal edebilir.' };

    // 2. Extract fields
    const penaltyId = formData.get('penalty_id') as string;
    const revocationReason = (formData.get('revocation_reason') as string)?.trim() || '';

    // 3. Validate
    if (!penaltyId || !UUID_RE.test(penaltyId)) {
      return { error: 'Geçersiz ceza kimliği.' };
    }
    if (!revocationReason || revocationReason.length < 5) {
      return { error: 'İptal gerekçesi en az 5 karakter olmalıdır.' };
    }
    if (revocationReason.length > 1000) {
      return { error: 'İptal gerekçesi en fazla 1000 karakter olabilir.' };
    }

    // 4. Fetch penalty
    const { data: penalty, error: fetchErr } = await supabase
      .from('team_penalties')
      .select('id, is_revoked')
      .eq('id', penaltyId)
      .maybeSingle();

    if (fetchErr || !penalty) {
      return { error: 'Ceza kaydı bulunamadı.' };
    }

    // 5. Already revoked check
    if (penalty.is_revoked) {
      return { error: 'Bu ceza zaten iptal edilmiş.' };
    }

    // 6. Soft revoke
    const { error: updateErr } = await supabase
      .from('team_penalties')
      .update({
        is_revoked: true,
        revoked_by: user.id,
        revoked_at: new Date().toISOString(),
        revocation_reason: revocationReason,
      })
      .eq('id', penaltyId);

    if (updateErr) {
      console.error('revokePenaltyAction update error:', updateErr);
      return { error: `Ceza iptal edilemedi: ${updateErr.message}` };
    }

    // 7. Revalidate
    revalidatePath('/admin/penalties');
    revalidatePath('/lig');
    revalidatePath('/takim/yonet');

    return { success: 'Ceza başarıyla iptal edildi.' };
  } catch (err: any) {
    console.error('revokePenaltyAction unexpected error:', err);
    return { error: err.message || 'Beklenmeyen bir hata oluştu.' };
  }
}

// ──────────────────────────────────────────────────
// getEscalationPreview — client-facing preview helper
// ──────────────────────────────────────────────────
export async function getEscalationPreview(teamId: string, seasonId: string) {
  try {
    if (!teamId || !UUID_RE.test(teamId) || !seasonId || !UUID_RE.test(seasonId)) {
      return { error: 'Geçersiz parametre.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz.' };

    const isAdmin = await checkAdmin(supabase, user);
    if (!isAdmin) return { error: 'Yetkisiz.' };

    const { count, error } = await supabase
      .from('team_penalties')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .eq('is_revoked', false);

    if (error) return { error: error.message };

    const escalation = computeEscalation(count ?? 0);
    return {
      activeCount: count ?? 0,
      next: escalation,
    };
  } catch (err: any) {
    return { error: err.message || 'Hata.' };
  }
}
