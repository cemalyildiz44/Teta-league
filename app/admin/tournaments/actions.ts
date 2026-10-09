
'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logAdminAudit } from '@/lib/audit';
import {
  validateGroupStageCompleted,
  extractAdvancingTeams,
  generateCrossGroupPairings,
  buildFullKnockoutBracket,
} from '@/lib/tournament-engine';
import { parseToTurkeyISO } from '@/lib/date-utils';

async function checkAdmin(supabase: any, user: any) {
  if (!user) return false;
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}

export async function create1V1WinnerAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const name = formData.get('name') as string;
  const season_id = formData.get('season_id') as string;
  const profile_id = formData.get('profile_id') as string;
  const description = formData.get('description') as string;
  const image_file = formData.get('image_file') as File;

  if (!name || !season_id || !profile_id) return { error: 'Eksik bilgi.' };

  let image_url = null;
  if (image_file && image_file.size > 0) {
    if (image_file.size > 5 * 1024 * 1024) return { error: 'Görsel boyutu 5MB limitini aşıyor.' };
    const ext = image_file.name.split('.').pop() || 'png';
    const fileName = `tournament_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('tournaments').upload(fileName, image_file, { upsert: true });
    if (uploadError) return { error: 'Görsel yüklenemedi: ' + uploadError.message };
    const { data } = supabase.storage.from('tournaments').getPublicUrl(fileName);
    image_url = data.publicUrl;
  }

  // Insert Tournament
  const { data: tourData, error: tourError } = await supabase.from('tournaments').insert({
    season_id,
    name,
    type: '1V1',
    description: description || null,
    image_url
  }).select('id').single();

  if (tourError || !tourData) return { error: 'Turnuva oluşturulamadı: ' + tourError?.message };

  // Insert Winner
  const { error: winError } = await supabase.from('tournament_winners').insert({
    tournament_id: tourData.id,
    placement: 1,
    profile_id
  });

  if (winError) return { error: 'Kazanan eklenemedi: ' + winError.message };

  await logAdminAudit({
    action: 'CREATE_TOURNAMENT_1V1',
    entity_type: 'tournaments',
    entity_id: tourData.id,
    entity_label: name,
    new_data: { name, season_id, profile_id, type: '1V1' },
    description: `"${name}" 1V1 turnuvası ve kazananı eklendi.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  revalidatePath('/oyuncular/[username]', 'page');
  return { success: '1V1 şampiyonu başarıyla eklendi.' };
}

export async function createKarmaWinnerAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const name = formData.get('name') as string;
  const season_id = formData.get('season_id') as string;
  const profilesRaw = formData.get('profiles') as string;

  if (!name || !season_id || !profilesRaw) return { error: 'Eksik bilgi.' };
  
  let profiles = [];
  try {
    profiles = JSON.parse(profilesRaw);
  } catch (e) {
    return { error: 'Geçersiz oyuncu listesi.' };
  }

  if (profiles.length !== 11) return { error: 'Karma kazananı için tam olarak 11 oyuncu seçmelisiniz.' };

  const uniqueProfiles = new Set(profiles);
  if (uniqueProfiles.size !== 11) return { error: 'Aynı oyuncu birden fazla kez seçilemez.' };

  const { data: tourData, error: tourError } = await supabase.from('tournaments').insert({
    season_id,
    name,
    type: 'KARMA'
  }).select('id').single();

  if (tourError || !tourData) return { error: 'Turnuva oluşturulamadı: ' + tourError?.message };

  const winnersToInsert = profiles.map((pId: string, idx: number) => ({
    tournament_id: tourData.id,
    placement: idx + 1, // Using placement as squad_order to distinguish the 11 records safely
    profile_id: pId
  }));

  const { error: winError } = await supabase.from('tournament_winners').insert(winnersToInsert);

  if (winError) return { error: 'Kazananlar eklenemedi: ' + winError.message };

  await logAdminAudit({
    action: 'CREATE_TOURNAMENT_KARMA',
    entity_type: 'tournaments',
    entity_id: tourData.id,
    entity_label: name,
    new_data: { name, season_id, type: 'KARMA', winners_count: 11 },
    description: `"${name}" Karma turnuvası ve 11 kişilik kadrosu eklendi.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  revalidatePath('/oyuncular/[username]', 'page');
  return { success: 'Karma kazanan kadrosu başarıyla eklendi.' };
}

export async function createNightCupAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const name = formData.get('name') as string;
  const season_id = formData.get('season_id') as string;
  const max_teams = formData.get('max_teams') as string;
  const is_registration_open = formData.get('is_registration_open') === 'true';
  const registration_start = parseToTurkeyISO(formData.get('registration_start') as string);
  const registration_end = parseToTurkeyISO(formData.get('registration_end') as string);
  const tournament_date = parseToTurkeyISO(formData.get('tournament_date') as string);
  const description = formData.get('description') as string;
  const rules = formData.get('rules') as string;
  const details = formData.get('details') as string;
  const prize = formData.get('prize') as string;
  const teams_per_group = formData.get('teams_per_group') as string;
  const advancing_teams_per_group = formData.get('advancing_teams_per_group') as string;
  const status = formData.get('status') as string;
  const discord_url = formData.get('discord_url') as string;
  const image_file = formData.get('image_file') as File;

  if (!name || !name.trim() || !season_id) return { error: 'Turnuva adı ve sezon seçimi zorunludur.' };

  // Tarih sıralama kontrolü
  if (registration_start && registration_end) {
    const start = new Date(registration_start).getTime();
    const end = new Date(registration_end).getTime();
    if (!isNaN(start) && !isNaN(end) && end < start) {
      return { error: 'Başvuru bitiş tarihi, başlangıç tarihinden önce olamaz.' };
    }
  }

  let image_url = null;
  if (image_file && image_file.size > 0) {
    if (image_file.size > 5 * 1024 * 1024) return { error: 'Görsel boyutu 5MB limitini aşıyor.' };
    const ext = image_file.name.split('.').pop() || 'png';
    const fileName = `tournament_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('tournaments').upload(fileName, image_file, { upsert: true });
    if (uploadError) return { error: 'Görsel yüklenemedi: ' + uploadError.message };
    const { data } = supabase.storage.from('tournaments').getPublicUrl(fileName);
    image_url = data.publicUrl;
  }

  const parsedMaxTeams = max_teams && max_teams.trim() ? parseInt(max_teams, 10) : null;
  const parsedTeamsPerGroup = teams_per_group && teams_per_group.trim() ? parseInt(teams_per_group, 10) : 4;
  const parsedAdvancing = advancing_teams_per_group && advancing_teams_per_group.trim() ? parseInt(advancing_teams_per_group, 10) : 2;

  const fullPayload: Record<string, any> = {
    season_id,
    name: name.trim(),
    type: 'NIGHT_CUP',
    max_teams: parsedMaxTeams,
    is_registration_open,
    registration_start: registration_start || null,
    registration_end: registration_end || null,
    tournament_date: tournament_date || null,
    description: description ? description.trim() : null,
    rules: rules ? rules.trim() : null,
    details: details ? details.trim() : null,
    prize: prize ? prize.trim() : null,
    teams_per_group: parsedTeamsPerGroup,
    advancing_teams_per_group: parsedAdvancing,
    status: status || (is_registration_open ? 'REGISTRATION' : 'DRAFT'),
    discord_url: discord_url ? discord_url.trim() : null,
    image_url
  };

  let { data: newTour, error } = await supabase.from('tournaments').insert(fullPayload).select('id').single();

  if (error && error.message.toLowerCase().includes('column')) {
    // Graceful fallback to core columns if new Phase 1 columns are not yet migrated on remote DB
    const corePayload = {
      season_id,
      name: name.trim(),
      type: 'NIGHT_CUP',
      max_teams: parsedMaxTeams,
      is_registration_open,
      registration_start: registration_start || null,
      registration_end: registration_end || null,
      tournament_date: tournament_date || null,
      description: description ? description.trim() : null,
      image_url
    };
    const fb = await supabase.from('tournaments').insert(corePayload).select('id').single();
    newTour = fb.data;
    error = fb.error;
  }

  if (error) return { error: 'Night Cup oluşturulamadı: ' + error.message };

  await logAdminAudit({
    action: 'CREATE_TOURNAMENT_NIGHT_CUP',
    entity_type: 'tournaments',
    entity_id: newTour?.id || null,
    entity_label: name.trim(),
    new_data: {
      name: name.trim(),
      season_id,
      type: 'NIGHT_CUP',
      max_teams: parsedMaxTeams,
      prize: prize || null,
      status: status || (is_registration_open ? 'REGISTRATION' : 'DRAFT')
    },
    description: `"${name.trim()}" Night Cup turnuvası oluşturuldu.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  return { success: 'Night Cup turnuvası başarıyla oluşturuldu.' };
}

export async function updateNightCupApplicationStatusAction(application_id: string, status: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('tournament_applications').update({ status }).eq('id', application_id);
  
  if (error) return { error: 'Başvuru durumu güncellenemedi.' };
  
  await logAdminAudit({
    action: 'UPDATE_TOURNAMENT_APPLICATION',
    entity_type: 'tournament_applications',
    entity_id: application_id,
    entity_label: `Başvuru #${application_id.substring(0, 8)}`,
    new_data: { status },
    description: `Night Cup başvurusu (#${application_id.substring(0, 8)}) durumu "${status}" yapıldı.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/tournaments');
  return { success: 'Başvuru başarıyla güncellendi.' };
}

export async function assignNightCupWinnerAction(tournament_id: string, application_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  // check if winner already exists
  const { data: existing } = await supabase.from('tournament_winners').select('id').eq('tournament_id', tournament_id).maybeSingle();
  if (existing) return { error: 'Bu turnuva için zaten kazanan belirlenmiş.' };

  const { error } = await supabase.from('tournament_winners').insert({
    tournament_id,
    placement: 1,
    application_id
  });

  if (error) return { error: 'Kazanan eklenemedi: ' + error.message };

  await logAdminAudit({
    action: 'ASSIGN_TOURNAMENT_WINNER',
    entity_type: 'tournaments',
    entity_id: tournament_id,
    entity_label: `Turnuva #${tournament_id.substring(0, 8)}`,
    new_data: { tournament_id, application_id },
    description: `Night Cup (#${tournament_id.substring(0, 8)}) kazananı belirlendi.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  return { success: 'Night Cup kazananı kaydedildi.' };
}

export async function deleteTournamentAction(id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { data: tour } = await supabase.from('tournaments').select('name').eq('id', id).maybeSingle();

  const { error } = await supabase.from('tournaments').delete().eq('id', id);
  if (error) return { error: 'Turnuva silinemedi: ' + error.message };

  await logAdminAudit({
    action: 'DELETE_TOURNAMENT',
    entity_type: 'tournaments',
    entity_id: id,
    entity_label: tour?.name || 'Turnuva',
    description: `"${tour?.name || 'Turnuva'}" silindi.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  return { success: 'Turnuva başarıyla silindi.' };
}

export async function updateNightCupDetailsAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim. Lütfen admin girişi yapın.' };

  const tournament_id = formData.get('tournament_id') as string;
  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  const max_teams = formData.get('max_teams') as string;
  const is_registration_open = formData.get('is_registration_open') === 'true';
  const registration_start = parseToTurkeyISO(formData.get('registration_start') as string);
  const registration_end = parseToTurkeyISO(formData.get('registration_end') as string);
  const tournament_date = parseToTurkeyISO(formData.get('tournament_date') as string);
  const rules = formData.get('rules') as string;
  const details = formData.get('details') as string;
  const prize = formData.get('prize') as string;
  const teams_per_group = formData.get('teams_per_group') as string;
  const advancing_teams_per_group = formData.get('advancing_teams_per_group') as string;
  const status = formData.get('status') as string;
  const discord_url = formData.get('discord_url') as string;
  const image_file = formData.get('image_file') as File | null;

  if (!tournament_id || typeof tournament_id !== 'string') {
    return { error: 'Geçersiz turnuva kimliği.' };
  }

  // UUID kontrolü
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tournament_id)) {
    return { error: 'Geçersiz turnuva kimlik formatı.' };
  }

  if (!name || !name.trim()) {
    return { error: 'Turnuva adı zorunludur.' };
  }

  // Kontenjan kontrolü (pozitif sayı)
  let parsedMaxTeams: number | null = null;
  if (max_teams && max_teams.trim()) {
    const val = parseInt(max_teams, 10);
    if (isNaN(val) || val <= 0) {
      return { error: 'Kontenjan pozitif bir sayı olmalıdır.' };
    }
    parsedMaxTeams = val;
  }

  const parsedTeamsPerGroup = teams_per_group && teams_per_group.trim() ? parseInt(teams_per_group, 10) : 4;
  const parsedAdvancing = advancing_teams_per_group && advancing_teams_per_group.trim() ? parseInt(advancing_teams_per_group, 10) : 2;

  // Tarih sıralama kontrolü
  if (registration_start && registration_end) {
    const start = new Date(registration_start).getTime();
    const end = new Date(registration_end).getTime();
    if (!isNaN(start) && !isNaN(end) && end < start) {
      return { error: 'Başvuru bitiş tarihi, başlangıç tarihinden önce olamaz.' };
    }
  }

  // Turnuvayı doğrula
  const { data: tour, error: fetchError } = await supabase
    .from('tournaments')
    .select('id, type, image_url')
    .eq('id', tournament_id)
    .maybeSingle();

  if (fetchError || !tour) {
    return { error: 'Turnuva bulunamadı.' };
  }

  let image_url = tour.image_url;
  if (image_file && image_file.size > 0) {
    if (image_file.size > 5 * 1024 * 1024) return { error: 'Görsel boyutu 5MB limitini aşıyor.' };
    const ext = image_file.name.split('.').pop() || 'png';
    const fileName = `tournament_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('tournaments').upload(fileName, image_file, { upsert: true });
    if (uploadError) return { error: 'Görsel yüklenemedi: ' + uploadError.message };
    const { data } = supabase.storage.from('tournaments').getPublicUrl(fileName);
    image_url = data.publicUrl;
  }

  const fullUpdatePayload: Record<string, any> = {
    name: name.trim(),
    description: description ? description.trim() : null,
    rules: rules ? rules.trim() : null,
    details: details ? details.trim() : null,
    prize: prize ? prize.trim() : null,
    teams_per_group: parsedTeamsPerGroup,
    advancing_teams_per_group: parsedAdvancing,
    status: status || (is_registration_open ? 'REGISTRATION' : 'DRAFT'),
    discord_url: discord_url ? discord_url.trim() : null,
    max_teams: parsedMaxTeams,
    is_registration_open,
    registration_start: registration_start || null,
    registration_end: registration_end || null,
    tournament_date: tournament_date || null,
    image_url
  };

  let { error: updateError } = await supabase
    .from('tournaments')
    .update(fullUpdatePayload)
    .eq('id', tournament_id);

  if (updateError && updateError.message.toLowerCase().includes('column')) {
    // Graceful fallback to core columns
    const coreUpdate = {
      name: name.trim(),
      description: description ? description.trim() : null,
      max_teams: parsedMaxTeams,
      is_registration_open,
      registration_start: registration_start || null,
      registration_end: registration_end || null,
      tournament_date: tournament_date || null,
      image_url
    };
    const fb = await supabase.from('tournaments').update(coreUpdate).eq('id', tournament_id);
    updateError = fb.error;
  }

  if (updateError) {
    return { error: 'Turnuva güncellenemedi: ' + updateError.message };
  }

  await logAdminAudit({
    action: 'UPDATE_TOURNAMENT_DETAILS',
    entity_type: 'tournaments',
    entity_id: tournament_id,
    entity_label: name.trim(),
    new_data: {
      name: name.trim(),
      max_teams: parsedMaxTeams,
      is_registration_open,
      status: status || null,
      prize: prize || null
    },
    description: `"${name.trim()}" Night Cup detayları güncellendi.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${tournament_id}`);
  return { success: 'Night Cup bilgileri başarıyla güncellendi.' };
}

// ==============================================================================
// PHASE 2 ACTIONS: GROUPS, GROUP TEAMS & TOURNAMENT MATCHES
// ==============================================================================

import { generateRoundRobinSchedule, distributeTeamsIntoGroups, generateDefaultGroupNames } from '@/lib/tournament-engine';

export async function generateTournamentGroupsAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const tournament_id = formData.get('tournament_id') as string;
  const group_count_raw = formData.get('group_count') as string;
  const preview_only = formData.get('preview_only') === 'true';
  const force_reset = formData.get('force_reset') === 'true';

  if (!tournament_id) return { error: 'Turnuva ID zorunludur.' };

  // 1. Fetch tournament
  const { data: tournament, error: tourError } = await supabase
    .from('tournaments')
    .select('id, name, type, teams_per_group, advancing_teams_per_group, status')
    .eq('id', tournament_id)
    .maybeSingle();

  if (tourError || !tournament) return { error: 'Turnuva bulunamadı.' };

  if (tournament.status === 'ARCHIVED') {
    return { error: 'Arşivlenmiş turnuva üzerinde grup ve fikstür oluşturulamaz.' };
  }

  // 2. Fetch approved applications only
  const { data: approvedApps, error: appsError } = await supabase
    .from('tournament_applications')
    .select('id, team_name, logo_url, applicant_id')
    .eq('tournament_id', tournament_id)
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: true });

  if (appsError || !approvedApps) return { error: 'Takımlar getirilemedi: ' + appsError?.message };

  if (approvedApps.length < 2) {
    return {
      error: `Grup ve fikstür oluşturmak için en az 2 ONAYLI takım gereklidir. Mevcut onaylı takım sayısı: ${approvedApps.length}.`
    };
  }

  // 3. Determine group count
  let groupCount = parseInt(group_count_raw);
  if (isNaN(groupCount) || groupCount < 1) {
    // If teams_per_group is specified on tournament, calculate
    const tPerGroup = tournament.teams_per_group || 4;
    groupCount = Math.max(1, Math.ceil(approvedApps.length / tPerGroup));
  }
  // Ensure we don't have more groups than teams
  if (groupCount > approvedApps.length) {
    groupCount = approvedApps.length;
  }

  // 4. Distribute teams
  const teamIds = approvedApps.map((a: any) => a.id);
  const distributedBuckets = distributeTeamsIntoGroups(teamIds, groupCount);
  const groupNames = generateDefaultGroupNames(groupCount);

  // Build preview object
  const previewGroups = distributedBuckets.map((bucketIds, idx) => {
    const teamsInGroup = bucketIds.map((tid) => approvedApps.find((a: any) => a.id === tid));
    const roundRobinMatches = generateRoundRobinSchedule(bucketIds);

    const matchesWithTeams = roundRobinMatches.map((m) => {
      const home = approvedApps.find((a: any) => a.id === m.homeId);
      const away = approvedApps.find((a: any) => a.id === m.awayId);
      return {
        ...m,
        homeTeam: home,
        awayTeam: away,
      };
    });

    return {
      name: groupNames[idx],
      order_index: idx,
      teams: teamsInGroup,
      matches: matchesWithTeams,
    };
  });

  const totalMatchesCount = previewGroups.reduce((acc, g) => acc + g.matches.length, 0);

  // If preview only, return the generated plan without DB mutation
  if (preview_only) {
    return {
      success: 'Önizleme oluşturuldu.',
      preview: {
        tournament_id,
        group_count: groupCount,
        total_teams: approvedApps.length,
        total_matches: totalMatchesCount,
        groups: previewGroups,
      },
    };
  }

  // 5. Commit generation to DB
  // Check if completed/scored matches exist
  const { data: playedMatches } = await supabase
    .from('tournament_matches')
    .select('id, home_score, away_score, status')
    .eq('tournament_id', tournament_id)
    .or('status.eq.COMPLETED,status.eq.APPROVED,home_score.not.is.null');

  if (playedMatches && playedMatches.length > 0 && !force_reset) {
    return {
      error: `Bu turnuvada skoru girilmiş veya tamamlanmış ${playedMatches.length} adet maç bulunmaktadır! Mevcut maçları silip sıfırdan oluşturmak için açık onay vermelisiniz.`,
      has_played_matches: true,
    };
  }

  // Safe idempotent reset: Delete previous matches and groups for this tournament
  await supabase.from('tournament_matches').delete().eq('tournament_id', tournament_id);
  await supabase.from('tournament_groups').delete().eq('tournament_id', tournament_id);

  // Insert groups, group_teams, and matches
  let insertedMatchesCount = 0;

  for (let idx = 0; idx < previewGroups.length; idx++) {
    const groupPlan = previewGroups[idx];

    // Insert group
    const { data: newGroup, error: groupErr } = await supabase
      .from('tournament_groups')
      .insert({
        tournament_id,
        name: groupPlan.name,
        order_index: idx,
      })
      .select('id')
      .single();

    if (groupErr || !newGroup) {
      return { error: 'Grup oluşturulamadı: ' + groupErr?.message };
    }

    // Insert group teams
    const groupTeamsPayload = groupPlan.teams.map((t: any, seedIdx: number) => ({
      tournament_id,
      group_id: newGroup.id,
      application_id: t.id,
      seed: seedIdx + 1,
    }));

    const { error: teamErr } = await supabase
      .from('tournament_group_teams')
      .insert(groupTeamsPayload);

    if (teamErr) {
      return { error: 'Grup takımları kaydedilemedi: ' + teamErr.message };
    }

    // Insert group round-robin matches
    const matchesPayload = groupPlan.matches.map((m) => ({
      tournament_id,
      group_id: newGroup.id,
      home_application_id: m.homeId,
      away_application_id: m.awayId,
      stage: 'GROUP',
      round_number: m.round,
      match_order: m.matchOrder,
      status: 'SCHEDULED',
    }));

    if (matchesPayload.length > 0) {
      const { error: matchErr } = await supabase
        .from('tournament_matches')
        .insert(matchesPayload);

      if (matchErr) {
        return { error: 'Grup maçları kaydedilemedi: ' + matchErr.message };
      }
      insertedMatchesCount += matchesPayload.length;
    }
  }

  // Update tournament: close registrations, set IN_PROGRESS
  await supabase
    .from('tournaments')
    .update({
      is_registration_open: false,
      status: 'IN_PROGRESS',
    })
    .eq('id', tournament_id);

  await logAdminAudit({
    action: 'GENERATE_TOURNAMENT_GROUPS',
    entity_type: 'tournaments',
    entity_id: tournament_id,
    entity_label: tournament.name,
    new_data: {
      group_count: groupCount,
      total_teams: approvedApps.length,
      total_matches: insertedMatchesCount,
    },
    description: `"${tournament.name}" turnuvası için ${groupCount} grup ve ${insertedMatchesCount} maçlık fikstür oluşturuldu.`,
    actor_id: user?.id,
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${tournament_id}`);

  return {
    success: `Başarılı! ${groupCount} grup ve toplam ${insertedMatchesCount} maçlık fikstür üretildi.`,
    total_groups: groupCount,
    total_matches: insertedMatchesCount,
  };
}

export async function updateTournamentGroupNameAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const group_id = formData.get('group_id') as string;
  const name = formData.get('name') as string;
  const tournament_id = formData.get('tournament_id') as string;

  if (!group_id || !name?.trim()) return { error: 'Grup adı boş bırakılamaz.' };

  const { error } = await supabase
    .from('tournament_groups')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', group_id);

  if (error) return { error: 'Grup adı güncellenemedi: ' + error.message };

  await logAdminAudit({
    action: 'UPDATE_TOURNAMENT_GROUP_NAME',
    entity_type: 'tournament_groups',
    entity_id: group_id,
    entity_label: name.trim(),
    new_data: { name: name.trim() },
    description: `Grup adı "${name.trim()}" olarak güncellendi.`,
    actor_id: user?.id,
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  if (tournament_id) revalidatePath(`/turnuvalar/${tournament_id}`);

  return { success: 'Grup adı başarıyla güncellendi.' };
}

export async function updateTournamentMatchAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const match_id = formData.get('match_id') as string;
  const tournament_id = formData.get('tournament_id') as string;
  const home_score_raw = formData.get('home_score') as string;
  const away_score_raw = formData.get('away_score') as string;
  const status_raw = formData.get('status') as string;
  const scheduled_at_raw = formData.get('scheduled_at') as string;

  if (!match_id) return { error: 'Maç ID zorunludur.' };

  const home_score = home_score_raw !== '' && home_score_raw !== null && !isNaN(parseInt(home_score_raw))
    ? parseInt(home_score_raw)
    : null;
  const away_score = away_score_raw !== '' && away_score_raw !== null && !isNaN(parseInt(away_score_raw))
    ? parseInt(away_score_raw)
    : null;

  const penalty_home_score_raw = formData.get('penalty_home_score') as string;
  const penalty_away_score_raw = formData.get('penalty_away_score') as string;
  const winner_application_id = formData.get('winner_application_id') as string;

  const penalty_home_score = penalty_home_score_raw !== '' && penalty_home_score_raw !== null && !isNaN(parseInt(penalty_home_score_raw))
    ? parseInt(penalty_home_score_raw)
    : null;
  const penalty_away_score = penalty_away_score_raw !== '' && penalty_away_score_raw !== null && !isNaN(parseInt(penalty_away_score_raw))
    ? parseInt(penalty_away_score_raw)
    : null;

  let status = status_raw || 'SCHEDULED';
  if (home_score !== null && away_score !== null && status !== 'CANCELLED') {
    status = 'COMPLETED';
  }

  const payload: Record<string, any> = {
    home_score,
    away_score,
    status,
    scheduled_at: parseToTurkeyISO(scheduled_at_raw),
    updated_at: new Date().toISOString(),
  };

  if (penalty_home_score !== null) payload.penalty_home_score = penalty_home_score;
  if (penalty_away_score !== null) payload.penalty_away_score = penalty_away_score;
  if (winner_application_id) payload.winner_application_id = winner_application_id;

  const { error } = await supabase
    .from('tournament_matches')
    .update(payload)
    .eq('id', match_id);

  if (error) return { error: 'Maç güncellenemedi: ' + error.message };

  if (status === 'COMPLETED' || status === 'APPROVED') {
    await handleKnockoutWinnerProgression({
      supabase,
      matchId: match_id,
      homeScore: home_score,
      awayScore: away_score,
      penaltyHome: penalty_home_score,
      penaltyAway: penalty_away_score,
      designatedWinnerId: winner_application_id || null,
      userId: user?.id,
    });
  }

  await logAdminAudit({
    action: 'UPDATE_TOURNAMENT_MATCH',
    entity_type: 'tournament_matches',
    entity_id: match_id,
    entity_label: `Maç Skor: ${home_score ?? '-'} - ${away_score ?? '-'}`,
    new_data: payload,
    description: `Turnuva maçı skoru/durumu güncellendi: ${home_score ?? '-'} - ${away_score ?? '-'} (${status})`,
    actor_id: user?.id,
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  if (tournament_id) revalidatePath(`/turnuvalar/${tournament_id}`);

  return { success: 'Maç bilgileri başarıyla güncellendi.' };
}

export async function resetTournamentGroupsAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const tournament_id = formData.get('tournament_id') as string;
  const confirm_force = formData.get('confirm_force') === 'true';

  if (!tournament_id) return { error: 'Turnuva ID zorunludur.' };

  const { data: playedMatches } = await supabase
    .from('tournament_matches')
    .select('id')
    .eq('tournament_id', tournament_id)
    .or('status.eq.COMPLETED,status.eq.APPROVED,home_score.not.is.null');

  if (playedMatches && playedMatches.length > 0 && !confirm_force) {
    return {
      error: `Bu turnuvada oynanmış veya skoru girilmiş ${playedMatches.length} adet maç bulunmaktadır! Sıfırlamak için onaylamalısınız.`,
      has_played_matches: true,
    };
  }

  await supabase.from('tournament_matches').delete().eq('tournament_id', tournament_id);
  await supabase.from('tournament_groups').delete().eq('tournament_id', tournament_id);

  await logAdminAudit({
    action: 'RESET_TOURNAMENT_GROUPS',
    entity_type: 'tournaments',
    entity_id: tournament_id,
    entity_label: 'Turnuva Grupları Sıfırlandı',
    description: `Turnuva grupları ve fikstürü admin tarafından sıfırlandı.`,
    actor_id: user?.id,
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${tournament_id}`);

  return { success: 'Gruplar ve fikstür başarıyla sıfırlandı.' };
}

// ==============================================================================
// PHASE 3 ACTIONS: APPROVE / REJECT MATCH RESULT SUBMISSIONS
// ==============================================================================

export async function approveTournamentMatchSubmissionAction(input: string | FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const submission_id = typeof input === 'string' ? input : (input.get('submission_id') as string);
  if (!submission_id) return { error: 'Bildirim ID zorunludur.' };

  // 1. Fetch submission with match and teams
  const { data: sub, error: subErr } = await supabase
    .from('tournament_match_submissions')
    .select(`
      id,
      tournament_id,
      match_id,
      home_score,
      away_score,
      screenshot_url,
      status,
      submitted_by,
      match:tournament_matches(
        id,
        status,
        home:tournament_applications!home_application_id(team_name),
        away:tournament_applications!away_application_id(team_name)
      )
    `)
    .eq('id', submission_id)
    .maybeSingle();

  if (subErr || !sub) return { error: 'Bildirim bulunamadı.' };

  if (sub.status !== 'PENDING_REVIEW') {
    return { error: 'Bu bildirim zaten ' + (sub.status === 'APPROVED' ? 'onaylanmış' : 'reddedilmiş') + '.' };
  }

  const nowIso = new Date().toISOString();

  // 2. Atomically update submission
  const { error: updateSubErr } = await supabase
    .from('tournament_match_submissions')
    .update({
      status: 'APPROVED',
      reviewed_by: user.id,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', submission_id);

  if (updateSubErr) {
    return { error: 'Bildirim onaylanamadı: ' + updateSubErr.message };
  }

  // 3. Atomically update match to APPROVED
  const { error: updateMatchErr } = await supabase
    .from('tournament_matches')
    .update({
      status: 'APPROVED',
      home_score: sub.home_score,
      away_score: sub.away_score,
      screenshot_url: sub.screenshot_url,
      approved_by: user.id,
      approved_at: nowIso,
      rejection_reason: null,
      updated_at: nowIso,
    })
    .eq('id', sub.match_id);

  if (updateMatchErr) {
    // Rollback submission
    await supabase.from('tournament_match_submissions').update({ status: 'PENDING_REVIEW' }).eq('id', submission_id);
    return { error: 'Maç skoru onaylanamadı: ' + updateMatchErr.message };
  }

  // Progress knockout winner if match is in knockout stage
  await handleKnockoutWinnerProgression({
    supabase,
    matchId: sub.match_id,
    homeScore: sub.home_score,
    awayScore: sub.away_score,
    userId: user.id,
  });

  const homeName = (sub.match as any)?.home?.team_name || 'Ev Sahibi';
  const awayName = (sub.match as any)?.away?.team_name || 'Deplasman';

  await logAdminAudit({
    action: 'APPROVE_TOURNAMENT_MATCH_RESULT',
    entity_type: 'tournament_matches',
    entity_id: sub.match_id,
    entity_label: `${homeName} ${sub.home_score} - ${sub.away_score} ${awayName}`,
    new_data: {
      submission_id: sub.id,
      home_score: sub.home_score,
      away_score: sub.away_score,
      status: 'APPROVED',
    },
    description: `"${homeName} ${sub.home_score} - ${sub.away_score} ${awayName}" maç sonucu ve golcüleri onaylandı.`,
    actor_id: user.id,
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${sub.tournament_id}`);

  return { success: 'Maç sonucu onaylandı ve puan tablosuna işlendi.' };
}

export async function rejectTournamentMatchSubmissionAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const submission_id = formData.get('submission_id') as string;
  const rejection_reason = (formData.get('rejection_reason') as string)?.trim();

  if (!submission_id) return { error: 'Bildirim ID zorunludur.' };
  if (!rejection_reason) return { error: 'Lütfen bir ret nedeni belirtin.' };

  const { data: sub, error: subErr } = await supabase
    .from('tournament_match_submissions')
    .select(`
      id,
      tournament_id,
      match_id,
      status,
      match:tournament_matches(
        id,
        home:tournament_applications!home_application_id(team_name),
        away:tournament_applications!away_application_id(team_name)
      )
    `)
    .eq('id', submission_id)
    .maybeSingle();

  if (subErr || !sub) return { error: 'Bildirim bulunamadı.' };

  if (sub.status !== 'PENDING_REVIEW') {
    return { error: 'Bu bildirim inceleme aşamasında değil.' };
  }

  const nowIso = new Date().toISOString();

  // Update submission to REJECTED
  const { error: updateSubErr } = await supabase
    .from('tournament_match_submissions')
    .update({
      status: 'REJECTED',
      rejection_reason,
      reviewed_by: user.id,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', submission_id);

  if (updateSubErr) {
    return { error: 'Bildirim reddedilemedi: ' + updateSubErr.message };
  }

  // Update match to REJECTED so team representative can re-submit
  const { error: updateMatchErr } = await supabase
    .from('tournament_matches')
    .update({
      status: 'REJECTED',
      rejection_reason,
      updated_at: nowIso,
    })
    .eq('id', sub.match_id);

  if (updateMatchErr) {
    return { error: 'Maç durumu güncellenemedi: ' + updateMatchErr.message };
  }

  const homeName = (sub.match as any)?.home?.team_name || 'Ev Sahibi';
  const awayName = (sub.match as any)?.away?.team_name || 'Deplasman';

  await logAdminAudit({
    action: 'REJECT_TOURNAMENT_MATCH_RESULT',
    entity_type: 'tournament_matches',
    entity_id: sub.match_id,
    entity_label: `${homeName} vs ${awayName}`,
    new_data: {
      submission_id: sub.id,
      rejection_reason,
      status: 'REJECTED',
    },
    description: `"${homeName} vs ${awayName}" maç sonucu reddedildi: ${rejection_reason}`,
    actor_id: user.id,
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${sub.tournament_id}`);

  return { success: 'Maç sonucu reddedildi. Takım temsilcisi yeniden gönderebilir.' };
}

// ==============================================================================
// PHASE 4: KNOCKOUT BRACKET & FINALS PROGRESSION ENGINE ACTIONS
// ==============================================================================

async function handleKnockoutWinnerProgression({
  supabase,
  matchId,
  homeScore,
  awayScore,
  penaltyHome,
  penaltyAway,
  designatedWinnerId,
  userId,
}: {
  supabase: any;
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
  penaltyHome?: number | null;
  penaltyAway?: number | null;
  designatedWinnerId?: string | null;
  userId?: string | null;
}) {
  const { data: match } = await supabase
    .from('tournament_matches')
    .select(`
      id,
      tournament_id,
      group_id,
      stage,
      round_number,
      match_order,
      bracket_slot,
      home_application_id,
      away_application_id,
      next_match_id,
      winner_application_id,
      tournament:tournaments(id, name, season_id)
    `)
    .eq('id', matchId)
    .maybeSingle();

  if (!match) return;

  // Only knockout matches progress into next rounds
  if (match.stage === 'GROUP' || !match.stage) return;

  let winnerId = designatedWinnerId || null;
  let loserId: string | null = null;

  if (!winnerId && homeScore !== null && awayScore !== null) {
    if (homeScore > awayScore) {
      winnerId = match.home_application_id;
      loserId = match.away_application_id;
    } else if (awayScore > homeScore) {
      winnerId = match.away_application_id;
      loserId = match.home_application_id;
    } else if (penaltyHome !== null && penaltyHome !== undefined && penaltyAway !== null && penaltyAway !== undefined) {
      if (penaltyHome > penaltyAway) {
        winnerId = match.home_application_id;
        loserId = match.away_application_id;
      } else if (penaltyAway > penaltyHome) {
        winnerId = match.away_application_id;
        loserId = match.home_application_id;
      }
    }
  }

  if (!winnerId) return;

  if (!loserId) {
    loserId = winnerId === match.home_application_id ? match.away_application_id : match.home_application_id;
  }

  // 1. Update match with winner and penalty details
  await supabase
    .from('tournament_matches')
    .update({
      winner_application_id: winnerId,
      penalty_home_score: penaltyHome ?? null,
      penalty_away_score: penaltyAway ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  // 2. Feed winner into next_match_id if linked
  if (match.next_match_id) {
    const { data: nextMatch } = await supabase
      .from('tournament_matches')
      .select('id, home_application_id, away_application_id')
      .eq('id', match.next_match_id)
      .maybeSingle();

    if (nextMatch) {
      const isHomeSide = match.match_order % 2 === 1;
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      if (isHomeSide) {
        updateData.home_application_id = winnerId;
      } else {
        updateData.away_application_id = winnerId;
      }
      await supabase.from('tournament_matches').update(updateData).eq('id', match.next_match_id);
    }
  }

  // 3. If SEMI_FINAL, feed loser into THIRD_PLACE match if one exists
  if (match.stage === 'SEMI_FINAL' && loserId) {
    const { data: thirdPlaceMatch } = await supabase
      .from('tournament_matches')
      .select('id, home_application_id, away_application_id')
      .eq('tournament_id', match.tournament_id)
      .eq('stage', 'THIRD_PLACE')
      .maybeSingle();

    if (thirdPlaceMatch) {
      const isHomeSide = match.match_order === 1;
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      if (isHomeSide) {
        updateData.home_application_id = loserId;
      } else {
        updateData.away_application_id = loserId;
      }
      await supabase.from('tournament_matches').update(updateData).eq('id', thirdPlaceMatch.id);
    }
  }

  // 4. If THIRD_PLACE match, winner is 3rd place!
  if (match.stage === 'THIRD_PLACE' && winnerId) {
    const { data: existing3rd } = await supabase
      .from('tournament_winners')
      .select('id')
      .eq('tournament_id', match.tournament_id)
      .eq('placement', 3)
      .maybeSingle();

    if (!existing3rd) {
      await supabase.from('tournament_winners').insert({
        tournament_id: match.tournament_id,
        placement: 3,
        application_id: winnerId,
      });
    }
  }

  // 5. If FINAL match, record champion (1st), runner-up (2nd), and complete tournament
  if (match.stage === 'FINAL' && winnerId) {
    const { data: existingWinner } = await supabase
      .from('tournament_winners')
      .select('id')
      .eq('tournament_id', match.tournament_id)
      .eq('placement', 1)
      .maybeSingle();

    if (!existingWinner) {
      // 1st place
      await supabase.from('tournament_winners').insert({
        tournament_id: match.tournament_id,
        placement: 1,
        application_id: winnerId,
      });

      // 2nd place
      if (loserId) {
        await supabase.from('tournament_winners').insert({
          tournament_id: match.tournament_id,
          placement: 2,
          application_id: loserId,
        });
      }

      // Mark tournament completed
      await supabase
        .from('tournaments')
        .update({
          status: 'COMPLETED',
          is_registration_open: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', match.tournament_id);

      // Award NIGHT_CUP_WINNER achievement idempotently
      try {
        const { data: winnerApp } = await supabase
          .from('tournament_applications')
          .select('id, applicant_id, team_name, tournament_application_players(profile_id)')
          .eq('id', winnerId)
          .maybeSingle();

        if (winnerApp?.applicant_id) {
          const seasonId = (match.tournament as any)?.season_id || null;
          const { data: existingAch } = await supabase
            .from('player_achievements')
            .select('id')
            .eq('player_id', winnerApp.applicant_id)
            .eq('achievement_type', 'NIGHT_CUP_WINNER')
            .maybeSingle();

          if (!existingAch) {
            await supabase.from('player_achievements').insert({
              player_id: winnerApp.applicant_id,
              achievement_type: 'NIGHT_CUP_WINNER',
              season_id: seasonId,
              awarded_by: userId || null,
            });
          }
        }
      } catch (err) {
        console.warn('Achievement award check:', err);
      }
    }
  }
}

export async function generateKnockoutStageAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const tournament_id = formData.get('tournament_id') as string;
  const preview_only = formData.get('preview_only') === 'true';
  const include_third_place = formData.get('include_third_place') !== 'false';
  const advancingOverrideRaw = formData.get('advancing_teams_per_group') as string;

  if (!tournament_id) return { error: 'Turnuva ID zorunludur.' };

  // 1. Fetch tournament
  const { data: tour, error: tourErr } = await supabase
    .from('tournaments')
    .select('*, seasons(id, name)')
    .eq('id', tournament_id)
    .maybeSingle();

  if (tourErr || !tour) return { error: 'Turnuva bulunamadı.' };

  if (tour.status === 'ARCHIVED') {
    return { error: 'Arşivlenmiş turnuva üzerinde eleme aşaması oluşturulamaz.' };
  }

  // 2. Fetch groups with teams
  const { data: groups, error: grpErr } = await supabase
    .from('tournament_groups')
    .select(`
      id,
      name,
      order_index,
      tournament_group_teams(
        id,
        application_id,
        tournament_applications(id, team_name, logo_url, applicant_id)
      )
    `)
    .eq('tournament_id', tournament_id)
    .order('order_index', { ascending: true });

  if (grpErr || !groups || groups.length === 0) {
    return { error: 'Turnuvada grup bulunamadı. Önce grup ve fikstür oluşturulmalıdır.' };
  }

  // 3. Fetch all matches
  const { data: matches, error: matchErr } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournament_id);

  if (matchErr || !matches) {
    return { error: 'Turnuva maçları yüklenemedi.' };
  }

  // 4. Validate all group stage matches are completed and approved
  const validation = validateGroupStageCompleted(groups, matches);
  if (!validation.isComplete) {
    return {
      error: validation.error,
      pending_matches: validation.pendingCount,
    };
  }

  // 5. Extract top advancing teams
  const advancingPerGroup = advancingOverrideRaw && !isNaN(parseInt(advancingOverrideRaw))
    ? parseInt(advancingOverrideRaw)
    : (tour.advancing_teams_per_group || 2);

  const advancingTeams = extractAdvancingTeams(groups, matches, advancingPerGroup);

  if (advancingTeams.length < 2) {
    return { error: 'Eleme turu oluşturmak için gruplardan en az 2 takım çıkmalıdır.' };
  }

  // 6. Generate Champions League cross-pairings & BYEs
  const { pairings, byes, error: pairError } = generateCrossGroupPairings(advancingTeams);
  if (pairError) {
    return { error: pairError };
  }

  // 7. Build full bracket structure
  const bracketPlans = buildFullKnockoutBracket(pairings, byes, include_third_place);

  if (preview_only) {
    return {
      success: 'Eleme eşleşme önizlemesi hazırlandı.',
      preview: {
        advancingTeams,
        pairings: pairings.map(p => ({
          home: { id: p.home.application_id, name: p.home.team_name, logo_url: p.home.logo_url, group: p.home.group_name, rank: p.home.rank },
          away: { id: p.away.application_id, name: p.away.team_name, logo_url: p.away.logo_url, group: p.away.group_name, rank: p.away.rank },
        })),
        byes: byes.map(b => ({
          id: b.application_id,
          name: b.team_name,
          logo_url: b.logo_url,
          group: b.group_name,
          rank: b.rank,
        })),
        totalMatches: bracketPlans.length,
        bracketPlans,
      },
    };
  }

  // 8. Check if knockout matches already exist
  const existingKnockoutMatches = matches.filter(m => m.stage && m.stage !== 'GROUP');
  if (existingKnockoutMatches.length > 0) {
    const hasPlayed = existingKnockoutMatches.some(m => m.status === 'COMPLETED' || m.status === 'APPROVED');
    const forceReset = formData.get('confirm_force_reset') === 'true';
    if (hasPlayed && !forceReset) {
      return {
        error: `Eleme aşamasında oynanmış/onaylanmış ${existingKnockoutMatches.filter(m => m.status === 'COMPLETED' || m.status === 'APPROVED').length} maç bulunuyor. Sıfırlamak için onaylamalısınız.`,
        has_played_matches: true,
      };
    }

    // Delete existing knockout matches (preserving group matches!)
    await supabase
      .from('tournament_matches')
      .delete()
      .eq('tournament_id', tournament_id)
      .neq('stage', 'GROUP');
  }

  // 9. Insert all bracket matches
  const insertPayloads = bracketPlans.map(plan => ({
    tournament_id,
    group_id: null,
    stage: plan.stage,
    round_number: plan.roundNumber,
    match_order: plan.matchOrder,
    bracket_slot: plan.bracketSlot,
    home_application_id: plan.homeTeam?.application_id || null,
    away_application_id: plan.awayTeam?.application_id || null,
    is_bye: plan.isBye,
    status: plan.isBye ? 'APPROVED' : 'SCHEDULED',
    home_score: plan.isBye ? 1 : null,
    away_score: plan.isBye ? 0 : null,
    winner_application_id: plan.isBye ? (plan.homeTeam?.application_id || null) : null,
  }));

  const { data: insertedMatches, error: insertErr } = await supabase
    .from('tournament_matches')
    .insert(insertPayloads)
    .select('id, bracket_slot, stage, match_order, is_bye, home_application_id');

  if (insertErr || !insertedMatches) {
    return { error: 'Eleme maçları oluşturulamadı: ' + insertErr?.message };
  }

  // 10. Link next_match_id across bracket slots
  const slotToIdMap: Record<string, string> = {};
  insertedMatches.forEach((m: any) => {
    if (m.bracket_slot) slotToIdMap[m.bracket_slot] = m.id;
  });

  for (const plan of bracketPlans) {
    if (plan.nextBracketSlot && slotToIdMap[plan.nextBracketSlot]) {
      const currentMatchId = slotToIdMap[plan.bracketSlot];
      const targetMatchId = slotToIdMap[plan.nextBracketSlot];
      if (currentMatchId && targetMatchId) {
        await supabase
          .from('tournament_matches')
          .update({ next_match_id: targetMatchId })
          .eq('id', currentMatchId);
      }
    }
  }

  // 11. Advance BYE teams immediately into their next match
  for (const inserted of insertedMatches) {
    if (inserted.is_bye && inserted.home_application_id) {
      await handleKnockoutWinnerProgression({
        supabase,
        matchId: inserted.id,
        homeScore: 1,
        awayScore: 0,
        designatedWinnerId: inserted.home_application_id,
        userId: user.id,
      });
    }
  }

  // 12. Update tournament status to IN_PROGRESS
  await supabase
    .from('tournaments')
    .update({ status: 'IN_PROGRESS', is_registration_open: false, updated_at: new Date().toISOString() })
    .eq('id', tournament_id);

  await logAdminAudit({
    action: 'GENERATE_KNOCKOUT_STAGE',
    entity_type: 'tournaments',
    entity_id: tournament_id,
    entity_label: tour.name,
    new_data: { total_knockout_matches: insertedMatches.length, advancing_teams_count: advancingTeams.length },
    description: `"${tour.name}" turnuvası için eleme bracket'i ve ${insertedMatches.length} maç oluşturuldu.`,
    actor_id: user.id,
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${tournament_id}`);

  return { success: 'Eleme aşaması ve bracket başarıyla oluşturuldu.' };
}

export async function updateTournamentKnockoutMatchWinnerAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const match_id = formData.get('match_id') as string;
  const winner_application_id = formData.get('winner_application_id') as string;
  const penalty_home_raw = formData.get('penalty_home_score') as string;
  const penalty_away_raw = formData.get('penalty_away_score') as string;

  if (!match_id || !winner_application_id) {
    return { error: 'Maç ID ve kazanan takım zorunludur.' };
  }

  const penalty_home = penalty_home_raw !== '' && penalty_home_raw !== null && !isNaN(parseInt(penalty_home_raw))
    ? parseInt(penalty_home_raw)
    : null;
  const penalty_away = penalty_away_raw !== '' && penalty_away_raw !== null && !isNaN(parseInt(penalty_away_raw))
    ? parseInt(penalty_away_raw)
    : null;

  const { data: match } = await supabase
    .from('tournament_matches')
    .select('id, tournament_id, home_score, away_score')
    .eq('id', match_id)
    .maybeSingle();

  if (!match) return { error: 'Maç bulunamadı.' };

  await handleKnockoutWinnerProgression({
    supabase,
    matchId: match_id,
    homeScore: match.home_score,
    awayScore: match.away_score,
    penaltyHome: penalty_home,
    penaltyAway: penalty_away,
    designatedWinnerId: winner_application_id,
    userId: user.id,
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  if (match.tournament_id) revalidatePath(`/turnuvalar/${match.tournament_id}`);

  return { success: 'Kazanan takım kaydedildi ve bir sonraki tura ilerletildi.' };
}

export async function resetKnockoutStageAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const tournament_id = formData.get('tournament_id') as string;
  if (!tournament_id) return { error: 'Turnuva ID zorunludur.' };

  // Delete all non-GROUP matches
  await supabase
    .from('tournament_matches')
    .delete()
    .eq('tournament_id', tournament_id)
    .neq('stage', 'GROUP');

  // Delete tournament winners for this tournament
  await supabase
    .from('tournament_winners')
    .delete()
    .eq('tournament_id', tournament_id);

  // Set tournament back to IN_PROGRESS
  await supabase
    .from('tournaments')
    .update({ status: 'IN_PROGRESS', updated_at: new Date().toISOString() })
    .eq('id', tournament_id);

  await logAdminAudit({
    action: 'RESET_KNOCKOUT_STAGE',
    entity_type: 'tournaments',
    entity_id: tournament_id,
    entity_label: 'Eleme Aşaması Sıfırlandı',
    description: 'Turnuva eleme aşaması ve kazanan kayıtları sıfırlandı. Grup maçları korundu.',
    actor_id: user.id,
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${tournament_id}`);

  return { success: 'Eleme aşaması sıfırlandı. Grup maçları korundu.' };
}

export async function updateTournamentStatusAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const tournament_id = formData.get('tournament_id') as string;
  const status = formData.get('status') as string;

  if (!tournament_id || !status) return { error: 'Eksik bilgi.' };

  const isClosed = status === 'COMPLETED' || status === 'ARCHIVED';

  const { error } = await supabase
    .from('tournaments')
    .update({
      status,
      is_registration_open: isClosed ? false : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tournament_id);

  if (error) return { error: 'Turnuva durumu güncellenemedi: ' + error.message };

  await logAdminAudit({
    action: 'UPDATE_TOURNAMENT_STATUS',
    entity_type: 'tournaments',
    entity_id: tournament_id,
    entity_label: status,
    description: `Turnuva durumu "${status}" olarak değiştirildi.`,
    actor_id: user.id,
  });

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${tournament_id}`);

  return { success: `Turnuva durumu "${status}" olarak güncellendi.` };
}
