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

export async function createTransferWindow(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  const season_id = formData.get('season_id') as string;
  const name = (formData.get('name') as string || '').trim();
  const start_date_raw = formData.get('start_date') as string;
  const end_date_raw = formData.get('end_date') as string;
  const is_open = formData.get('is_open') === 'true' || formData.get('is_open') === 'on';

  if (!name) return { error: 'Pencere adı boş olamaz.' };
  if (!season_id) return { error: 'Sezon seçilmelidir.' };
  if (!start_date_raw || !end_date_raw) return { error: 'Başlangıç ve bitiş tarihleri zorunludur.' };

  const startDate = new Date(start_date_raw);
  const endDate = new Date(end_date_raw);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { error: 'Geçersiz tarih formatı.' };
  }

  if (endDate <= startDate) {
    return { error: 'Bitiş tarihi, başlangıç tarihinden sonra olmalıdır.' };
  }

  // Validate season exists
  const { data: season } = await supabase.from('seasons').select('id').eq('id', season_id).maybeSingle();
  if (!season) return { error: 'Seçilen sezon bulunamadı.' };

  const { error } = await supabase.from('transfer_windows').insert({
    season_id,
    name,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    is_open,
    created_by: user.id
  });

  if (error) {
    console.error('createTransferWindow error:', error);
    return { error: 'Transfer penceresi oluşturulamadı: ' + error.message };
  }

  revalidatePath('/admin/transfer-windows');
  revalidatePath('/takim/yonet');
  revalidatePath('/profil/transferler');
  return { success: 'Transfer penceresi başarıyla oluşturuldu.' };
}

export async function updateTransferWindow(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const id = formData.get('id') as string;
  const season_id = formData.get('season_id') as string;
  const name = (formData.get('name') as string || '').trim();
  const start_date_raw = formData.get('start_date') as string;
  const end_date_raw = formData.get('end_date') as string;
  const is_open = formData.get('is_open') === 'true' || formData.get('is_open') === 'on';

  if (!id) return { error: 'Pencere ID eksik.' };
  if (!name) return { error: 'Pencere adı boş olamaz.' };
  if (!season_id) return { error: 'Sezon seçilmelidir.' };
  if (!start_date_raw || !end_date_raw) return { error: 'Başlangıç ve bitiş tarihleri zorunludur.' };

  const startDate = new Date(start_date_raw);
  const endDate = new Date(end_date_raw);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { error: 'Geçersiz tarih formatı.' };
  }

  if (endDate <= startDate) {
    return { error: 'Bitiş tarihi, başlangıç tarihinden sonra olmalıdır.' };
  }

  const { error } = await supabase.from('transfer_windows').update({
    season_id,
    name,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    is_open,
    updated_at: new Date().toISOString()
  }).eq('id', id);

  if (error) {
    console.error('updateTransferWindow error:', error);
    return { error: 'Transfer penceresi güncellenemedi: ' + error.message };
  }

  revalidatePath('/admin/transfer-windows');
  revalidatePath('/takim/yonet');
  revalidatePath('/profil/transferler');
  return { success: 'Transfer penceresi başarıyla güncellendi.' };
}

export async function toggleTransferWindow(id: string, newIsOpen: boolean) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!id) return { error: 'Pencere ID eksik.' };

  const { error } = await supabase.from('transfer_windows').update({
    is_open: newIsOpen,
    updated_at: new Date().toISOString()
  }).eq('id', id);

  if (error) {
    console.error('toggleTransferWindow error:', error);
    return { error: 'Durum değiştirilemedi: ' + error.message };
  }

  revalidatePath('/admin/transfer-windows');
  revalidatePath('/takim/yonet');
  revalidatePath('/profil/transferler');
  return { success: `Transfer penceresi ${newIsOpen ? 'açıldı' : 'kapatıldı'}.` };
}

export async function deleteTransferWindow(id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!id) return { error: 'Pencere ID eksik.' };

  // Güvenlik Kontrolü: Bu pencereye bağlı transferler var mı?
  const { count, error: countError } = await supabase
    .from('transfers')
    .select('id', { count: 'exact', head: true })
    .eq('transfer_window_id', id);

  if (countError) {
    return { error: 'Bağlı transferler kontrol edilirken hata oluştu.' };
  }

  if (count && count > 0) {
    return {
      error: `Bu transfer penceresine bağlı ${count} adet transfer kaydı bulunmaktadır. Veri bütünlüğünün korunması için bu pencere silinemez.`
    };
  }

  const { error } = await supabase.from('transfer_windows').delete().eq('id', id);

  if (error) {
    if (error.code === '23503') {
      return { error: 'Bu transfer penceresine bağlı kayıtlar olduğu için silinemez.' };
    }
    return { error: 'Transfer penceresi silinemedi: ' + error.message };
  }

  revalidatePath('/admin/transfer-windows');
  revalidatePath('/takim/yonet');
  revalidatePath('/profil/transferler');
  return { success: 'Transfer penceresi başarıyla silindi.' };
}
