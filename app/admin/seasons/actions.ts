
'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logAdminAudit } from '@/lib/audit';

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

  const { data: createdSeason, error } = await supabase.from('seasons').insert({
    name, slug, status: status || 'UPCOMING', roster_min, roster_max
  }).select('id').maybeSingle();

  if (error) {
    if (error.code === '23505') return { error: 'Bu slug zaten kullanılıyor.' };
    return { error: 'Sezon oluşturulamadı: ' + error.message };
  }

  await logAdminAudit({
    action: 'CREATE_SEASON',
    entity_type: 'seasons',
    entity_id: createdSeason?.id || null,
    entity_label: name,
    new_data: { name, slug, status: status || 'UPCOMING', roster_min, roster_max },
    description: `"${name}" sezonu oluşturuldu.`,
    actor_id: user?.id
  });

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

  const { data: currentSeason } = await supabase.from('seasons').select('name, slug, roster_min, roster_max').eq('id', id).maybeSingle();

  const { error } = await supabase.from('seasons').update({
    name, slug, roster_min, roster_max
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') return { error: 'Bu slug zaten kullanılıyor.' };
    return { error: 'Sezon güncellenemedi.' };
  }

  await logAdminAudit({
    action: 'UPDATE_SEASON',
    entity_type: 'seasons',
    entity_id: id,
    entity_label: name,
    old_data: currentSeason,
    new_data: { name, slug, roster_min, roster_max },
    description: `"${name}" sezonu güncellendi.`,
    actor_id: user?.id
  });

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

  const { data: currentSeason } = await supabase.from('seasons').select('name, status').eq('id', id).maybeSingle();

  const { error } = await supabase.from('seasons').update({ status: newStatus }).eq('id', id);
  if (error) return { error: 'Durum güncellenemedi.' };

  await logAdminAudit({
    action: newStatus === 'ACTIVE' ? 'ACTIVATE_SEASON' : (newStatus === 'COMPLETED' ? 'DEACTIVATE_SEASON' : 'UPDATE_SEASON_STATUS'),
    entity_type: 'seasons',
    entity_id: id,
    entity_label: currentSeason?.name || id,
    old_data: { status: currentSeason?.status },
    new_data: { status: newStatus },
    description: `"${currentSeason?.name || id}" sezonunun durumu ${newStatus} olarak güncellendi.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/seasons');
  return { success: 'Sezon durumu başarıyla güncellendi.' };
}

export async function forceUpdateSeasonStatus(id: string, newStatus: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { data: currentSeason } = await supabase.from('seasons').select('name, status').eq('id', id).maybeSingle();

  if (newStatus === 'ACTIVE') {
    await supabase.from('seasons').update({ status: 'COMPLETED' }).eq('status', 'ACTIVE');
  }

  const { error } = await supabase.from('seasons').update({ status: newStatus }).eq('id', id);
  if (error) return { error: 'Durum güncellenemedi.' };

  await logAdminAudit({
    action: 'FORCE_UPDATE_SEASON_STATUS',
    entity_type: 'seasons',
    entity_id: id,
    entity_label: currentSeason?.name || id,
    old_data: { status: currentSeason?.status },
    new_data: { status: newStatus },
    description: `"${currentSeason?.name || id}" sezonunun durumu zorla ${newStatus} yapıldı (diğer aktif sezonlar tamamlandı).`,
    actor_id: user?.id
  });

  revalidatePath('/admin/seasons');
  return { success: 'Sezon başarıyla aktif edildi.' };
}

export async function deleteSeason(id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { data: currentSeason } = await supabase.from('seasons').select('name, slug').eq('id', id).maybeSingle();

  const { error } = await supabase.from('seasons').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') return { error: 'Bu sezon ilişkili veriler (lig, takım, vb.) içerdiği için silinemez.' };
    return { error: 'Silme işlemi başarısız.' };
  }

  await logAdminAudit({
    action: 'DELETE_SEASON',
    entity_type: 'seasons',
    entity_id: id,
    entity_label: currentSeason?.name || id,
    old_data: currentSeason,
    description: `"${currentSeason?.name || id}" sezonu silindi.`,
    actor_id: user?.id
  });

  revalidatePath('/admin/seasons');
  return { success: 'Sezon başarıyla silindi.' };
}

