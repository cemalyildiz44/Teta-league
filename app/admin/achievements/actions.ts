'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logAdminAudit } from '@/lib/audit';

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

function parseSeasonInput(raw_season_value: string) {
  let final_season_id: string | null = null;
  let final_season_name: string | null = null;

  if (raw_season_value) {
    if (raw_season_value.startsWith('HISTORICAL:')) {
      final_season_id = null;
      final_season_name = raw_season_value.replace('HISTORICAL:', '').trim();
    } else {
      final_season_id = raw_season_value.trim();
      final_season_name = null;
    }
  }

  return { season_id: final_season_id, season_name: final_season_name };
}

function isValidTrophyImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // 1. Yerel proje asset yolu (relative path): Yalnızca izin verilen güvenli uzantılar
  if (/^\/assets\/achievements\/[a-zA-Z0-9_\-\.]+\.(png|webp|jpg|jpeg|svg)$/i.test(trimmed)) {
    return true;
  }

  // 2. Supabase Storage 'trophies' bucket URL doğrulaması
  try {
    const parsed = new URL(trimmed);

    // Yalnızca standart HTTP veya HTTPS protokolü (javascript:, data: engellenir)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }

    // Pathname kesinlikle /storage/v1/object/public/trophies/<dosya_adi> olmalı
    const expectedPathPrefix = '/storage/v1/object/public/trophies/';
    if (!parsed.pathname.startsWith(expectedPathPrefix)) {
      return false;
    }

    // Dosya adının geçerli karakterler içerdiğini doğrula (path traversal / injection engelleme)
    const filename = parsed.pathname.slice(expectedPathPrefix.length);
    if (!filename || !/^[a-zA-Z0-9_\-\.]+$/i.test(filename)) {
      return false;
    }

    // Host kontrolü: Projede yapılandırılmış Supabase hostu ile tam eşleşmeli
    const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const incomingHost = parsed.hostname.toLowerCase();

    if (configuredSupabaseUrl) {
      try {
        const configuredHost = new URL(configuredSupabaseUrl).hostname.toLowerCase();
        if (incomingHost === configuredHost) {
          return true;
        }
        // Yerel geliştirme / test desteği
        if (incomingHost === 'localhost' || incomingHost === '127.0.0.1') {
          return true;
        }
        return false;
      } catch {
        // Yapılandırma ayrıştırılamazsa fallback kontrolüne geç
      }
    }

    // Yedek kontrol: host .supabase.co veya localhost olmalıdır
    return incomingHost.endsWith('.supabase.co') || incomingHost === 'localhost' || incomingHost === '127.0.0.1';
  } catch {
    return false;
  }
}

async function safelyRemoveOrphanedTrophyImage(
  supabase: any,
  imageUrl: string | null | undefined,
  excludeTrophyId?: string
) {
  if (!imageUrl || typeof imageUrl !== 'string') return;
  const trimmed = imageUrl.trim();
  const expectedPathPrefix = '/storage/v1/object/public/trophies/';
  if (!trimmed.includes(expectedPathPrefix)) return;

  const parts = trimmed.split(expectedPathPrefix);
  const filePath = parts[1]?.split('?')[0]; // Query string varsa temizle
  if (!filePath) return;

  try {
    // 1. Başka bir kupa aynı görsel URL'sini kullanıyor mu kontrol et
    let query = supabase.from('trophies').select('id').eq('image_url', trimmed);
    if (excludeTrophyId) {
      query = query.neq('id', excludeTrophyId);
    }
    const { data: otherUsingSameImage, error: checkError } = await query.limit(1);

    if (checkError) {
      console.error('[safelyRemoveOrphanedTrophyImage] Referans kontrolü hatası:', checkError.message);
      return; // Kontrol sorgusu hata verirse veri kaybını önlemek için silme yapma
    }

    // 2. Eğer başka hiçbir kupa bu görseli kullanmıyorsa Storage'dan sil
    if (!otherUsingSameImage || otherUsingSameImage.length === 0) {
      const { error: removeError } = await supabase.storage.from('trophies').remove([filePath]);
      if (removeError) {
        console.error('[safelyRemoveOrphanedTrophyImage] Storage görsel silme hatası:', removeError.message);
      }
    }
  } catch (err: any) {
    console.error('[safelyRemoveOrphanedTrophyImage] Beklenmeyen hata:', err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DİNAMİK KUPA İŞLEMLERİ (CREATE, UPDATE, DELETE)
// ─────────────────────────────────────────────────────────────────────────────

export async function createTrophyAction(prevState: any, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz erişim.' };

    if (!(await checkAdmin(supabase, user))) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok. Sadece adminler kupa oluşturabilir.' };
    }

    const title = (formData.get('title') as string)?.trim();
    const description = (formData.get('description') as string)?.trim() || null;
    const category = (formData.get('category') as string)?.trim() || 'Özel Başarılar';
    const target_type = (formData.get('target_type') as string)?.trim() || 'PLAYER';
    const raw_season_value = (formData.get('season_id') as string) || '';
    const display_order = parseInt((formData.get('display_order') as string) || '0', 10);
    const imageUrl = (formData.get('image_url') as string)?.trim() || '';

    if (!title) {
      return { error: 'Kupa / başarı adı zorunludur.' };
    }

    if (!['PLAYER', 'TEAM', 'BOTH'].includes(target_type)) {
      return { error: 'Geçersiz kazanan türü seçildi.' };
    }

    if (!imageUrl) {
      return { error: 'Kupa görseli zorunludur. Lütfen bir görsel yükleyin veya görsel URL adresi girin.' };
    }

    if (!isValidTrophyImageUrl(imageUrl)) {
      return { error: 'Geçersiz kupa görseli URL biçimi. Görsel Supabase "trophies" bucket\'ına ait olmalıdır.' };
    }

    const { season_id, season_name } = parseSeasonInput(raw_season_value);

    const insertData: any = {
      title,
      description,
      image_url: imageUrl,
      category,
      target_type,
      display_order: isNaN(display_order) ? 0 : display_order,
      created_by: user.id
    };
    if (season_id) insertData.season_id = season_id;
    if (season_name) insertData.season_name = season_name;

    const { data: newTrophy, error } = await supabase
      .from('trophies')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      return { error: 'Kupa eklenirken hata oluştu: ' + error.message };
    }

    await logAdminAudit({
      action: 'TROPHY_CREATE',
      entity_type: 'trophies',
      entity_id: newTrophy.id,
      entity_label: title,
      description: `"${title}" kupası oluşturuldu (${category}, Hedef: ${target_type})`,
      new_data: insertData,
      actor_id: user.id,
    });

    revalidatePath('/admin/achievements');
    revalidatePath('/oyuncular');
    revalidatePath('/takimlar');
    return { success: 'Kupa başarıyla oluşturuldu.' };
  } catch (error: any) {
    return { error: 'Beklenmeyen hata: ' + error.message };
  }
}

export async function updateTrophyAction(id: string, prevState: any, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz erişim.' };

    if (!(await checkAdmin(supabase, user))) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok.' };
    }

    const title = (formData.get('title') as string)?.trim();
    const description = (formData.get('description') as string)?.trim() || null;
    const category = (formData.get('category') as string)?.trim() || 'Özel Başarılar';
    const target_type = (formData.get('target_type') as string)?.trim() || 'PLAYER';
    const raw_season_value = (formData.get('season_id') as string) || '';
    const display_order = parseInt((formData.get('display_order') as string) || '0', 10);
    const imageUrl = (formData.get('image_url') as string)?.trim() || '';

    if (!title) {
      return { error: 'Kupa / başarı adı zorunludur.' };
    }

    if (!['PLAYER', 'TEAM', 'BOTH'].includes(target_type)) {
      return { error: 'Geçersiz kazanan türü seçildi.' };
    }

    if (!imageUrl) {
      return { error: 'Kupa görseli zorunludur.' };
    }

    if (!isValidTrophyImageUrl(imageUrl)) {
      return { error: 'Geçersiz kupa görseli URL biçimi. Görsel Supabase "trophies" bucket\'ına ait olmalıdır.' };
    }

    const { season_id, season_name } = parseSeasonInput(raw_season_value);

    const updateData: any = {
      title,
      description,
      image_url: imageUrl,
      category,
      target_type,
      display_order: isNaN(display_order) ? 0 : display_order,
      season_id: season_id || null,
      season_name: season_name || null,
      updated_at: new Date().toISOString()
    };

    // 1. Mevcut kupayı oku (eski görsel URL'sini tespit etmek için)
    const { data: existingTrophy } = await supabase
      .from('trophies')
      .select('id, image_url')
      .eq('id', id)
      .maybeSingle();

    if (!existingTrophy) {
      return { error: 'Güncellenecek kupa bulunamadı.' };
    }

    const oldImageUrl = existingTrophy.image_url;

    // 2. Veritabanını güncelle
    const { error } = await supabase
      .from('trophies')
      .update(updateData)
      .eq('id', id);

    if (error) {
      return { error: 'Kupa güncellenirken hata oluştu: ' + error.message };
    }

    // 3. Audit log kaydet
    await logAdminAudit({
      action: 'TROPHY_UPDATE',
      entity_type: 'trophies',
      entity_id: id,
      entity_label: title,
      description: `"${title}" kupası güncellendi`,
      new_data: updateData,
      actor_id: user.id,
    });

    // 4. Görsel değiştiyse ve eski görsel sahipsiz kalıyorsa Storage'dan temizle
    if (oldImageUrl && oldImageUrl !== imageUrl) {
      await safelyRemoveOrphanedTrophyImage(supabase, oldImageUrl, id);
    }

    revalidatePath('/admin/achievements');
    revalidatePath('/oyuncular');
    revalidatePath('/takimlar');
    return { success: 'Kupa başarıyla güncellendi.' };
  } catch (error: any) {
    return { error: 'Beklenmeyen hata: ' + error.message };
  }
}

export async function deleteTrophyAction(id: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz erişim.' };

    if (!(await checkAdmin(supabase, user))) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok.' };
    }

    // 1. Silinecek kupayı oku
    const { data: targetTrophy } = await supabase
      .from('trophies')
      .select('id, title, image_url')
      .eq('id', id)
      .maybeSingle();

    if (!targetTrophy) {
      return { error: 'Silinecek kupa bulunamadı.' };
    }

    // 2. Önce veritabanından kupayı sil (başarısız olursa görsel kesinlikle silinmez)
    const { error } = await supabase.from('trophies').delete().eq('id', id);
    if (error) {
      return { error: 'Kupa silinirken hata oluştu: ' + error.message };
    }

    // 3. Audit log kaydet
    await logAdminAudit({
      action: 'TROPHY_DELETE',
      entity_type: 'trophies',
      entity_id: id,
      entity_label: targetTrophy?.title || 'Kupa',
      description: `"${targetTrophy?.title || id}" kupası silindi`,
      old_data: targetTrophy,
      actor_id: user.id,
    });

    // 4. Görseli yalnızca başka hiçbir kupa kullanmıyorsa Storage'dan temizle
    if (targetTrophy?.image_url) {
      await safelyRemoveOrphanedTrophyImage(supabase, targetTrophy.image_url, id);
    }

    revalidatePath('/admin/achievements');
    revalidatePath('/oyuncular');
    revalidatePath('/takimlar');
    return { success: 'Kupa silindi.' };
  } catch (error: any) {
    return { error: 'Beklenmeyen hata: ' + error.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. KAZANAN YÖNETİMİ (ADD / REMOVE WINNER)
// ─────────────────────────────────────────────────────────────────────────────

export async function addTrophyWinnerAction(prevState: any, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz erişim.' };

    if (!(await checkAdmin(supabase, user))) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok.' };
    }

    const trophy_id = formData.get('trophy_id') as string;
    const winner_type = (formData.get('winner_type') as string)?.trim() as 'PLAYER' | 'TEAM';
    const player_id = (formData.get('player_id') as string)?.trim() || null;
    const team_id = (formData.get('team_id') as string)?.trim() || null;
    const notes = (formData.get('notes') as string)?.trim() || null;

    if (!trophy_id) {
      return { error: 'Kupa ID zorunludur.' };
    }

    if (!['PLAYER', 'TEAM'].includes(winner_type)) {
      return { error: 'Geçersiz kazanan türü seçildi.' };
    }

    if (winner_type === 'PLAYER' && !player_id) {
      return { error: 'Lütfen bir oyuncu seçin.' };
    }

    if (winner_type === 'TEAM' && !team_id) {
      return { error: 'Lütfen bir takım seçin.' };
    }

    // Kupayı ve geçerli hedef türünü kontrol et
    const { data: trophy } = await supabase
      .from('trophies')
      .select('id, title, target_type')
      .eq('id', trophy_id)
      .maybeSingle();

    if (!trophy) {
      return { error: 'Kupa bulunamadı.' };
    }

    if (trophy.target_type !== 'BOTH' && trophy.target_type !== winner_type) {
      return { error: `Bu kupa yalnızca "${trophy.target_type === 'PLAYER' ? 'Oyuncu' : 'Takım'}" türü için tanımlanmıştır.` };
    }

    const insertData: any = {
      trophy_id,
      winner_type,
      notes,
      awarded_by: user.id,
      player_id: winner_type === 'PLAYER' ? player_id : null,
      team_id: winner_type === 'TEAM' ? team_id : null,
    };

    const { error } = await supabase.from('trophy_winners').insert(insertData);

    if (error) {
      if (error.code === '23505') {
        return { error: 'Bu kazanan zaten bu kupaya daha önce atanmış (Mükerrer Kayıt).' };
      }
      return { error: 'Kazanan eklenirken hata oluştu: ' + error.message };
    }

    // Audit log için hedef etiketi
    let label = 'Bilinmeyen';
    if (winner_type === 'PLAYER' && player_id) {
      const { data: p } = await supabase.from('profiles').select('username').eq('id', player_id).maybeSingle();
      label = p?.username ? `@${p.username}` : player_id;
    } else if (winner_type === 'TEAM' && team_id) {
      const { data: t } = await supabase.from('teams').select('name').eq('id', team_id).maybeSingle();
      label = t?.name || team_id;
    }

    await logAdminAudit({
      action: 'TROPHY_WINNER_ADD',
      entity_type: 'trophy_winners',
      entity_id: trophy_id,
      entity_label: `${trophy.title} -> ${label}`,
      description: `"${trophy.title}" kupasına kazanan olarak ${label} (${winner_type}) eklendi`,
      new_data: insertData,
      actor_id: user.id,
    });

    revalidatePath('/admin/achievements');
    revalidatePath('/oyuncular');
    revalidatePath('/takimlar');
    return { success: 'Kazanan başarıyla eklendi.' };
  } catch (error: any) {
    return { error: 'Beklenmeyen hata: ' + error.message };
  }
}

export async function removeTrophyWinnerAction(winner_id: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz erişim.' };

    if (!(await checkAdmin(supabase, user))) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok.' };
    }

    const { data: winnerRow } = await supabase
      .from('trophy_winners')
      .select('id, trophy_id, winner_type, player_id, team_id, trophy:trophies(title)')
      .eq('id', winner_id)
      .maybeSingle();

    const { error } = await supabase.from('trophy_winners').delete().eq('id', winner_id);
    if (error) {
      return { error: 'Kazanan kaldırılırken hata oluştu: ' + error.message };
    }

    await logAdminAudit({
      action: 'TROPHY_WINNER_REMOVE',
      entity_type: 'trophy_winners',
      entity_id: winner_id,
      entity_label: (winnerRow?.trophy as any)?.title || 'Kupa',
      description: `"${(winnerRow?.trophy as any)?.title || ''}" kupasından kazanan kaldırıldı`,
      old_data: winnerRow,
      actor_id: user.id,
    });

    revalidatePath('/admin/achievements');
    revalidatePath('/oyuncular');
    revalidatePath('/takimlar');
    return { success: 'Kazanan kaldırıldı.' };
  } catch (error: any) {
    return { error: 'Beklenmeyen hata: ' + error.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GERİYE DÖNÜK UYUMLULUK: ESKİ ACTIONS (DEPRECATED)
// ─────────────────────────────────────────────────────────────────────────────

export async function addAchievementAction(prevState: any, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz erişim.' };

    if (!(await checkAdmin(supabase, user))) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok.' };
    }

    const player_id = formData.get('player_id') as string;
    const achievement_type = formData.get('achievement_type') as string;
    const raw_season_value = (formData.get('season_id') as string) || '';
    const { season_id, season_name } = parseSeasonInput(raw_season_value);

    const match_id = formData.get('match_id') as string;
    const week_number = formData.get('week_number') ? parseInt(formData.get('week_number') as string, 10) : null;
    const month_number = formData.get('month_number') ? parseInt(formData.get('month_number') as string, 10) : null;

    if (!player_id || !achievement_type) {
      return { error: 'Oyuncu ve başarı türü zorunludur.' };
    }

    const insertData: any = {
      player_id,
      achievement_type,
      awarded_by: user.id
    };

    if (season_id) insertData.season_id = season_id;
    if (season_name) insertData.season_name = season_name;
    if (match_id) insertData.match_id = match_id;
    if (week_number) insertData.week_number = week_number;
    if (month_number) insertData.month_number = month_number;

    const { error } = await supabase.from('player_achievements').insert(insertData);
    if (error) {
      return { error: 'Başarı eklenirken hata oluştu: ' + error.message };
    }

    revalidatePath('/admin/achievements');
    revalidatePath('/oyuncular');
    return { success: 'Başarım eklendi.' };
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
