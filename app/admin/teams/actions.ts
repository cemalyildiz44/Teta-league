'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logAdminAudit } from '@/lib/audit';

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

async function checkSuperAdmin(supabase: any, user: any) {
  if (!user) return false;
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'SUPER_ADMIN')
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle();
  return !!data;
}

export async function createTeam(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const name = formData.get('name') as string;
  const ea_club_id_str = formData.get('ea_club_id') as string;
  const ea_club_name_input = (formData.get('ea_club_name') as string || '').trim().toUpperCase();
  const logo_file = (formData.get('logo_file') || formData.get('image_file')) as File;
  const logo_url_input = formData.get('logo_url') as string;
  const slugInput = formData.get('slug') as string;

  if (!name) return { error: 'Takım adı zorunludur.' };

  // Validate abbreviation (optional, 2-5 chars)
  if (ea_club_name_input && (ea_club_name_input.length < 2 || ea_club_name_input.length > 5)) {
    return { error: 'Takım kısaltması 2 ile 5 karakter arasında olmalıdır.' };
  }

  const ea_club_id = ea_club_id_str ? parseInt(ea_club_id_str, 10) : null;
  const slug = slugInput ? slugInput.toLowerCase().trim().replace(/[\s\W-]+/g, '-') : name.toLowerCase().trim().replace(/[\s\W-]+/g, '-');
  const ea_club_name = ea_club_name_input || null;

  let logo_url: string | null = logo_url_input || null;
  let uploadedFileName: string | null = null;

  if (logo_file && logo_file.size > 0) {
    if (logo_file.size > 5 * 1024 * 1024) {
      return { error: 'Logo boyutu 5MB sınırını aşıyor.' };
    }
    if (!logo_file.type.startsWith('image/')) {
      return { error: 'Geçersiz dosya formatı. Lütfen geçerli bir görsel (PNG, JPG, WEBP) seçin.' };
    }
    const ext = logo_file.name.split('.').pop() || 'webp';
    uploadedFileName = `team_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('team-logos')
      .upload(uploadedFileName, logo_file, {
        cacheControl: '31536000',
        upsert: true
      });

    if (uploadError) {
      return { error: 'Logo yüklenemedi: ' + uploadError.message };
    }

    const { data: urlData } = supabase.storage
      .from('team-logos')
      .getPublicUrl(uploadedFileName);
    logo_url = urlData.publicUrl;
  }

  const { error } = await supabase.from('teams').insert({
    name,
    slug,
    ea_club_id,
    ea_club_name,
    logo_url,
    is_active: true
  });

  if (error) {
    // Clean up uploaded image if DB insert failed (orphan prevention)
    if (uploadedFileName) {
      await supabase.storage.from('team-logos').remove([uploadedFileName]);
    }
    if (error.code === '23505') return { error: 'Bu isimde veya slug ile bir takım zaten var.' };
    return { error: 'Takım oluşturulamadı: ' + error.message };
  }

  await logAdminAudit({
    action: 'CREATE_TEAM',
    entity_type: 'teams',
    entity_label: name,
    new_data: { name, slug, ea_club_id, ea_club_name },
    description: `"${name}" takımı oluşturuldu.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/teams');
  revalidatePath('/takimlar');
  revalidatePath('/', 'layout');
  return { success: 'Takım başarıyla oluşturuldu.' };
}

export async function editTeam(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const id = formData.get('id') as string;
  const name = (formData.get('name') as string || '').trim();
  const ea_club_id_str = formData.get('ea_club_id') as string;
  const ea_club_name_input = (formData.get('ea_club_name') as string || '').trim().toUpperCase();
  const logo_file = (formData.get('logo_file') || formData.get('image_file')) as File;
  const remove_logo = formData.get('remove_logo') === 'true' || formData.get('remove_image') === 'true';
  const logo_url_input = formData.get('logo_url') as string;
  const slugInput = (formData.get('slug') as string || '').trim();
  const stream_url_input = (formData.get('stream_url') as string || '').trim();
  const instagram_url_input = (formData.get('instagram_url') as string || '').trim();

  if (!id) return { error: 'Takım ID zorunludur.' };
  if (!name) return { error: 'Takım adı zorunludur ve boş bırakılamaz.' };
  if (!slugInput) return { error: 'Slug zorunludur ve boş bırakılamaz.' };

  // Validate abbreviation (optional, 2-5 chars)
  if (ea_club_name_input && (ea_club_name_input.length < 2 || ea_club_name_input.length > 5)) {
    return { error: 'Takım kısaltması 2 ile 5 karakter arasında olmalıdır.' };
  }

  const ea_club_id = ea_club_id_str ? parseInt(ea_club_id_str, 10) : null;
  const slug = slugInput.toLowerCase().trim().replace(/[\s\W-]+/g, '-');
  const ea_club_name = ea_club_name_input || null;

  // Fetch current team data for cleanup
  const { data: currentTeam } = await supabase
    .from('teams')
    .select('id, name, logo_url, slug')
    .eq('id', id)
    .single();

  if (!currentTeam) return { error: 'Takım bulunamadı.' };

  const oldLogoUrl = currentTeam?.logo_url;
  let new_logo_url: string | null = null;
  let uploadedFileName: string | null = null;

  if (logo_file && logo_file.size > 0) {
    if (logo_file.size > 5 * 1024 * 1024) {
      return { error: 'Logo boyutu 5MB sınırını aşıyor.' };
    }
    if (!logo_file.type.startsWith('image/')) {
      return { error: 'Geçersiz dosya formatı. Lütfen geçerli bir görsel (PNG, JPG, WEBP) seçin.' };
    }
    const ext = logo_file.name.split('.').pop() || 'webp';
    uploadedFileName = `team_${id}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('team-logos')
      .upload(uploadedFileName, logo_file, {
        cacheControl: '31536000',
        upsert: true
      });

    if (uploadError) {
      return { error: 'Logo yüklenemedi: ' + uploadError.message };
    }

    const { data: urlData } = supabase.storage
      .from('team-logos')
      .getPublicUrl(uploadedFileName);
    new_logo_url = urlData.publicUrl;
  }

  const updatePayload: any = {
    name,
    slug,
    ea_club_id,
    ea_club_name,
    stream_url: stream_url_input || null,
    instagram_url: instagram_url_input || null,
    updated_at: new Date().toISOString()
  };

  if (new_logo_url) {
    updatePayload.logo_url = new_logo_url;
  } else if (remove_logo) {
    updatePayload.logo_url = null;
  } else if (logo_url_input !== undefined && logo_url_input !== '') {
    updatePayload.logo_url = logo_url_input;
  }

  const { error } = await supabase.from('teams').update(updatePayload).eq('id', id);

  if (error) {
    if (uploadedFileName) {
      await supabase.storage.from('team-logos').remove([uploadedFileName]);
    }
    if (error.code === '23505') return { error: 'Bu takım adı veya slug zaten kullanımda.' };
    return { error: 'Takım güncellenemedi: ' + error.message };
  }

  // Garbage collection: clean up old logo from storage if changed or removed and not used by other teams
  if ((new_logo_url || remove_logo) && oldLogoUrl && oldLogoUrl !== new_logo_url) {
    try {
      const { count: otherUsage } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('logo_url', oldLogoUrl)
        .neq('id', id);

      if (!otherUsage || otherUsage === 0) {
        const parts = oldLogoUrl.split('/public/team-logos/');
        if (parts.length === 2) {
          await supabase.storage.from('team-logos').remove([parts[1]]);
        }
      }
    } catch (cleanupErr) {
      console.error('Failed to cleanup old team logo:', cleanupErr);
    }
  }

  await logAdminAudit({
    action: 'UPDATE_TEAM',
    entity_type: 'teams',
    entity_id: id,
    entity_label: name,
    old_data: { name: currentTeam.name, slug: currentTeam.slug },
    new_data: updatePayload,
    description: `"${name}" takımı güncellendi.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/teams');
  revalidatePath('/takimlar');
  revalidatePath(`/takim/${slug}`);
  if (currentTeam.slug && currentTeam.slug !== slug) {
    revalidatePath(`/takim/${currentTeam.slug}`);
  }
  revalidatePath('/', 'layout');
  return { success: 'Takım başarıyla güncellendi.' };
}

export async function updateTeamStatus(id: string, is_active: boolean) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { data: team } = await supabase.from('teams').select('name').eq('id', id).maybeSingle();

  const { error } = await supabase.from('teams').update({ is_active }).eq('id', id);
  if (error) return { error: 'Durum güncellenemedi.' };

  await logAdminAudit({
    action: is_active ? 'ACTIVATE_TEAM' : 'DEACTIVATE_TEAM',
    entity_type: 'teams',
    entity_id: id,
    entity_label: team?.name || 'Takım',
    new_data: { is_active },
    description: `"${team?.name || 'Takım'}" ${is_active ? 'aktif edildi' : 'pasif edildi'}.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/teams');
  return { success: 'Takım durumu güncellendi.' };
}

export async function assignTeamCaptainAction(teamId: string, userId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  if (!teamId || !userId) return { error: 'Takım ve Kullanıcı seçilmelidir.' };

  const { error } = await supabase.rpc('admin_assign_team_captain', {
    p_team_id: teamId,
    p_user_id: userId
  });

  if (error) return { error: error.message };

  const { data: team } = await supabase
    .from('teams')
    .select('name, slug')
    .eq('id', teamId)
    .maybeSingle();

  await logAdminAudit({
    action: 'ASSIGN_CAPTAIN',
    entity_type: 'teams',
    entity_id: teamId,
    entity_label: team?.name || team?.slug || 'Takım',
    new_data: { teamId, userId },
    description: `"${team?.name || 'Takım'}" takımına kaptan atandı.`,
    actor_id: user.id
  });

  revalidatePath('/admin/teams');
  revalidatePath('/takimlar');
  if (team?.slug) {
    revalidatePath(`/takim/${team.slug}`);
  }
  return { success: 'Kaptan başarıyla atandı.' };
}

export async function removeTeamCaptainAction(teamId: string, userId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  if (!teamId || !userId) return { error: 'Takım ve Kullanıcı seçilmelidir.' };

  const { error } = await supabase.rpc('admin_remove_team_captain', {
    p_team_id: teamId,
    p_user_id: userId
  });

  if (error) return { error: error.message };

  const { data: team } = await supabase
    .from('teams')
    .select('name, slug')
    .eq('id', teamId)
    .maybeSingle();

  await logAdminAudit({
    action: 'REMOVE_CAPTAIN',
    entity_type: 'teams',
    entity_id: teamId,
    entity_label: team?.name || team?.slug || 'Takım',
    new_data: { teamId, userId },
    description: `"${team?.name || 'Takım'}" takımından kaptanlık yetkisi kaldırıldı.`,
    actor_id: user.id
  });

  revalidatePath('/admin/teams');
  revalidatePath('/takimlar');
  if (team?.slug) {
    revalidatePath(`/takim/${team.slug}`);
  }
  return { success: 'Kaptanlık yetkisi başarıyla kaldırıldı.' };
}

// Geriye dönük uyumluluk için alias
export async function assignCaptain(team_id: string, user_id: string) {
  return assignTeamCaptainAction(team_id, user_id);
}


export async function addPlayerToTeam(team_id: string, player_id: string, league_id: string, season_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!team_id || !player_id || !league_id || !season_id) return { error: 'Eksik bilgi (Oyuncu, Lig, Sezon).' };

  // Tek bir transaction içinde güvenli şekilde RPC ile işlemi hallediyoruz
  const { error } = await supabase.rpc('admin_add_player_to_team', {
    p_player_id: player_id,
    p_team_id: team_id,
    p_league_id: league_id,
    p_season_id: season_id
  });

  if (error) return { error: 'Oyuncu eklenemedi: ' + error.message };

  revalidatePath('/admin/teams');
  revalidatePath('/oyuncular');
  revalidatePath('/');
  return { success: 'Oyuncu başarıyla takıma eklendi.' };
}

export async function removePlayerFromTeam(membership_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  // Update left_at instead of deleting to preserve historical records
  const { error } = await supabase.from('team_memberships')
    .update({ left_at: new Date().toISOString() })
    .eq('id', membership_id);

  if (error) return { error: 'Oyuncu çıkarılamadı: ' + error.message };

  revalidatePath('/admin/teams');
  revalidatePath('/oyuncular');
  revalidatePath('/');
  return { success: 'Oyuncu başarıyla takımdan çıkarıldı.' };
}


export async function uploadTeamLogoAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const file = formData.get('file') as File;
  const teamId = formData.get('teamId') as string;

  if (!file || !teamId) return { error: 'Eksik dosya veya takım.' };

  if (file.size > 5 * 1024 * 1024) return { error: 'Logo boyutu 5MB limitini aşıyor.' };
  if (!file.type.startsWith('image/')) return { error: 'Geçersiz dosya formatı. Lütfen geçerli bir görsel (PNG, JPG, WEBP) yükleyin.' };

  const ext = file.name.split('.').pop() || 'webp';
  const fileName = `team_${teamId}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('team-logos')
    .upload(fileName, file, {
      cacheControl: '31536000',
      upsert: true
    });

  if (uploadError) return { error: 'Logo yüklenirken hata oluştu: ' + uploadError.message };

  const { data } = supabase.storage.from('team-logos').getPublicUrl(fileName);

  // Fetch old logo url for garbage collection
  const { data: oldTeam } = await supabase.from('teams').select('id, name, logo_url, slug').eq('id', teamId).single();

  const { error: updateError } = await supabase.from('teams').update({
    logo_url: data.publicUrl,
    updated_at: new Date().toISOString()
  }).eq('id', teamId);

  if (updateError) {
    await supabase.storage.from('team-logos').remove([fileName]);
    return { error: "Takım logosu veritabanına kaydedilemedi: " + updateError.message };
  }

  // Garbage collection: only delete old logo if no other team is using it
  if (oldTeam?.logo_url && oldTeam.logo_url !== data.publicUrl) {
    try {
      const { count: otherUsage } = await supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('logo_url', oldTeam.logo_url)
        .neq('id', teamId);

      if (!otherUsage || otherUsage === 0) {
        const parts = oldTeam.logo_url.split('/public/team-logos/');
        if (parts.length === 2) {
          await supabase.storage.from('team-logos').remove([parts[1]]);
        }
      }
    } catch (e) {
      console.error('Failed to cleanup old team logo:', e);
    }
  }

  await logAdminAudit({
    action: 'UPDATE_TEAM_LOGO',
    entity_type: 'teams',
    entity_id: teamId,
    entity_label: oldTeam?.name || 'Takım',
    description: `"${oldTeam?.name || 'Takım'}" logosu güncellendi.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/teams');
  revalidatePath('/takimlar');
  if (oldTeam?.slug) {
    revalidatePath(`/takim/${oldTeam.slug}`);
  }
  revalidatePath('/', 'layout');
  return { success: 'Logo başarıyla güncellendi.' };
}

export async function updateTeamApplicationStatusAction(application_id: string, status: 'APPROVED' | 'REJECTED') {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  if (!application_id || typeof application_id !== 'string') {
    return { error: 'Geçersiz başvuru ID.' };
  }

  if (status !== 'APPROVED' && status !== 'REJECTED') {
    return { error: 'Geçersiz durum değeri. Yalnızca ONAYLANDI veya REDDEDİLDİ seçilebilir.' };
  }

  // Fetch current application
  const { data: appData, error: fetchError } = await supabase
    .from('tournament_applications')
    .select('id, team_name, tournament_id, status')
    .eq('id', application_id)
    .maybeSingle();

  if (fetchError || !appData) {
    return { error: 'Başvuru bulunamadı.' };
  }

  if (appData.status === status) {
    return { error: `Bu başvuru zaten ${status === 'APPROVED' ? 'onaylanmış' : 'reddedilmiş'}.` };
  }

  const { error: updateError } = await supabase
    .from('tournament_applications')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', application_id);

  if (updateError) {
    return { error: 'Başvuru durumu güncellenemedi: ' + updateError.message };
  }

  await logAdminAudit({
    action: status === 'APPROVED' ? 'APPROVE_TEAM_APPLICATION' : 'REJECT_TEAM_APPLICATION',
    entity_type: 'tournament_applications',
    entity_id: application_id,
    entity_label: appData.team_name || `Başvuru #${application_id.substring(0, 8)}`,
    old_data: { status: appData.status },
    new_data: { status, team_name: appData.team_name, tournament_id: appData.tournament_id },
    description: `"${appData.team_name || 'Takım'}" başvurusu ${status === 'APPROVED' ? 'onaylandı' : 'reddedildi'}.`,
    actor_id: user.id
  });

  revalidatePath('/admin/teams');
  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  if (appData.tournament_id) {
    revalidatePath(`/turnuvalar/${appData.tournament_id}`);
  }
  return {
    success: status === 'APPROVED'
      ? `"${appData.team_name}" başvurusu başarıyla onaylandı.`
      : `"${appData.team_name}" başvurusu reddedildi.`
  };
}

export async function deleteTeamAction(teamId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  if (!teamId) return { error: 'Takım ID zorunludur.' };

  // Fetch team details
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, logo_url, is_active')
    .eq('id', teamId)
    .single();

  if (!team) return { error: 'Takım bulunamadı.' };

  // 1. Fetch all active memberships for this team to get affected player usernames for cache revalidation
  const { data: activeMemberships } = await supabase
    .from('team_memberships')
    .select('player_id, profiles!team_memberships_player_id_fkey(username)')
    .eq('team_id', teamId)
    .is('left_at', null);

  const affectedUsernames = (activeMemberships || [])
    .map((m: any) => m.profiles?.username)
    .filter(Boolean);

  const nowIso = new Date().toISOString();

  // 2. Automatically close all active memberships for this team (set left_at)
  // Career history is 100% PRESERVED; players without another active team become FREE (SERBEST)
  const { error: closeMembershipError } = await supabase
    .from('team_memberships')
    .update({ left_at: nowIso })
    .eq('team_id', teamId)
    .is('left_at', null);

  if (closeMembershipError) {
    return { error: 'Takım oyuncularının sözleşmeleri sonlandırılamadı: ' + closeMembershipError.message };
  }

  // 3. Deactivate active captain roles for this team
  await supabase
    .from('user_roles')
    .update({ is_active: false, revoked_at: nowIso })
    .eq('team_id', teamId)
    .eq('role', 'CAPTAIN');

  // 4. Deactivate league assignments for this team
  await supabase
    .from('league_teams')
    .update({ is_active: false })
    .eq('team_id', teamId);

  // 5. Check if the team has any career history or historical records
  //    (matches, stats, fixtures, transfers, memberships, penalties, or legacy career stats)
  const [
    { count: matchCount },
    { count: statCount },
    { count: fixtureCount },
    { count: transferCount },
    { count: membershipCount },
    { count: penaltyCount },
    { count: legacyStatCount }
  ] = await Promise.all([
    supabase.from('matches').select('id', { count: 'exact', head: true }).or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`),
    supabase.from('match_player_stats').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
    supabase.from('fixtures').select('id', { count: 'exact', head: true }).or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`),
    supabase.from('transfers').select('id', { count: 'exact', head: true }).or(`from_team_id.eq.${teamId},to_team_id.eq.${teamId}`),
    supabase.from('team_memberships').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
    supabase.from('team_penalties').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
    supabase.from('player_legacy_career_stats').select('id', { count: 'exact', head: true }).eq('team_id', teamId)
  ]);

  const hasCareerOrHistory = (matchCount && matchCount > 0) ||
                             (statCount && statCount > 0) ||
                             (fixtureCount && fixtureCount > 0) ||
                             (transferCount && transferCount > 0) ||
                             (membershipCount && membershipCount > 0) ||
                             (penaltyCount && penaltyCount > 0) ||
                             (legacyStatCount && legacyStatCount > 0);

  let successMsg = '';

  if (hasCareerOrHistory) {
    // Soft-delete / archive: preserve historical matches, standings and player career history
    const { error: archiveError } = await supabase
      .from('teams')
      .update({ is_active: false })
      .eq('id', teamId);

    if (archiveError) return { error: 'Takım arşivlenemedi: ' + archiveError.message };

    successMsg = `"${team.name}" takımı silindi / arşivlendi. Takıma bağlı tüm oyuncuların aktif sözleşmeleri kapatılarak oyuncular serbest bırakıldı, kariyer geçmişleri korundu.`;
  } else {
    // Completely empty team with zero memberships and zero history: clean up and physically delete
    await supabase.from('league_teams').delete().eq('team_id', teamId);
    await supabase.from('user_roles').delete().eq('team_id', teamId);
    await supabase.from('team_season_stats').delete().eq('team_id', teamId);
    await supabase.from('player_team_season_stats').delete().eq('team_id', teamId);

    const { error: deleteError } = await supabase.from('teams').delete().eq('id', teamId);
    if (deleteError) return { error: 'Takım silinemedi: ' + deleteError.message };

    // Garbage collect team logo (only if not used by any other team)
    if (team.logo_url) {
      try {
        const { count: otherUsage } = await supabase
          .from('teams')
          .select('id', { count: 'exact', head: true })
          .eq('logo_url', team.logo_url)
          .neq('id', teamId);

        if (!otherUsage || otherUsage === 0) {
          const parts = team.logo_url.split('/public/team-logos/');
          if (parts.length === 2) {
            await supabase.storage.from('team-logos').remove([parts[1]]);
          }
        }
      } catch (cleanupErr) {
        console.error('Failed to cleanup team logo:', cleanupErr);
      }
    }

    successMsg = `"${team.name}" takımı başarıyla tamamen silindi.`;
  }

  await logAdminAudit({
    action: 'DELETE_TEAM',
    entity_type: 'teams',
    entity_id: teamId,
    entity_label: team.name,
    description: successMsg,
    actor_id: user?.id
  });

  // 6. Comprehensive cache invalidation
  revalidatePath('/admin/teams');
  revalidatePath('/takimlar');
  revalidatePath('/oyuncular');
  revalidatePath('/profil');
  revalidatePath('/', 'layout');

  for (const uname of affectedUsernames) {
    revalidatePath(`/oyuncular/${uname}`);
  }

  return { success: successMsg };
}

/**
 * SUPER_ADMIN only action to permanently force-delete an inactive test team
 * that has zero matches, fixtures, match player stats, or season standings history.
 * Executes atomically via the public.force_delete_test_team PostgreSQL RPC.
 */
export async function forceDeleteTestTeamAction(teamId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Auth & SUPER_ADMIN check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Yetkisiz erişim. Lütfen giriş yapın.' };

  const isSuperAdmin = await checkSuperAdmin(supabase, user);
  if (!isSuperAdmin) {
    return { error: 'Yetkisiz erişim. Bu işlem yalnızca SUPER_ADMIN tarafından gerçekleştirilebilir.' };
  }

  // 2. Validate input and strict test team allowlist
  if (!teamId || typeof teamId !== 'string' || teamId.trim() === '') {
    return { error: 'Geçersiz takım ID.' };
  }

  const ALLOWED_TEST_TEAM_IDS = [
    'e9415213-c11c-497e-836f-f6354539ad4a', // Teta FC
    'd0f69110-5fff-4e83-bfdb-c0fbe0f5ae9f', // Teta Test FC
  ];

  if (!ALLOWED_TEST_TEAM_IDS.includes(teamId)) {
    return { error: 'Bu işlem yalnızca onaylanmış TETA test takımları için kullanılabilir.' };
  }

  // Collect member usernames prior to atomic deletion for selective cache invalidation
  // Note: player profiles (profiles) are NEVER modified or deleted
  const { data: memberProfiles } = await supabase
    .from('team_memberships')
    .select('player_id, profiles!team_memberships_player_id_fkey(username)')
    .eq('team_id', teamId);

  const affectedUsernames = (memberProfiles || [])
    .map((m: any) => m.profiles?.username)
    .filter(Boolean);

  // 3. Execute atomic PostgreSQL RPC (All guards + cascade deletions run in a single transaction)
  const { data: rpcResult, error: rpcError } = await supabase.rpc('force_delete_test_team', {
    p_team_id: teamId,
  });

  if (rpcError) {
    return { error: rpcError.message || 'Test takımı silinirken veritabanı hatası oluştu.' };
  }

  // 4. Logo cleanup in storage (ONLY after database transaction has successfully committed)
  let logoWarning: string | null = null;
  const logoUrl = rpcResult?.logo_url;
  if (logoUrl) {
    try {
      const parts = logoUrl.split('/public/team-logos/');
      if (parts.length === 2) {
        const { error: storageErr } = await supabase.storage.from('team-logos').remove([parts[1]]);
        if (storageErr) {
          logoWarning = `Takım silindi ancak logosu depolamadan kaldırılamadı: ${storageErr.message}`;
        }
      }
    } catch (cleanupErr: any) {
      logoWarning = `Takım silindi ancak logosu depolamadan kaldırılamadı: ${cleanupErr?.message || cleanupErr}`;
    }
  }

  // 5. Invalidate relevant cache paths
  revalidatePath('/admin/teams');
  revalidatePath('/admin/takimlar');
  revalidatePath('/admin');
  revalidatePath('/takimlar');
  revalidatePath('/oyuncular');
  revalidatePath('/profil');
  revalidatePath('/', 'layout');

  for (const uname of affectedUsernames) {
    revalidatePath(`/oyuncular/${uname}`);
  }

  const teamName = rpcResult?.team_name || 'Test';
  const successMsg = `"${teamName}" test takımı ve tüm test kayıtları tek bir atomik işlemle veritabanından kalıcı olarak silindi.`;

  await logAdminAudit({
    action: 'FORCE_DELETE_TEST_TEAM',
    entity_type: 'teams',
    entity_id: teamId,
    entity_label: teamName,
    old_data: rpcResult,
    description: successMsg,
    actor_id: user?.id
  });

  if (logoWarning) {
    return { success: successMsg, warning: logoWarning };
  }

  return { success: successMsg };
}
