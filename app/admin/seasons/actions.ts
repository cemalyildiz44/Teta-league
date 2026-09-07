
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

export async function createSeason(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const name = formData.get('name') as string;
  const slug = formData.get('slug') as string;
  const status = formData.get('status') as string;
  const roster_min = parseInt(formData.get('roster_min') as string, 10);
  const roster_max = parseInt(formData.get('roster_max') as string, 10);

  if (!name || !slug) return { error: 'Ad ve Slug boş olamaz.' };
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: 'Slug sadece küçük harf, sayı ve tire (-) içerebilir.' };
  if (roster_min <= 0 || roster_max <= 0) return { error: 'Kadro boyutları pozitif sayı olmalıdır.' };
  if (roster_max < roster_min) return { error: 'Maksimum kadro, minimum kadrodan küçük olamaz.' };

  const { error } = await supabase.from('seasons').insert({
    name, slug, status: status || 'UPCOMING', roster_min, roster_max
  });

  if (error) {
    if (error.code === '23505') return { error: 'Bu slug zaten kullanılıyor.' };
    return { error: 'Sezon oluşturulamadı: ' + error.message };
  }
  revalidatePath('/admin/seasons');
  return { success: 'Sezon başarıyla oluşturuldu.' };
}

export async function editSeason(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const id = formData.get('id') as string;
  const name = formData.get('name') as string;
  const slug = formData.get('slug') as string;
  const roster_min = parseInt(formData.get('roster_min') as string, 10);
  const roster_max = parseInt(formData.get('roster_max') as string, 10);

  if (!id || !name || !slug) return { error: 'Eksik bilgi.' };
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: 'Slug sadece küçük harf, sayı ve tire (-) içerebilir.' };
  if (roster_min <= 0 || roster_max <= 0) return { error: 'Kadro boyutları pozitif sayı olmalıdır.' };
  if (roster_max < roster_min) return { error: 'Maksimum kadro, minimum kadrodan küçük olamaz.' };

  const { error } = await supabase.from('seasons').update({
    name, slug, roster_min, roster_max
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') return { error: 'Bu slug zaten kullanılıyor.' };
    return { error: 'Sezon güncellenemedi.' };
  }
  revalidatePath('/admin/seasons');
  return { success: 'Sezon başarıyla güncellendi.' };
}

export async function updateSeasonStatus(id: string, newStatus: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (newStatus === 'ACTIVE') {
    const { data: activeSeasons } = await supabase.from('seasons').select('id').eq('status', 'ACTIVE');
    if (activeSeasons && activeSeasons.length > 0 && activeSeasons[0].id !== id) {
      return { error: 'Şu anda aktif bir sezon bulunuyor. Lütfen önce onu tamamlayın veya arşivleyin.' };
    }
  }

  const { error } = await supabase.from('seasons').update({ status: newStatus }).eq('id', id);
  if (error) return { error: 'Durum güncellenemedi.' };

  revalidatePath('/admin/seasons');
  return { success: 'Sezon durumu başarıyla güncellendi.' };
}

export async function forceUpdateSeasonStatus(id: string, newStatus: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (newStatus === 'ACTIVE') {
    await supabase.from('seasons').update({ status: 'COMPLETED' }).eq('status', 'ACTIVE');
  }

  const { error } = await supabase.from('seasons').update({ status: newStatus }).eq('id', id);
  if (error) return { error: 'Durum güncellenemedi.' };

  revalidatePath('/admin/seasons');
  return { success: 'Sezon başarıyla aktif edildi.' };
}

export async function deleteSeason(id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('seasons').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') return { error: 'Bu sezon ilişkili veriler (lig, takım, vb.) içerdiği için silinemez.' };
    return { error: 'Silme işlemi başarısız.' };
  }

  revalidatePath('/admin/seasons');
  return { success: 'Sezon başarıyla silindi.' };
}

