
'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function submitNightCupApplicationAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Giriş yapmanız gerekiyor.' };

  const tournament_id = formData.get('tournament_id') as string;
  const team_name = formData.get('team_name') as string;
  const profilesRaw = formData.get('profiles') as string;
  const image_file = formData.get('image_file') as File;

  if (!tournament_id || !team_name || !profilesRaw) return { error: 'Eksik bilgi.' };
  
  let profiles = [];
  try {
    profiles = JSON.parse(profilesRaw);
  } catch (e) {
    return { error: 'Geçersiz oyuncu listesi.' };
  }

  if (profiles.length !== 11) return { error: 'Night Cup kadrosu tam olarak 11 kişi olmalıdır.' };

  const uniqueProfiles = new Set(profiles);
  if (uniqueProfiles.size !== 11) return { error: 'Aynı oyuncuyu birden fazla kez seçemezsiniz.' };

  // Check if tournament is open
  const { data: tour } = await supabase.from('tournaments').select('*').eq('id', tournament_id).single();
  if (!tour || tour.type !== 'NIGHT_CUP') return { error: 'Geçersiz turnuva.' };
  
  if (!tour.is_registration_open) return { error: 'Bu turnuva için başvurular kapalı.' };
  
  const now = new Date();
  if (tour.registration_start && new Date(tour.registration_start) > now) return { error: 'Başvurular henüz başlamadı.' };
  if (tour.registration_end && new Date(tour.registration_end) < now) return { error: 'Başvuru süresi doldu.' };

  // Check if applicant already applied
  const { data: existingApp } = await supabase.from('tournament_applications').select('id').eq('tournament_id', tournament_id).eq('applicant_id', user.id).maybeSingle();
  if (existingApp) return { error: 'Bu turnuvaya zaten başvuru yaptınız.' };

  // Check quota if any
  if (tour.max_teams) {
    const { count } = await supabase.from('tournament_applications').select('id', { count: 'exact', head: true }).eq('tournament_id', tournament_id).neq('status', 'REJECTED');
    if (count !== null && count >= tour.max_teams) return { error: 'Kontenjan doldu.' };
  }

  // Upload logo
  let logo_url = null;
  if (image_file && image_file.size > 0) {
    if (image_file.size > 5 * 1024 * 1024) return { error: 'Logo boyutu 5MB limitini aşıyor.' };
    const ext = image_file.name.split('.').pop() || 'png';
    const fileName = `nc_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('team-logos').upload(fileName, image_file, { upsert: true });
    if (uploadError) return { error: 'Logo yüklenemedi: ' + uploadError.message };
    const { data } = supabase.storage.from('team-logos').getPublicUrl(fileName);
    logo_url = data.publicUrl;
  }

  const { data: appData, error: appError } = await supabase.from('tournament_applications').insert({
    tournament_id,
    applicant_id: user.id,
    team_name,
    logo_url
  }).select('id').single();

  if (appError) return { error: 'Başvuru oluşturulamadı: ' + appError.message };

  const playersToInsert = profiles.map((pId: string) => ({
    application_id: appData.id,
    profile_id: pId
  }));

  const { error: playersError } = await supabase.from('tournament_application_players').insert(playersToInsert);
  
  if (playersError) {
    await supabase.from('tournament_applications').delete().eq('id', appData.id);
    return { error: 'Kadro kaydedilemedi: ' + playersError.message };
  }

  revalidatePath('/turnuvalar');
  return { success: 'Başvurunuz başarıyla alındı.' };
}

