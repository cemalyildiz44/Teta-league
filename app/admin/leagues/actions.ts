
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
  const image_file = formData.get('image_file') as File;

  if (!name || !season_id || isNaN(level)) return { error: 'Ad, Sezon ve Seviye zorunludur.' };
  if (level <= 0) return { error: 'Seviye pozitif olmalıdır.' };
  if (max_teams && max_teams <= 0) return { error: 'Kapasite pozitif olmalıdır.' };

  let image_url: string | null = null;
  let uploadedFileName: string | null = null;

  if (image_file && image_file.size > 0) {
    if (image_file.size > 5 * 1024 * 1024) {
      return { error: 'Görsel boyutu 5MB sınırını aşıyor.' };
    }
    const ext = image_file.name.split('.').pop() || 'webp';
    uploadedFileName = `league_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('league-images')
      .upload(uploadedFileName, image_file, {
        cacheControl: '31536000',
        upsert: true
      });

    if (uploadError) {
      return { error: 'Görsel yüklenemedi: ' + uploadError.message };
    }

    const { data: urlData } = supabase.storage
      .from('league-images')
      .getPublicUrl(uploadedFileName);
    image_url = urlData.publicUrl;
  }

  const insertPayload: any = {
    season_id,
    name,
    level,
    max_teams: isNaN(max_teams) ? null : max_teams,
    status: status || 'UPCOMING'
  };

  if (image_url) {
    insertPayload.image_url = image_url;
  }

  let { error } = await supabase.from('leagues').insert(insertPayload);

  if (error) {
    // Clean up uploaded image if DB insert failed
    if (uploadedFileName) {
      await supabase.storage.from('league-images').remove([uploadedFileName]);
    }
    if (error.code === '23505') return { error: 'Bu sezonda aynı isimde veya seviyede lig zaten var.' };
    return { error: 'Lig oluşturulamadı: ' + error.message };
  }

  revalidatePath('/admin/leagues');
  revalidatePath('/ligler');
  revalidatePath('/', 'layout');
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
  const image_file = formData.get('image_file') as File;
  const remove_image = formData.get('remove_image') === 'true';

  if (!id || !name || !season_id || isNaN(level)) return { error: 'Eksik bilgi.' };
  if (level <= 0) return { error: 'Seviye pozitif olmalıdır.' };

  let new_image_url: string | null = null;
  let uploadedFileName: string | null = null;

  if (image_file && image_file.size > 0) {
    if (image_file.size > 5 * 1024 * 1024) {
      return { error: 'Görsel boyutu 5MB sınırını aşıyor.' };
    }
    const ext = image_file.name.split('.').pop() || 'webp';
    uploadedFileName = `league_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('league-images')
      .upload(uploadedFileName, image_file, {
        cacheControl: '31536000',
        upsert: true
      });

    if (uploadError) {
      return { error: 'Görsel yüklenemedi: ' + uploadError.message };
    }

    const { data: urlData } = supabase.storage
      .from('league-images')
      .getPublicUrl(uploadedFileName);
    new_image_url = urlData.publicUrl;
  }

  // Fetch current league data for cleanup
  const { data: currentLeague } = await supabase
    .from('leagues')
    .select('image_url')
    .eq('id', id)
    .single();

  const oldImageUrl = currentLeague?.image_url;

  const updatePayload: any = {
    season_id,
    name,
    level,
    max_teams: isNaN(max_teams) ? null : max_teams
  };

  if (new_image_url) {
    updatePayload.image_url = new_image_url;
  } else if (remove_image) {
    updatePayload.image_url = null;
  }

  let { error } = await supabase.from('leagues').update(updatePayload).eq('id', id);

  if (error) {
    if (uploadedFileName) {
      await supabase.storage.from('league-images').remove([uploadedFileName]);
    }
    if (error.code === '23505') return { error: 'Bu sezonda aynı isimde veya seviyede lig zaten var.' };
    return { error: 'Lig güncellenemedi: ' + error.message };
  }

  // Garbage collection: clean up old image if changed or removed
  if ((new_image_url || remove_image) && oldImageUrl && oldImageUrl !== new_image_url) {
    try {
      const parts = oldImageUrl.split('/public/league-images/');
      if (parts.length === 2) {
        await supabase.storage.from('league-images').remove([parts[1]]);
      }
    } catch (cleanupErr) {
      console.error('Failed to cleanup old league image:', cleanupErr);
    }
  }

  revalidatePath('/admin/leagues');
  revalidatePath('/ligler');
  revalidatePath('/', 'layout');
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

  // Check if league_teams entry already exists (e.g. inactive)
  const { data: existingLT } = await supabase
    .from('league_teams')
    .select('id, is_active')
    .eq('league_id', league_id)
    .eq('season_id', season_id)
    .eq('team_id', team_id)
    .maybeSingle();

  if (existingLT) {
    if (existingLT.is_active) {
      return { error: 'Takım zaten bu sezon/lige eklenmiş.' };
    }
    // Reactivate if it was soft-deleted
    const { error: reactivateError } = await supabase
      .from('league_teams')
      .update({ is_active: true })
      .eq('id', existingLT.id);

    if (reactivateError) return { error: 'Takım tekrar lige eklenemedi: ' + reactivateError.message };

    revalidatePath('/admin/leagues');
    revalidatePath('/admin/teams');
    revalidatePath('/admin/fixtures');
    revalidatePath('/ligler');
    revalidatePath('/', 'layout');
    return { success: 'Takım lige başarıyla eklendi.' };
  }

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
  revalidatePath('/admin/teams');
  revalidatePath('/admin/fixtures');
  revalidatePath('/ligler');
  revalidatePath('/', 'layout');
  return { success: 'Takım lige başarıyla eklendi.' };
}

export async function removeTeamFromLeague(league_id: string, team_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!league_id || !team_id) return { error: 'Lig ve Takım bilgisi zorunludur.' };

  // 1. Check if the team has matches in this league
  const { count: matchCount } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', league_id)
    .or(`home_team_id.eq.${team_id},away_team_id.eq.${team_id}`);

  if (matchCount && matchCount > 0) {
    return { error: 'Bu takımın bu ligde oynanmış maçı bulunduğu için ligden çıkarılamaz. Önce maç kayıtlarını inceleyiniz.' };
  }

  // 2. Check if the team has fixtures in this league
  const { count: fixtureCount } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', league_id)
    .or(`home_team_id.eq.${team_id},away_team_id.eq.${team_id}`);

  if (fixtureCount && fixtureCount > 0) {
    return { error: 'Bu takımın bu ligde planlanmış fikstürü bulunduğu için ligden çıkarılamaz. Önce fikstürleri düzenlemelisiniz.' };
  }

  // 3. Try physical delete first; if blocked by player memberships (FK constraint), soft-delete
  const { error: deleteError } = await supabase.from('league_teams')
    .delete()
    .eq('league_id', league_id)
    .eq('team_id', team_id);

  if (deleteError) {
    if (deleteError.code === '23503') {
      // FK exists (e.g. team_memberships active roster). Soft-delete league_teams so players' memberships are not broken
      const { error: updateError } = await supabase.from('league_teams')
        .update({ is_active: false })
        .eq('league_id', league_id)
        .eq('team_id', team_id);

      if (updateError) {
        return { error: 'Takım ligden çıkarılamadı: ' + updateError.message };
      }
    } else {
      return { error: 'Takım çıkarılamadı: ' + deleteError.message };
    }
  }

  revalidatePath('/admin/leagues');
  revalidatePath('/admin/teams');
  revalidatePath('/admin/fixtures');
  revalidatePath('/ligler');
  revalidatePath('/', 'layout');
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

