
'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { slugify } from '@/app/lig/utils';
import { logAdminAudit } from '@/lib/audit';

async function checkAdmin(supabase: any, user: any) {
  if (!user) return false;
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function reviewMatchAction(matchId: string, status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW' | 'CANCELLED') {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  // Fetch current match to guard against re-approval and collect route info for revalidation
  const { data: existingMatch } = await supabase
    .from('matches')
    .select('id, status, season_id, league_id, seasons(slug), leagues(name)')
    .eq('id', matchId)
    .single();

  if (!existingMatch) return { error: 'Maç bulunamadı.' };

  // 2. Re-Approve Protection: Guard against re-approving an already approved match
  if (existingMatch.status === 'APPROVED' && status === 'APPROVED') {
    return { error: 'Bu maç zaten onaylanmış.' };
  }

  const { error } = await supabase.from('matches').update({
    status,
    approved_by: status === 'APPROVED' ? user.id : null,
    approved_at: status === 'APPROVED' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  }).eq('id', matchId);

  if (error) return { error: error.message };

  await logAdminAudit({
    action: status === 'APPROVED' ? 'APPROVE_MATCH' : `REVIEW_MATCH_${status}`,
    entity_type: 'matches',
    entity_id: matchId,
    entity_label: `Maç #${matchId.substring(0, 8)}`,
    old_data: { status: existingMatch.status },
    new_data: { status },
    description: `Maç (#${matchId.substring(0, 8)}) durumu "${existingMatch.status}" -> "${status}" olarak güncellendi.`,
    actor_id: user.id
  });

  // 3. Cache Invalidation: Revalidate necessary public paths and admin paths
  revalidatePath('/admin/matches');

  if (status === 'APPROVED' || existingMatch.status === 'APPROVED') {
    revalidatePath('/');
    revalidatePath('/ligler');
    revalidatePath('/oyuncular');
    revalidatePath(`/mac/${matchId}`);

    const seasonSlug = (existingMatch.seasons as any)?.slug;
    const leagueName = (existingMatch.leagues as any)?.name;
    if (seasonSlug && leagueName) {
      const leagueSlug = slugify(leagueName);
      revalidatePath(`/lig/${seasonSlug}/${leagueSlug}`);
      revalidatePath(`/lig/${seasonSlug}/${leagueSlug}/istatistikler`);
      revalidatePath(`/lig/${seasonSlug}/${leagueSlug}/fikstur`);
    }
  }

  return { success: 'Maç durumu güncellendi.' };
}

export async function deleteMatchAction(matchId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  // First delete player stats if any exist to respect FK (no cascade)
  const { error: statsError } = await supabase.from('match_player_stats').delete().eq('match_id', matchId);
  if (statsError) return { error: 'İlişkili oyuncu istatistikleri silinemedi: ' + statsError.message };

  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  if (error) return { error: 'Maç silinemedi: ' + error.message };

  await logAdminAudit({
    action: 'DELETE_MATCH',
    entity_type: 'matches',
    entity_id: matchId,
    entity_label: `Maç #${matchId.substring(0, 8)}`,
    description: `Maç (#${matchId.substring(0, 8)}) ve ilişkili istatistikleri silindi.`,
    actor_id: user.id
  });

  revalidatePath('/admin/matches');
  return { success: 'Maç başarıyla silindi.' };
}


export async function updateMatchScoreAction(matchId: string, home_score: number, away_score: number) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('matches').update({
    home_score,
    away_score,
    updated_at: new Date().toISOString()
  }).eq('id', matchId);

  if (error) return { error: 'Skor güncellenemedi: ' + error.message };

  await logAdminAudit({
    action: 'UPDATE_MATCH_SCORE',
    entity_type: 'matches',
    entity_id: matchId,
    entity_label: `Maç #${matchId.substring(0, 8)}`,
    new_data: { home_score, away_score },
    description: `Maç (#${matchId.substring(0, 8)}) skoru ${home_score} - ${away_score} olarak güncellendi.`,
    actor_id: user.id
  });

  revalidatePath('/admin/matches');
  return { success: 'Skor başarıyla güncellendi.' };
}

export async function assignPlayerStatsProfileAction(
  statsId: string,
  playerId: string | null,
  reason?: string
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  // 1. Fetch current player stats and associated match details
  const { data: stat, error: statErr } = await supabase
    .from('match_player_stats')
    .select('id, match_id, player_id, team_id, ea_player_id, ea_player_name, extra_stats, matches(id, season_id, status)')
    .eq('id', statsId)
    .maybeSingle();

  if (statErr || !stat) return { error: 'İlgili oyuncu istatistik kaydı bulunamadı.' };

  const seasonId = (stat.matches as any)?.season_id;
  const matchId = stat.match_id;
  const oldPlayerId = stat.player_id;

  let profile: any = null;
  let membership: any = null;
  let roster_status: string = 'UNMATCHED';
  let roster_warning: string | null = null;
  let registered_team_id: string | null = null;
  let registered_team_name: string | null = null;

  // 2. Validate target profile if assigning
  if (playerId) {
    const { data: targetProfile, error: profErr } = await supabase
      .from('profiles')
      .select('id, username, full_name, current_ea_player_id')
      .eq('id', playerId)
      .maybeSingle();

    if (profErr || !targetProfile) {
      return { error: 'Geçersiz profil: Seçilen oyuncu profili sistemde bulunamadı.' };
    }
    profile = targetProfile;

    // Check unique player constraint in the same match
    const { data: duplicateInMatch } = await supabase
      .from('match_player_stats')
      .select('id, ea_player_name')
      .eq('match_id', matchId)
      .eq('player_id', playerId)
      .neq('id', statsId)
      .maybeSingle();

    if (duplicateInMatch) {
      return {
        error: `Bu profil (${profile.username}) bu maçta zaten başka bir oyuncuya (${duplicateInMatch.ea_player_name || 'başka oyuncu'}) atanmış.`
      };
    }

    // Check active team membership for the match season
    if (seasonId) {
      const { data: activeMembership } = await supabase
        .from('team_memberships')
        .select('id, team_id, left_at, teams:team_id(id, name)')
        .eq('season_id', seasonId)
        .eq('player_id', playerId)
        .is('left_at', null)
        .maybeSingle();

      membership = activeMembership;
      if (activeMembership) {
        registered_team_id = activeMembership.team_id;
        registered_team_name = (activeMembership.teams as any)?.name || 'Bilinmeyen Takım';
        if (activeMembership.team_id === stat.team_id) {
          roster_status = 'VALID';
          roster_warning = null;
        } else {
          roster_status = 'ROSTER_MISMATCH';
          roster_warning = `Kadro uyuşmazlığı: Oyuncu "${registered_team_name}" kadrosunda lisanslı`;
        }
      } else {
        roster_status = 'UNLICENSED';
        roster_warning = 'Lisanssız oyuncu: Bu sezonda aktif takım lisansı bulunmuyor';
      }
    }
  } else {
    // Admin chose to unlink/leave unassigned
    roster_status = 'UNMATCHED';
    roster_warning = 'PROFİL EŞLEŞMEDİ: Admin tarafından profil bağlantısı kaldırıldı';
  }

  // 3. Update match_player_stats with new profile and extra_stats
  const existingExtra = (typeof stat.extra_stats === 'object' && stat.extra_stats !== null)
    ? stat.extra_stats
    : {};

  const updatedExtraStats = {
    ...existingExtra,
    roster_status,
    roster_warning,
    registered_team_id,
    registered_team_name,
    manually_assigned_by: user.id,
    manually_assigned_at: new Date().toISOString(),
    assignment_reason: reason || null
  };

  const { error: updateErr } = await supabase
    .from('match_player_stats')
    .update({
      player_id: playerId,
      extra_stats: updatedExtraStats,
      updated_at: new Date().toISOString()
    })
    .eq('id', statsId);

  if (updateErr) {
    return { error: 'Oyuncu profili güncellenemedi: ' + updateErr.message };
  }

  // 4. Record Audit Log
  const playerLabel = stat.ea_player_name || stat.ea_player_id || 'Bilinmeyen Oyuncu';
  await logAdminAudit({
    action: playerId ? 'ASSIGN_MATCH_PLAYER' : 'UNLINK_MATCH_PLAYER',
    entity_type: 'match_player_stats',
    entity_id: statsId,
    entity_label: `Maç İstatistiği #${statsId.substring(0, 8)} (${playerLabel})`,
    old_data: { player_id: oldPlayerId },
    new_data: {
      player_id: playerId,
      username: profile?.username || null,
      roster_status,
      reason: reason || null
    },
    description: playerId
      ? `Maç istatistiğinde "${playerLabel}" adlı oyuncu "${profile.username}" profiline manuel bağlandı. (Kadro Durumu: ${roster_status})`
      : `Maç istatistiğinde "${playerLabel}" adlı oyuncunun profil bağlantısı kaldırıldı.`,
    actor_id: user.id
  });

  // 5. Invalidate caches
  revalidatePath('/admin/matches');
  if ((stat.matches as any)?.status === 'APPROVED') {
    revalidatePath(`/mac/${matchId}`);
    revalidatePath('/istatistikler');
  }

  return {
    success: playerId
      ? `Oyuncu başarıyla "${profile.username}" profiline bağlandı (${roster_status}).`
      : 'Oyuncu profil bağlantısı kaldırıldı.'
  };
}

export async function getTeamRosterCandidatesAction(teamId: string, seasonId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  const { data: memberships, error } = await supabase
    .from('team_memberships')
    .select('player_id, profiles:player_id(id, username, full_name, current_ea_player_id)')
    .eq('team_id', teamId)
    .eq('season_id', seasonId)
    .is('left_at', null);

  if (error) return { error: error.message };

  const candidates = (memberships || [])
    .map((m: any) => m.profiles)
    .filter(Boolean);

  return { data: candidates };
}

export async function searchProfilesAction(query: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };
  if (!query || query.trim().length < 2) return { data: [] };

  const cleanQuery = query.trim();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, current_ea_player_id')
    .or(`username.ilike.%${cleanQuery}%,full_name.ilike.%${cleanQuery}%,current_ea_player_id.ilike.%${cleanQuery}%`)
    .limit(20);

  if (error) return { error: error.message };
  return { data: data || [] };
}
