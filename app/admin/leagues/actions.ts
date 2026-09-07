
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

export async function createLeague(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const name = formData.get('name') as string;
  const season_id = formData.get('season_id') as string;
  const level = parseInt(formData.get('level') as string, 10);
  const max_teams = parseInt(formData.get('max_teams') as string, 10);
  const status = formData.get('status') as string;

  if (!name || !season_id || isNaN(level)) return { error: 'Ad, Sezon ve Seviye zorunludur.' };
  if (level <= 0) return { error: 'Seviye pozitif olmalıdır.' };
  if (max_teams && max_teams <= 0) return { error: 'Kapasite pozitif olmalıdır.' };

  const { error } = await supabase.from('leagues').insert({
    season_id,
    name,
    level,
    max_teams: isNaN(max_teams) ? null : max_teams,
    status: status || 'UPCOMING'
  });

  if (error) {
    if (error.code === '23505') return { error: 'Bu sezonda aynı isimde veya seviyede lig zaten var.' };
    return { error: 'Lig oluşturulamadı: ' + error.message };
  }
  revalidatePath('/admin/leagues');
  return { success: 'Lig başarıyla oluşturuldu.' };
}

export async function editLeague(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const id = formData.get('id') as string;
  const name = formData.get('name') as string;
  const season_id = formData.get('season_id') as string;
  const level = parseInt(formData.get('level') as string, 10);
  const max_teams = parseInt(formData.get('max_teams') as string, 10);

  if (!id || !name || !season_id || isNaN(level)) return { error: 'Eksik bilgi.' };
  if (level <= 0) return { error: 'Seviye pozitif olmalıdır.' };

  const { error } = await supabase.from('leagues').update({
    season_id,
    name,
    level,
    max_teams: isNaN(max_teams) ? null : max_teams
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') return { error: 'Bu sezonda aynı isimde veya seviyede lig zaten var.' };
    return { error: 'Lig güncellenemedi: ' + error.message };
  }
  revalidatePath('/admin/leagues');
  return { success: 'Lig başarıyla güncellendi.' };
}

export async function updateLeagueStatus(id: string, newStatus: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('leagues').update({ status: newStatus }).eq('id', id);
  if (error) return { error: 'Durum güncellenemedi.' };

  revalidatePath('/admin/leagues');
  return { success: 'Lig durumu başarıyla güncellendi.' };
}

export async function assignTeamToLeague(league_id: string, season_id: string, team_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!season_id || !league_id || !team_id) return { error: 'Tüm alanlar zorunludur.' };

  const { error } = await supabase.rpc('admin_assign_team_to_league', {
    p_league_id: league_id,
    p_season_id: season_id,
    p_team_id: team_id,
  });

  if (error) {
    if (error.message.includes('duplicate key value violates unique constraint') || error.code === '23505') {
      return { error: 'Takım zaten bu sezon/lige eklenmiş.' };
    }
    return { error: 'Takım eklenemedi: ' + error.message };
  }

  revalidatePath('/admin/leagues');
  return { success: 'Takım lige başarıyla eklendi.' };
}

export async function removeTeamFromLeague(league_id: string, team_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('league_teams')
    .delete()
    .eq('league_id', league_id)
    .eq('team_id', team_id);

  if (error) {
    if (error.code === '23503') return { error: 'Bu takımın ligde fikstür veya istatistik verisi olduğu için çıkarılamaz.' };
    return { error: 'Takım çıkarılamadı: ' + error.message };
  }

  revalidatePath('/admin/leagues');
  return { success: 'Takım ligden başarıyla çıkarıldı.' };
}

export async function saveLeagueRulesAction(league_id: string, rules: any) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!league_id) return { error: 'Lig ID zorunludur.' };

  const { error } = await supabase.from('leagues').update({ rules }).eq('id', league_id);
  if (error) return { error: 'Kurallar kaydedilemedi: ' + error.message };

  revalidatePath('/admin/leagues');
  revalidatePath('/', 'layout'); // Invalidate public layout since rules modal might be anywhere
  return { success: 'Lig kuralları başarıyla güncellendi.' };
}

