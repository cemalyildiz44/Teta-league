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

    if (!title) {
      return { error: 'Kupa / başarı adı zorunludur.' };
    }

    if (!['PLAYER', 'TEAM', 'BOTH'].includes(target_type)) {
      return { error: 'Geçersiz kazanan türü seçildi.' };
    }

    let imageUrl = (formData.get('image_url') as string)?.trim() || '';
    const imageFile = formData.get('image_file') as File | null;

    if (imageFile && imageFile.size > 0 && typeof imageFile.name === 'string') {
      if (imageFile.size > 5 * 1024 * 1024) {
        return { error: 'Görsel boyutu maksimum 5MB olabilir.' };
      }
      const allowedMime = ['image/webp', 'image/png', 'image/jpeg', 'image/jpg'];
      if (!allowedMime.includes(imageFile.type)) {
        return { error: 'Geçersiz görsel formatı. Sadece WebP, PNG veya JPEG yükleyebilirsiniz.' };
      }
      const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'webp';
      const filePath = `trophy_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const buffer = Buffer.from(await imageFile.arrayBuffer());

      const { error: uploadErr } = await supabase.storage.from('trophies').upload(filePath, buffer, {
        contentType: imageFile.type,
        cacheControl: '31536000',
        upsert: false
      });
      if (uploadErr) {
        return { error: 'Görsel yüklenirken hata oluştu: ' + uploadErr.message };
      }
      const { data: { publicUrl } } = supabase.storage.from('trophies').getPublicUrl(filePath);
      imageUrl = publicUrl;
    }

    if (!imageUrl) {
      return { error: 'Kupa görseli zorunludur. Lütfen bir görsel yükleyin veya görsel URL adresi girin.' };
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

    if (!title) {
      return { error: 'Kupa / başarı adı zorunludur.' };
    }

    let imageUrl = (formData.get('image_url') as string)?.trim() || '';
    const imageFile = formData.get('image_file') as File | null;

    if (imageFile && imageFile.size > 0 && typeof imageFile.name === 'string') {
      if (imageFile.size > 5 * 1024 * 1024) {
        return { error: 'Görsel boyutu maksimum 5MB olabilir.' };
      }
      const allowedMime = ['image/webp', 'image/png', 'image/jpeg', 'image/jpg'];
      if (!allowedMime.includes(imageFile.type)) {
        return { error: 'Geçersiz görsel formatı. Sadece WebP, PNG veya JPEG yükleyebilirsiniz.' };
      }
      const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'webp';
      const filePath = `trophy_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const buffer = Buffer.from(await imageFile.arrayBuffer());

      const { error: uploadErr } = await supabase.storage.from('trophies').upload(filePath, buffer, {
        contentType: imageFile.type,
        cacheControl: '31536000',
        upsert: false
      });
      if (uploadErr) {
        return { error: 'Görsel yüklenirken hata oluştu: ' + uploadErr.message };
      }
      const { data: { publicUrl } } = supabase.storage.from('trophies').getPublicUrl(filePath);
      imageUrl = publicUrl;
    }

    if (!imageUrl) {
      return { error: 'Kupa görseli zorunludur.' };
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

    const { error } = await supabase
      .from('trophies')
      .update(updateData)
      .eq('id', id);

    if (error) {
      return { error: 'Kupa güncellenirken hata oluştu: ' + error.message };
    }

    await logAdminAudit({
      action: 'TROPHY_UPDATE',
      entity_type: 'trophies',
      entity_id: id,
      entity_label: title,
      description: `"${title}" kupası güncellendi`,
      new_data: updateData,
      actor_id: user.id,
    });

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

    const { data: targetTrophy } = await supabase
      .from('trophies')
      .select('id, title, image_url')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase.from('trophies').delete().eq('id', id);
    if (error) {
      return { error: 'Kupa silinirken hata oluştu: ' + error.message };
    }

    await logAdminAudit({
      action: 'TROPHY_DELETE',
      entity_type: 'trophies',
      entity_id: id,
      entity_label: targetTrophy?.title || 'Kupa',
      description: `"${targetTrophy?.title || id}" kupası silindi`,
      old_data: targetTrophy,
      actor_id: user.id,
    });

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
