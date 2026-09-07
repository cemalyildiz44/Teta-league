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
  const logo_url = formData.get('logo_url') as string;
  const slugInput = formData.get('slug') as string;

  if (!name) return { error: 'Takım adı zorunludur.' };
  
  const ea_club_id = ea_club_id_str ? parseInt(ea_club_id_str, 10) : null;
  const slug = slugInput ? slugInput.toLowerCase().trim().replace(/[\s\W-]+/g, '-') : name.toLowerCase().trim().replace(/[\s\W-]+/g, '-');

  const { error } = await supabase.from('teams').insert({
    name,
    slug,
    ea_club_id,
    logo_url: logo_url || null,
    is_active: true
  });

  if (error) {
    if (error.code === '23505') return { error: 'Bu isimde veya slug ile bir takım zaten var.' };
    return { error: 'Takım oluşturulamadı: ' + error.message };
  }
  revalidatePath('/admin/teams');
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
  const logo_url = formData.get('logo_url') as string;
  const slugInput = formData.get('slug') as string;

  if (!id || !name || !slugInput) return { error: 'Eksik bilgi.' };

  const ea_club_id = ea_club_id_str ? parseInt(ea_club_id_str, 10) : null;
  const slug = slugInput.toLowerCase().trim().replace(/[\s\W-]+/g, '-');

  const { error } = await supabase.from('teams').update({
    name,
    slug,
    ea_club_id,
    logo_url: logo_url || null
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') return { error: 'Bu slug zaten kullanımda.' };
    return { error: 'Takım güncellenemedi: ' + error.message };
  }
  revalidatePath('/admin/teams');
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
  
  if (file.size > 5 * 1024 * 1024) return { error: 'Dosya boyutu 5MB limitini aşıyor.' };
  
  const ext = file.name.split('.').pop() || 'png';
  const fileName = `team_${teamId}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('team-logos')
    .upload(fileName, file, { upsert: true });

  if (uploadError) return { error: 'Logo yüklenirken hata oluştu: ' + uploadError.message };

  const { data } = supabase.storage.from('team-logos').getPublicUrl(fileName);

  const { error: updateError } = await supabase.from('teams').update({ logo_url: data.publicUrl }).eq('id', teamId);
  if (updateError) return { error: "Takım logosu DB'ye kaydedilemedi." };

  revalidatePath('/', 'layout');
  return { success: 'Logo başarıyla yüklendi.' };
}
