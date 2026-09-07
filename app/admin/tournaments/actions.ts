
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
  const registration_start = formData.get('registration_start') as string;
  const registration_end = formData.get('registration_end') as string;
  const tournament_date = formData.get('tournament_date') as string;
  const description = formData.get('description') as string;
  const image_file = formData.get('image_file') as File;

  if (!name || !season_id) return { error: 'Eksik bilgi.' };

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

  const { error } = await supabase.from('tournaments').insert({
    season_id,
    name,
    type: 'NIGHT_CUP',
    max_teams: max_teams ? parseInt(max_teams, 10) : null,
    is_registration_open,
    registration_start: registration_start || null,
    registration_end: registration_end || null,
    tournament_date: tournament_date || null,
    description: description || null,
    image_url
  });

  if (error) return { error: 'Night Cup oluşturulamadı: ' + error.message };

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  return { success: 'Night Cup başarıyla oluşturuldu.' };
}

export async function updateNightCupApplicationStatusAction(application_id: string, status: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('tournament_applications').update({ status }).eq('id', application_id);
  
  if (error) return { error: 'Başvuru durumu güncellenemedi.' };
  
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

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  return { success: 'Night Cup kazananı kaydedildi.' };
}

export async function deleteTournamentAction(id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('tournaments').delete().eq('id', id);
  if (error) return { error: 'Turnuva silinemedi: ' + error.message };

  revalidatePath('/admin/tournaments');
  revalidatePath('/turnuvalar');
  return { success: 'Turnuva başarıyla silindi.' };
}

