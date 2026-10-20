
'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath, revalidateTag } from 'next/cache';
import { slugify } from '@/app/lig/utils';
import { logAdminAudit } from '@/lib/audit';
import { buildProfilesOrFilter } from '@/lib/ea/roster-validator';
import { attachTeamNames, getScopeNames } from '@/lib/admin-scope';

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
    .select('id, status, season_id, league_id, home_team_id, away_team_id')
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
  await revalidateMatchDependencies(supabase, matchId, existingMatch);

  return { success: 'Maç durumu güncellendi.' };
}

export async function revalidateMatchDependencies(supabase: any, matchId: string, matchData?: any, extraPlayerUsernames?: string[]) {
  revalidatePath('/admin/matches');
  revalidatePath('/admin/players');
  revalidatePath('/');
  revalidatePath('/ligler');
  revalidatePath('/oyuncular');
  revalidatePath('/istatistikler');
  revalidatePath(`/mac/${matchId}`);
  try {
    revalidateTag('player-rankings', 'max');
    revalidateTag('public-statistics', 'max');
    revalidateTag('public-team-page', 'max');
  } catch {}

  let match = matchData;
  if (!match) {
    const { data } = await supabase
      .from('matches')
      .select('id, status, season_id, league_id, home_team_id, away_team_id')
      .eq('id', matchId)
      .maybeSingle();
    match = data;
  }
  if (!match) return;

  const { seasonSlug, leagueName } = await getScopeNames(supabase, match);
  if (seasonSlug && leagueName) {
    const leagueSlug = slugify(leagueName);
    revalidatePath(`/lig/${seasonSlug}/${leagueSlug}`);
    revalidatePath(`/lig/${seasonSlug}/${leagueSlug}/istatistikler`);
    revalidatePath(`/lig/${seasonSlug}/${leagueSlug}/fikstur`);
  }

  // Takım profillerini revalidate et
  const teamIds = [match.home_team_id, match.away_team_id].filter(Boolean);
  if (teamIds.length > 0) {
    const { data: matchTeams } = await supabase
      .from('teams')
      .select('slug')
      .in('id', teamIds);
    for (const tm of matchTeams || []) {
      if (tm.slug) {
        revalidatePath(`/takim/${tm.slug}`);
        try {
          revalidateTag(`team-${tm.slug}`, 'max');
        } catch {}
      }
    }
  }

  // Maçta oynayan ve eşleşmiş oyuncuların profillerini revalidate et
  const { data: matchPlayerRows } = await supabase
    .from('match_player_stats')
    .select('profiles!match_player_stats_player_id_fkey(username)')
    .eq('match_id', matchId)
    .not('player_id', 'is', null);

  if (matchPlayerRows) {
    for (const row of matchPlayerRows) {
      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (prof?.username) {
        revalidatePath(`/oyuncular/${encodeURIComponent(prof.username)}`);
      }
    }
  }

  if (extraPlayerUsernames && extraPlayerUsernames.length > 0) {
    for (const uname of extraPlayerUsernames) {
      if (uname) {
        revalidatePath(`/oyuncular/${encodeURIComponent(uname)}`);
      }
    }
  }
}

export async function deleteMatchAction(matchId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };
  if (!matchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchId)) {
    return { error: 'Geçersiz maç kimliği.' };
  }

  // Fetch match details to know if public caches need revalidation
  const { data: existingMatch } = await supabase
    .from('matches')
    .select('id, status, season_id, league_id, home_team_id, away_team_id')
    .eq('id', matchId)
    .maybeSingle();

  if (!existingMatch) return { error: 'Maç bulunamadı.' };

  // Collect player usernames before deleting stats to ensure profile pages can be revalidated
  let preDeletePlayerUsernames: string[] = [];
  if (existingMatch.status === 'APPROVED') {
    const { data: matchPlayerRows } = await supabase
      .from('match_player_stats')
      .select('profiles!match_player_stats_player_id_fkey(username)')
      .eq('match_id', matchId)
      .not('player_id', 'is', null);

    if (matchPlayerRows) {
      for (const row of matchPlayerRows) {
        const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        if (prof?.username) {
          preDeletePlayerUsernames.push(prof.username);
        }
      }
    }
  }

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
    old_data: { status: existingMatch.status },
    description: `Maç (#${matchId.substring(0, 8)}) ve ilişkili istatistikleri silindi.`,
    actor_id: user.id
  });

  if (existingMatch.status === 'APPROVED') {
    await revalidateMatchDependencies(supabase, matchId, existingMatch, preDeletePlayerUsernames);
  } else {
    revalidatePath('/admin/matches');
  }

  return { success: 'Maç başarıyla silindi.' };
}


export async function updateMatchScoreAction(matchId: string, home_score: number, away_score: number) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  if (!matchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchId)) {
    return { error: 'Geçersiz maç kimliği.' };
  }

  if (
    typeof home_score !== 'number' ||
    typeof away_score !== 'number' ||
    !Number.isInteger(home_score) ||
    !Number.isInteger(away_score) ||
    home_score < 0 ||
    away_score < 0
  ) {
    return { error: 'Geçersiz skor: Skorlar negatif olamaz ve tam sayı olmalıdır.' };
  }

  // Fetch match details to inspect current state
  const { data: existingMatch } = await supabase
    .from('matches')
    .select('id, status, season_id, league_id, home_team_id, away_team_id, home_score, away_score')
    .eq('id', matchId)
    .maybeSingle();

  if (!existingMatch) return { error: 'Maç bulunamadı.' };

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
    old_data: { home_score: existingMatch.home_score, away_score: existingMatch.away_score },
    new_data: { home_score, away_score },
    description: `Maç (#${matchId.substring(0, 8)}) skoru ${home_score} - ${away_score} olarak güncellendi.`,
    actor_id: user.id
  });

  if (existingMatch.status === 'APPROVED') {
    await revalidateMatchDependencies(supabase, matchId, existingMatch);
  } else {
    revalidatePath('/admin/matches');
  }

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

  if (!statsId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(statsId)) {
    return { error: 'Geçersiz istatistik kaydı kimliği.' };
  }

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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerId)) {
      return { error: 'Geçersiz profil kimliği.' };
    }

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
      const { data: rawMembership } = await supabase
        .from('team_memberships')
        .select('id, team_id, left_at')
        .eq('season_id', seasonId)
        .eq('player_id', playerId)
        .is('left_at', null)
        .maybeSingle();
      // team_memberships has no direct relationship to teams (composite key via league_teams): look the name up explicitly
      const activeMembership = rawMembership ? (await attachTeamNames(supabase, [rawMembership]))[0] : null;

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
  if (profile?.username) {
    revalidatePath(`/oyuncular/${encodeURIComponent(profile.username)}`);
  }
  if (oldPlayerId && oldPlayerId !== playerId) {
    const { data: oldProf } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', oldPlayerId)
      .maybeSingle();
    if (oldProf?.username) {
      revalidatePath(`/oyuncular/${encodeURIComponent(oldProf.username)}`);
    }
  }

  if ((stat.matches as any)?.status === 'APPROVED') {
    revalidatePath(`/mac/${matchId}`);
    revalidatePath('/istatistikler');
    revalidatePath('/oyuncular');
    try {
      revalidateTag('player-rankings', 'max');
      revalidateTag('public-statistics', 'max');
      revalidateTag('public-team-page', 'max');
    } catch {}
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
  if (!teamId || !seasonId) return { data: [] };

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

  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  // SSOT: Use shared builder that sanitizes query, neutralizes filter injection/wildcards,
  // and short-circuits with null if query is empty or <2 chars (preventing any DB query)
  const orFilter = buildProfilesOrFilter(query);
  if (!orFilter) return { data: [] };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, current_ea_player_id')
    .or(orFilter)
    .limit(20);

  if (error) return { error: error.message };
  return { data: data || [] };
}

const STAT_INT_FIELDS = ['goals', 'assists', 'shots', 'passes_made', 'pass_attempts', 'tackles_made', 'tackle_attempts', 'saves', 'goals_conceded', 'cleansheets_gk', 'cleansheets_def', 'red_cards'] as const;

/**
 * Edits one player's stats row of a match that is still in review (PENDING_REVIEW / REJECTED).
 * Approved matches are not editable here: their season stats are already calculated, so the approval must be reverted first.
 */
export async function updatePlayerStatsAction(statsId: string, fields: Record<string, unknown>) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };
  if (!statsId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(statsId)) {
    return { error: 'Geçersiz istatistik kaydı kimliği.' };
  }

  const update: Record<string, number | boolean | null> = {};
  for (const key of STAT_INT_FIELDS) {
    const v = fields[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1000) {
      return { error: `Geçersiz değer: ${key} 0-1000 arası tam sayı olmalı.` };
    }
    update[key] = v;
  }
  const rating = fields.rating;
  if (rating !== null && (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 10)) {
    return { error: 'Geçersiz değer: rating boş veya 0-10 arası olmalı.' };
  }
  update.rating = rating === null ? null : Math.round(rating * 100) / 100;
  update.is_mom = fields.is_mom === true;

  const { data: stat } = await supabase
    .from('match_player_stats')
    .select('id, match_id, ea_player_name, ea_player_id, goals, assists, rating, matches(status)')
    .eq('id', statsId)
    .maybeSingle();
  if (!stat) return { error: 'İlgili oyuncu istatistik kaydı bulunamadı.' };
  const rel = (stat as unknown as { matches?: { status?: string } | { status?: string }[] | null }).matches;
  const matchStatus = (Array.isArray(rel) ? rel[0] : rel)?.status;

  const { error } = await supabase.from('match_player_stats').update({ ...update, updated_at: new Date().toISOString() }).eq('id', statsId);
  if (error) return { error: 'İstatistik güncellenemedi: ' + error.message };

  await logAdminAudit({
    action: 'UPDATE_PLAYER_STATS',
    entity_type: 'match_player_stats',
    entity_id: statsId,
    entity_label: stat.ea_player_name || stat.ea_player_id || 'Oyuncu',
    old_data: { goals: stat.goals, assists: stat.assists, rating: stat.rating },
    new_data: update,
    description: `Oyuncu istatistikleri düzenlendi (maç #${String(stat.match_id).substring(0, 8)}).`,
    actor_id: user.id,
  });

  if (matchStatus === 'APPROVED') {
    await revalidateMatchDependencies(supabase, stat.match_id);
  } else {
    revalidatePath('/admin/matches');
  }

  return { success: 'İstatistikler güncellendi.' };
}

export interface ApprovedMatchPlayerStatUpdate {
  id: string;
  goals?: number;
  assists?: number;
  rating?: number | null;
  shots?: number;
  passes_made?: number;
  pass_attempts?: number;
  tackles_made?: number;
  tackle_attempts?: number;
  saves?: number;
  goals_conceded?: number;
  cleansheets_gk?: number;
  cleansheets_def?: number;
  red_cards?: number;
  is_mom?: boolean;
}

export interface UpdateApprovedMatchPayload {
  home_score: number;
  away_score: number;
  player_stats?: ApprovedMatchPlayerStatUpdate[];
  allow_discrepancy?: boolean;
}

/**
 * Updates match score and player stats in an approved match (or match in review)
 * and automatically triggers season recalculation and revalidation of all public views.
 */
export async function updateApprovedMatchDetailsAction(
  matchId: string,
  payload: UpdateApprovedMatchPayload
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  if (!matchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchId)) {
    return { error: 'Geçersiz maç kimliği.' };
  }

  const { home_score, away_score, player_stats = [], allow_discrepancy = false } = payload;

  if (
    typeof home_score !== 'number' ||
    typeof away_score !== 'number' ||
    !Number.isInteger(home_score) ||
    !Number.isInteger(away_score) ||
    home_score < 0 ||
    away_score < 0 ||
    home_score > 99 ||
    away_score > 99
  ) {
    return { error: 'Geçersiz skor: Skorlar 0-99 arası tam sayı olmalıdır.' };
  }

  // 1. Fetch match and existing stats
  const { data: existingMatch, error: matchErr } = await supabase
    .from('matches')
    .select('id, status, season_id, league_id, home_team_id, away_team_id, home_score, away_score')
    .eq('id', matchId)
    .maybeSingle();

  if (matchErr || !existingMatch) return { error: 'Maç bulunamadı.' };

  const { data: existingStats, error: statsErr } = await supabase
    .from('match_player_stats')
    .select('*')
    .eq('match_id', matchId);

  if (statsErr) return { error: 'Mevcut oyuncu istatistikleri okunamadı: ' + statsErr.message };

  const statsById = new Map((existingStats || []).map((s: any) => [s.id, s]));

  // 2. Validate player_stats
  let homePlayerGoals = 0;
  let awayPlayerGoals = 0;

  for (const s of player_stats) {
    if (!s.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id)) {
      return { error: 'Geçersiz oyuncu istatistik kimliği.' };
    }
    const current = statsById.get(s.id);
    if (!current) {
      return { error: `İstatistik kaydı bu maça ait değil: ${s.id}` };
    }

    // Validate int fields
    for (const key of STAT_INT_FIELDS) {
      if (s[key] !== undefined) {
        const val = s[key];
        if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > 1000) {
          return { error: `Geçersiz değer: ${key} 0-1000 arası tam sayı olmalıdır.` };
        }
      }
    }

    // Validate rating
    if (s.rating !== undefined && s.rating !== null) {
      if (typeof s.rating !== 'number' || !Number.isFinite(s.rating) || s.rating < 0 || s.rating > 10) {
        return { error: 'Geçersiz reyting: Reyting 0 ile 10 arasında olmalıdır.' };
      }
    }

    const effectiveGoals = s.goals !== undefined ? s.goals : (current.goals || 0);
    if (current.team_id === existingMatch.home_team_id) {
      homePlayerGoals += effectiveGoals;
    } else if (current.team_id === existingMatch.away_team_id) {
      awayPlayerGoals += effectiveGoals;
    }
  }

  // Account for any stats rows not present in payload
  const updatedStatIds = new Set(player_stats.map(p => p.id));
  for (const [id, current] of statsById) {
    if (!updatedStatIds.has(id)) {
      const g = current.goals || 0;
      if (current.team_id === existingMatch.home_team_id) {
        homePlayerGoals += g;
      } else if (current.team_id === existingMatch.away_team_id) {
        awayPlayerGoals += g;
      }
    }
  }

  // 3. Discrepancy Check (if not explicitly allowed)
  if (!allow_discrepancy) {
    if (homePlayerGoals > home_score) {
      return {
        error: `Ev sahibi oyuncu golleri toplamı (${homePlayerGoals}), girilen maç skorunu (${home_score}) aşıyor. Lütfen skor veya gol sayılarını kontrol ediniz.`
      };
    }
    if (awayPlayerGoals > away_score) {
      return {
        error: `Deplasman oyuncu golleri toplamı (${awayPlayerGoals}), girilen maç skorunu (${away_score}) aşıyor. Lütfen skor veya gol sayılarını kontrol ediniz.`
      };
    }
  }

  // 4. Update Match Score if changed
  const scoreChanged = existingMatch.home_score !== home_score || existingMatch.away_score !== away_score;
  if (scoreChanged) {
    const { error: matchUpdateErr } = await supabase
      .from('matches')
      .update({
        home_score,
        away_score,
        updated_at: new Date().toISOString()
      })
      .eq('id', matchId);

    if (matchUpdateErr) return { error: 'Skor güncellenemedi: ' + matchUpdateErr.message };
  }

  // 5. Update Player Stats rows that changed
  const modifiedOldStats: any[] = [];
  const modifiedNewStats: any[] = [];

  for (const s of player_stats) {
    const current = statsById.get(s.id);
    if (!current) continue;

    const fieldsToUpdate: Record<string, any> = {};
    let hasChanges = false;

    for (const key of STAT_INT_FIELDS) {
      if (s[key] !== undefined && s[key] !== current[key]) {
        fieldsToUpdate[key] = s[key];
        hasChanges = true;
      }
    }

    if (s.rating !== undefined) {
      const normalizedRating = s.rating === null ? null : Math.round(s.rating * 100) / 100;
      if (normalizedRating !== current.rating) {
        fieldsToUpdate.rating = normalizedRating;
        hasChanges = true;
      }
    }

    if (s.is_mom !== undefined && s.is_mom !== !!current.is_mom) {
      fieldsToUpdate.is_mom = s.is_mom;
      hasChanges = true;
    }

    if (hasChanges) {
      fieldsToUpdate.updated_at = new Date().toISOString();
      const { error: statUpdateErr } = await supabase
        .from('match_player_stats')
        .update(fieldsToUpdate)
        .eq('id', s.id);

      if (statUpdateErr) {
        return { error: `Oyuncu istatistiği güncellenemedi (${current.ea_player_name || s.id}): ${statUpdateErr.message}` };
      }

      modifiedOldStats.push({ id: s.id, player_name: current.ea_player_name, ...current });
      modifiedNewStats.push({ id: s.id, player_name: current.ea_player_name, ...fieldsToUpdate });
    }
  }

  // 6. Audit Logging
  await logAdminAudit({
    action: 'UPDATE_APPROVED_MATCH',
    entity_type: 'matches',
    entity_id: matchId,
    entity_label: `Maç #${matchId.substring(0, 8)}`,
    old_data: {
      home_score: existingMatch.home_score,
      away_score: existingMatch.away_score,
      modified_count: modifiedOldStats.length,
      modified_stats: modifiedOldStats
    },
    new_data: {
      home_score,
      away_score,
      modified_count: modifiedNewStats.length,
      modified_stats: modifiedNewStats,
      discrepancy_allowed: allow_discrepancy
    },
    description: `Onaylanmış maç (#${matchId.substring(0, 8)}) düzenlendi: Skor ${existingMatch.home_score}-${existingMatch.away_score} -> ${home_score}-${away_score}, ${modifiedNewStats.length} oyuncu istatistiği güncellendi.`,
    actor_id: user.id
  });

  // 7. Invalidate Caches
  if (existingMatch.status === 'APPROVED') {
    await revalidateMatchDependencies(supabase, matchId, existingMatch);
  } else {
    revalidatePath('/admin/matches');
  }

  return { success: 'Maç ve oyuncu istatistikleri başarıyla güncellendi.' };
}

