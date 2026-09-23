'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

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
  const name = formData.get('name') as string;
  const ea_club_id_str = formData.get('ea_club_id') as string;
  const ea_club_name_input = (formData.get('ea_club_name') as string || '').trim().toUpperCase();
  const logo_file = (formData.get('logo_file') || formData.get('image_file')) as File;
  const remove_logo = formData.get('remove_logo') === 'true' || formData.get('remove_image') === 'true';
  const logo_url_input = formData.get('logo_url') as string;
  const slugInput = formData.get('slug') as string;

  if (!id || !name || !slugInput) return { error: 'Eksik bilgi.' };

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
    .select('logo_url')
    .eq('id', id)
    .single();

  const oldLogoUrl = currentTeam?.logo_url;
  let new_logo_url: string | null = null;
  let uploadedFileName: string | null = null;

  if (logo_file && logo_file.size > 0) {
    if (logo_file.size > 5 * 1024 * 1024) {
      return { error: 'Logo boyutu 5MB sınırını aşıyor.' };
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
    ea_club_name
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
    if (error.code === '23505') return { error: 'Bu slug zaten kullanımda.' };
    return { error: 'Takım güncellenemedi: ' + error.message };
  }

  // Garbage collection: clean up old logo from storage if changed or removed
  if ((new_logo_url || remove_logo) && oldLogoUrl && oldLogoUrl !== new_logo_url) {
    try {
      const parts = oldLogoUrl.split('/public/team-logos/');
      if (parts.length === 2) {
        await supabase.storage.from('team-logos').remove([parts[1]]);
      }
    } catch (cleanupErr) {
      console.error('Failed to cleanup old team logo:', cleanupErr);
    }
  }

  revalidatePath('/admin/teams');
  revalidatePath('/takimlar');
  revalidatePath('/', 'layout');
  return { success: 'Takım başarıyla güncellendi.' };
}

export async function updateTeamStatus(id: string, is_active: boolean) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('teams').update({ is_active }).eq('id', id);
  if (error) return { error: 'Durum güncellenemedi.' };

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
    .select('slug')
    .eq('id', teamId)
    .maybeSingle();

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
    .select('slug')
    .eq('id', teamId)
    .maybeSingle();

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
  
  if (file.size > 5 * 1024 * 1024) return { error: 'Dosya boyutu limitini aşıyor.' };
  
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
  const { data: oldTeam } = await supabase.from('teams').select('logo_url').eq('id', teamId).single();

  const { error: updateError } = await supabase.from('teams').update({ logo_url: data.publicUrl }).eq('id', teamId);
  if (updateError) return { error: "Takım logosu DB'ye kaydedilemedi." };

  // Garbage collection
  if (oldTeam?.logo_url && oldTeam.logo_url !== data.publicUrl) {
    try {
      const parts = oldTeam.logo_url.split('/public/team-logos/');
      if (parts.length === 2) {
        await supabase.storage.from('team-logos').remove([parts[1]]);
      }
    } catch (e) {
      console.error('Failed to cleanup old team logo:', e);
    }
  }

  revalidatePath('/', 'layout');
  return { success: 'Logo başarıyla yüklendi.' };
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

  // 5. Check if the team has any career history or historical records (matches, stats, fixtures, transfers, or memberships)
  const [
    { count: matchCount },
    { count: statCount },
    { count: fixtureCount },
    { count: transferCount },
    { count: membershipCount }
  ] = await Promise.all([
    supabase.from('matches').select('id', { count: 'exact', head: true }).or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`),
    supabase.from('match_player_stats').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
    supabase.from('fixtures').select('id', { count: 'exact', head: true }).or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`),
    supabase.from('transfers').select('id', { count: 'exact', head: true }).or(`from_team_id.eq.${teamId},to_team_id.eq.${teamId}`),
    supabase.from('team_memberships').select('id', { count: 'exact', head: true }).eq('team_id', teamId)
  ]);

  const hasCareerOrHistory = (matchCount && matchCount > 0) ||
                             (statCount && statCount > 0) ||
                             (fixtureCount && fixtureCount > 0) ||
                             (transferCount && transferCount > 0) ||
                             (membershipCount && membershipCount > 0);

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

    // Garbage collect team logo
    if (team.logo_url) {
      try {
        const parts = team.logo_url.split('/public/team-logos/');
        if (parts.length === 2) {
          await supabase.storage.from('team-logos').remove([parts[1]]);
        }
      } catch (cleanupErr) {
        console.error('Failed to cleanup team logo:', cleanupErr);
      }
    }

    successMsg = `"${team.name}" takımı başarıyla tamamen silindi.`;
  }

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

  if (logoWarning) {
    return { success: successMsg, warning: logoWarning };
  }

  return { success: successMsg };
}
