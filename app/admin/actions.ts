'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// Helper to check admin role
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

export async function createSeasonAction(prevState: any, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user))) {
    return { error: 'Yetkisiz erişim.' };
  }

  const name = formData.get('name') as string;
  const slug = formData.get('slug') as string;
  const status = formData.get('status') as string;
  const roster_min = parseInt(formData.get('roster_min') as string, 10);
  const roster_max = parseInt(formData.get('roster_max') as string, 10);

  if (!name || !slug) return { error: 'Ad ve Slug zorunludur.' };

  const { error } = await supabase.from('seasons').insert({
    name,
    slug,
    status: status || 'UPCOMING',
    roster_min: isNaN(roster_min) ? 7 : roster_min,
    roster_max: isNaN(roster_max) ? 30 : roster_max,
  });

  if (error) {
    if (error.code === '23505') return { error: 'Bu slug zaten kullanılıyor.' };
    return { error: error.message };
  }

  revalidatePath('/admin/seasons');
  return { success: 'Sezon başarıyla oluşturuldu.' };
}

export async function createLeagueAction(prevState: any, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const season_id = formData.get('season_id') as string;
  const name = formData.get('name') as string;
  const level = parseInt(formData.get('level') as string, 10);
  const status = formData.get('status') as string;

  if (!season_id || !name || isNaN(level)) return { error: 'Eksik veya hatalı bilgi.' };

  const { error } = await supabase.from('leagues').insert({
    season_id,
    name,
    level,
    status: status || 'UPCOMING'
  });

  if (error) {
    if (error.code === '23505') return { error: 'Bu sezonda aynı isimde veya seviyede lig zaten var.' };
    return { error: error.message };
  }

  revalidatePath('/admin/leagues');
  return { success: 'Lig başarıyla eklendi.' };
}





export async function createFixtureAction(prevState: any, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  const season_id = formData.get('season_id') as string;
  const league_id = formData.get('league_id') as string;
  const home_team_id = formData.get('home_team_id') as string;
  const away_team_id = formData.get('away_team_id') as string;
  const week_number = parseInt(formData.get('week_number') as string, 10);
  const scheduled_at = formData.get('scheduled_at') as string;

  if (!season_id || !league_id || !home_team_id || !away_team_id || isNaN(week_number) || !scheduled_at) {
    return { error: 'Eksik veya hatalı bilgi.' };
  }
  
  if (home_team_id === away_team_id) {
    return { error: 'Ev sahibi ve Deplasman takımı aynı olamaz.' };
  }

  const { error } = await supabase.from('fixtures').insert({
    season_id,
    league_id,
    week_number,
    home_team_id,
    away_team_id,
    scheduled_at: new Date(scheduled_at).toISOString(),
    created_by: user.id
  });

  if (error) {
    if (error.code === '23505') return { error: 'Bu fikstür (aynı takımlar, aynı lig/sezon) zaten var.' };
    return { error: error.message };
  }

  revalidatePath('/admin/fixtures');
  return { success: 'Fikstür başarıyla eklendi.' };
}


export async function adminCreateTeamAction(prevState: any, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  const name = formData.get('name') as string;
  const ea_club_id_str = formData.get('ea_club_id') as string;
  const logo_url = formData.get('logo_url') as string;

  if (!name || !ea_club_id_str) return { error: 'Takım adı ve EA Club ID zorunludur.' };

  const ea_club_id = parseInt(ea_club_id_str, 10);
  if (isNaN(ea_club_id)) return { error: 'Geçersiz EA Club ID.' };

  const slug = name.toLowerCase().trim().replace(/[\s\W-]+/g, '-');

  const { error } = await supabase.from('teams').insert({
    name,
    slug,
    ea_club_id,
    logo_url: logo_url || null,
    is_active: true
  });

  if (error) {
    if (error.code === '23505') return { error: 'Bu isim veya EA Club ID zaten kullanılıyor.' };
    return { error: error.message };
  }

  revalidatePath('/admin/teams');
  return { success: 'Takım başarıyla oluşturuldu.' };
}

export async function adminAssignCaptainAction(prevState: any, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  const user_id = formData.get('user_id') as string;
  const team_id = formData.get('team_id') as string;

  if (!user_id || !team_id) return { error: 'Kullanıcı ve Takım seçilmelidir.' };

  const { error } = await supabase.from('user_roles').insert({
    user_id,
    role: 'CAPTAIN',
    team_id,
    is_active: true,
    granted_by: user.id
  });

  if (error) {
    if (error.message.includes('already a captain')) return { error: 'Kullanıcı zaten bir takımın kaptanı.' };
    return { error: error.message };
  }

  revalidatePath('/admin/teams');
  return { success: 'Kaptan başarıyla atandı.' };
}



