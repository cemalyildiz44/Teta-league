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

export async function assignCaptain(team_id: string, user_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  if (!team_id || !user_id) return { error: 'Takım ve Kullanıcı seçilmelidir.' };

  // Deactivate old captains
  await supabase.from('user_roles')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('team_id', team_id)
    .eq('role', 'CAPTAIN');

  // Insert new captain
  const { error } = await supabase.from('user_roles').insert({
    user_id,
    role: 'CAPTAIN',
    team_id,
    is_active: true,
    granted_by: user.id
  });

  if (error) return { error: 'Kaptan atanamadı: ' + error.message };

  revalidatePath('/admin/teams');
  return { success: 'Kaptan başarıyla değiştirildi.' };
}

export async function addPlayerToTeam(team_id: string, player_id: string, league_id: string, season_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!team_id || !player_id || !league_id || !season_id) return { error: 'Eksik bilgi (Oyuncu, Lig, Sezon).' };

  // Check if active membership already exists
  const { data: existing } = await supabase.from('team_memberships')
    .select('id')
    .eq('team_id', team_id)
    .eq('player_id', player_id)
    .eq('league_id', league_id)
    .eq('season_id', season_id)
    .is('left_at', null)
    .maybeSingle();

  if (existing) return { error: 'Bu oyuncu zaten bu lige/sezona ekli durumda.' };

  const { error } = await supabase.from('team_memberships').insert({
    player_id,
    team_id,
    league_id,
    season_id
  });

  if (error) return { error: 'Oyuncu eklenemedi: ' + error.message };

  revalidatePath('/admin/teams');
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
