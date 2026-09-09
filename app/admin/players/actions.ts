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
    .maybeSingle();
  return !!roleData;
}

export interface BetaOldStatsPayload {
  matches_played: number;
  goals: number;
  assists: number;
  rating_avg: number;
  clean_sheets: number;
  red_cards: number;
  market_value: number;
  notes: string;
}

export async function updateBetaOldStatsAction(formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Yetkisiz erişim. Lütfen giriş yapın.' };
    }

    const isAdmin = await checkAdmin(supabase, user);
    if (!isAdmin) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok. Yalnızca adminler beta verilerini güncelleyebilir.' };
    }

    const playerId = formData.get('player_id') as string;
    if (!playerId || typeof playerId !== 'string') {
      return { error: 'Geçerli bir oyuncu seçilmelidir.' };
    }

    // UUID format doğrulaması
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(playerId)) {
      return { error: 'Geçersiz oyuncu kimliği (UUID).' };
    }

    // Kontrollü alanların server-side doğrulanması
    const rawMatches = formData.get('matches_played');
    const rawGoals = formData.get('goals');
    const rawAssists = formData.get('assists');
    const rawRating = formData.get('rating_avg');
    const rawCleanSheets = formData.get('clean_sheets');
    const rawRedCards = formData.get('red_cards');
    const rawMarketValue = formData.get('market_value');
    const rawNotes = formData.get('notes');

    // Negatif değer kontrolleri ve sınırlandırmalar
    const matches_played = Math.max(0, Math.floor(Number(rawMatches) || 0));
    const goals = Math.max(0, Math.floor(Number(rawGoals) || 0));
    const assists = Math.max(0, Math.floor(Number(rawAssists) || 0));
    
    // Rating 0.0 - 10.0 aralığı
    const parsedRating = Number(rawRating) || 0;
    const rating_avg = Math.min(10, Math.max(0, Math.round(parsedRating * 100) / 100));

    const clean_sheets = Math.max(0, Math.floor(Number(rawCleanSheets) || 0));
    const red_cards = Math.max(0, Math.floor(Number(rawRedCards) || 0));
    const market_value = Math.max(0, Math.floor(Number(rawMarketValue) || 0));
    
    // Not alanı (maksimum 500 karakter)
    const notes = typeof rawNotes === 'string' ? rawNotes.slice(0, 500).trim() : '';

    const payload: BetaOldStatsPayload & { updated_at: string; updated_by: string } = {
      matches_played,
      goals,
      assists,
      rating_avg,
      clean_sheets,
      red_cards,
      market_value,
      notes,
      updated_at: new Date().toISOString(),
      updated_by: user.id
    };

    // Oyuncunun mevcut kaydını kontrol et
    const { data: existingProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', playerId)
      .maybeSingle();

    if (profileErr || !existingProfile) {
      return { error: 'Oyuncu profili bulunamadı.' };
    }

    // JSONB alanını güncelle
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        beta_old_stats: payload,
        updated_at: new Date().toISOString()
      })
      .eq('id', playerId);

    if (updateErr) {
      console.error('Beta old stats update error:', updateErr);
      return { error: `Güncelleme başarısız: ${updateErr.message}` };
    }

    revalidatePath('/admin/players');
    revalidatePath('/oyuncular');
    if (existingProfile.username) {
      revalidatePath(`/oyuncular/${existingProfile.username}`);
    }

    return { success: `@${existingProfile.username} oyuncusunun Beta Dönemi Eski Kayıtları başarıyla güncellendi.` };
  } catch (err: any) {
    console.error('Beta old stats unexpected error:', err);
    return { error: err.message || 'Beklenmeyen bir hata oluştu.' };
  }
}
