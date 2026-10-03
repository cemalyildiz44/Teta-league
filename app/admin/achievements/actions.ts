'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

async function checkAdmin(supabase: any, user: any) {
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .single();
  return !!roleData;
}

export async function addAchievementAction(prevState: any, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz erişim.' };

    if (!(await checkAdmin(supabase, user))) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok. Sadece adminler başarim ekleyebilir.' };
    }

    const player_id = formData.get('player_id') as string;
    const achievement_type = formData.get('achievement_type') as string;
    const raw_season_value = (formData.get('season_id') as string) || '';
    
    // Historical vs Real DB Season separation
    let final_season_id: string | null = null;
    let final_season_name: string | null = null;

    if (raw_season_value) {
      if (raw_season_value.startsWith('HISTORICAL:')) {
        // Tarihsel sezon (Season 1–4): seasons tablosuna kayıt oluşturulmaz, etiket metni kaydedilir
        final_season_id = null;
        final_season_name = raw_season_value.replace('HISTORICAL:', '').trim();
      } else {
        // Gerçek DB sezonu (Season 5, 6 vb.): mevcut UUID sistemi aynen korunur
        final_season_id = raw_season_value.trim();
        final_season_name = null;
      }
    }

    // Opsiyonel alanlar
    const match_id = formData.get('match_id') as string;
    const week_number = formData.get('week_number') ? parseInt(formData.get('week_number') as string, 10) : null;
    const month_number = formData.get('month_number') ? parseInt(formData.get('month_number') as string, 10) : null;

    if (!player_id || !achievement_type) {
      return { error: 'Oyuncu ve başarı türü zorunludur.' };
    }

    const has_season = Boolean(final_season_id || final_season_name);

    if (achievement_type === 'BALLON_DOR' && !has_season) {
      return { error: 'Ballon d\'Or için sezon seçimi zorunludur.' };
    }

    if (achievement_type === 'TOTS' && !has_season) {
      return { error: 'TOTS için sezon seçimi zorunludur.' };
    }

    const insertData: any = {
      player_id,
      achievement_type,
      awarded_by: user.id
    };

    if (final_season_id) insertData.season_id = final_season_id;
    if (final_season_name) insertData.season_name = final_season_name;
    if (match_id) insertData.match_id = match_id;
    if (week_number) insertData.week_number = week_number;
    if (month_number) insertData.month_number = month_number;

    const { error } = await supabase.from('player_achievements').insert(insertData);

    if (error) {
      if (error.code === '23505') {
        if (achievement_type === 'BALLON_DOR') {
          return { error: 'Bu oyuncuya seçilen sezon için zaten Ballon d\'Or verilmiş (Mükerrer Kayıt).' };
        }
        if (achievement_type === 'TOTS') {
          return { error: 'Bu oyuncuya bu sezon için zaten TOTS başarısı verilmiş.' };
        }
        return { error: 'Bu oyuncu için belirtilen olayda (ör: aynı maç veya aynı hafta) bu başarı zaten daha önce verilmiş (Mükerrer Kayıt).' };
      }
      return { error: 'Başarı eklenirken hata oluştu: ' + error.message };
    }

    revalidatePath('/admin/achievements');
    revalidatePath('/oyuncular');
    return { success: 'Başarım başarıyla eklendi.' };
  } catch (error: any) {
    return { error: 'Beklenmeyen hata: ' + error.message };
  }
}

export async function deleteAchievementAction(id: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz erişim.' };

    if (!(await checkAdmin(supabase, user))) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok.' };
    }

    const { error } = await supabase.from('player_achievements').delete().eq('id', id);

    if (error) {
      return { error: 'Silinirken hata oluştu: ' + error.message };
    }

    revalidatePath('/admin/achievements');
    revalidatePath('/oyuncular');
    return { success: 'Başarım silindi.' };
  } catch (error: any) {
    return { error: 'Beklenmeyen hata: ' + error.message };
  }
}
