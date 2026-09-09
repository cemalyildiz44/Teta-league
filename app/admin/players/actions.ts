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

// ════════════════════════════════════════════════════════════════
// LEGACY CAREER STATS (GRANULAR SEASON RECORDS)
// ════════════════════════════════════════════════════════════════

export interface PlayerLegacyCareerStat {
  id: string;
  player_id: string;
  season_name: string;
  league_name: string;
  team_id: string | null;
  team_name: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  rating_avg: number;
  clean_sheets: number;
  red_cards: number;
  market_value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

interface LegacyCareerValidatedData {
  season_name: string;
  league_name: string;
  team_id: string | null;
  team_name: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  rating_avg: number;
  clean_sheets: number;
  red_cards: number;
  market_value: number;
  notes: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function validateAndResolveLegacyCareerInput(
  supabase: any,
  formData: FormData
): Promise<{ data?: LegacyCareerValidatedData; error?: string }> {
  const rawSeason = formData.get('season_name');
  const rawLeague = formData.get('league_name');
  const rawTeamMode = formData.get('team_mode'); // 'EXISTING' or 'CUSTOM'
  const rawTeamId = formData.get('team_id');
  const rawCustomTeamName = formData.get('custom_team_name');

  const rawMatches = formData.get('matches_played');
  const rawWins = formData.get('wins');
  const rawDraws = formData.get('draws');
  const rawLosses = formData.get('losses');
  const rawGoals = formData.get('goals');
  const rawAssists = formData.get('assists');
  const rawRating = formData.get('rating_avg');
  const rawCleanSheets = formData.get('clean_sheets');
  const rawRedCards = formData.get('red_cards');
  const rawMarketValue = formData.get('market_value');
  const rawNotes = formData.get('notes');

  const season_name = typeof rawSeason === 'string' ? rawSeason.trim() : '';
  if (!season_name) {
    return { error: 'Sezon adı boş bırakılamaz.' };
  }
  if (season_name.length > 100) {
    return { error: 'Sezon adı 100 karakterden uzun olamaz.' };
  }

  const league_name = typeof rawLeague === 'string' ? rawLeague.trim() : '';
  if (!league_name) {
    return { error: 'Lig adı boş bırakılamaz.' };
  }
  if (league_name.length > 100) {
    return { error: 'Lig adı 100 karakterden uzun olamaz.' };
  }

  // Integer and non-negative checks
  const parsePositiveInt = (val: any, fieldName: string) => {
    const num = Number(val);
    if (isNaN(num) || !Number.isInteger(num) || num < 0) {
      return { err: `${fieldName} 0 veya daha büyük bir tam sayı olmalıdır.` };
    }
    return { val: num };
  };

  const pMatches = parsePositiveInt(rawMatches, 'Oynanan Maç');
  if (pMatches.err) return { error: pMatches.err };

  const pWins = parsePositiveInt(rawWins, 'Galibiyet');
  if (pWins.err) return { error: pWins.err };

  const pDraws = parsePositiveInt(rawDraws, 'Beraberlik');
  if (pDraws.err) return { error: pDraws.err };

  const pLosses = parsePositiveInt(rawLosses, 'Mağlubiyet');
  if (pLosses.err) return { error: pLosses.err };

  const pGoals = parsePositiveInt(rawGoals, 'Gol');
  if (pGoals.err) return { error: pGoals.err };

  const pAssists = parsePositiveInt(rawAssists, 'Asist');
  if (pAssists.err) return { error: pAssists.err };

  const pCleanSheets = parsePositiveInt(rawCleanSheets, 'Gol Yememe');
  if (pCleanSheets.err) return { error: pCleanSheets.err };

  const pRedCards = parsePositiveInt(rawRedCards, 'Kırmızı Kart');
  if (pRedCards.err) return { error: pRedCards.err };

  const pMarketValue = parsePositiveInt(rawMarketValue, 'Piyasa Değeri');
  if (pMarketValue.err) return { error: pMarketValue.err };

  const matches_played = pMatches.val!;
  const wins = pWins.val!;
  const draws = pDraws.val!;
  const losses = pLosses.val!;

  // Strict check: wins + draws + losses === matches_played
  if (wins + draws + losses !== matches_played) {
    return {
      error: `Sonuçlar toplamı (G: ${wins} + B: ${draws} + M: ${losses} = ${wins + draws + losses}) oynanan maç sayısına (${matches_played}) eşit olmalıdır.`
    };
  }

  // Rating 0.0 - 10.0
  const ratingNum = Number(rawRating);
  if (isNaN(ratingNum) || ratingNum < 0 || ratingNum > 10) {
    return { error: 'Ortalama rating 0.00 ile 10.00 arasında geçerli bir sayı olmalıdır.' };
  }
  const rating_avg = Math.round(ratingNum * 100) / 100;

  // Team resolution
  let team_id: string | null = null;
  let team_name = '';

  if (rawTeamMode === 'EXISTING' && rawTeamId) {
    const tid = String(rawTeamId).trim();
    if (!UUID_REGEX.test(tid)) {
      return { error: 'Geçersiz takım ID formatı.' };
    }
    // Re-fetch from DB (historical teams with is_active = false are also permitted)
    const { data: teamData, error: teamErr } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', tid)
      .maybeSingle();

    if (teamErr || !teamData) {
      return { error: 'Seçilen takım veritabanında bulunamadı.' };
    }

    team_id = teamData.id;
    team_name = teamData.name; // Forced server-side from teams.name
  } else {
    // Custom / historical team
    const customName = typeof rawCustomTeamName === 'string' ? rawCustomTeamName.trim() : '';
    if (!customName) {
      return { error: 'Özel takım seçildiğinde takım adı boş bırakılamaz.' };
    }
    if (customName.length > 80) {
      return { error: 'Takım adı 80 karakterden uzun olamaz.' };
    }
    team_id = null;
    team_name = customName;
  }

  const notes = typeof rawNotes === 'string' ? rawNotes.slice(0, 500).trim() : '';

  return {
    data: {
      season_name,
      league_name,
      team_id,
      team_name,
      matches_played,
      wins,
      draws,
      losses,
      goals: pGoals.val!,
      assists: pAssists.val!,
      rating_avg,
      clean_sheets: pCleanSheets.val!,
      red_cards: pRedCards.val!,
      market_value: pMarketValue.val!,
      notes
    }
  };
}

export async function addPlayerLegacyCareerAction(playerId: string, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Yetkisiz erişim. Lütfen giriş yapın.' };
    }

    const isAdmin = await checkAdmin(supabase, user);
    if (!isAdmin) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok. Yalnızca adminler legacy kariyer kaydı ekleyebilir.' };
    }

    if (!playerId || !UUID_REGEX.test(playerId)) {
      return { error: 'Geçerli bir oyuncu seçilmelidir (Geçersiz UUID).' };
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', playerId)
      .maybeSingle();

    if (profileErr || !profile) {
      return { error: 'Oyuncu profili bulunamadı.' };
    }

    const validation = await validateAndResolveLegacyCareerInput(supabase, formData);
    if (validation.error || !validation.data) {
      return { error: validation.error || 'Doğrulama hatası.' };
    }

    const input = validation.data;

    // Duplicate Check:
    let dupQuery = supabase
      .from('player_legacy_career_stats')
      .select('id')
      .eq('player_id', playerId)
      .eq('season_name', input.season_name)
      .is('deleted_at', null);

    if (input.team_id) {
      dupQuery = dupQuery.eq('team_id', input.team_id);
    } else {
      dupQuery = dupQuery.is('team_id', null).eq('team_name', input.team_name);
    }

    const { data: duplicateRecord } = await dupQuery.maybeSingle();
    if (duplicateRecord) {
      return { error: 'Bu oyuncu için belirtilen sezon ve takımda aktif bir legacy kariyer kaydı zaten mevcut.' };
    }

    const { error: insertErr } = await supabase
      .from('player_legacy_career_stats')
      .insert({
        player_id: playerId,
        season_name: input.season_name,
        league_name: input.league_name,
        team_id: input.team_id,
        team_name: input.team_name,
        matches_played: input.matches_played,
        wins: input.wins,
        draws: input.draws,
        losses: input.losses,
        goals: input.goals,
        assists: input.assists,
        rating_avg: input.rating_avg,
        clean_sheets: input.clean_sheets,
        red_cards: input.red_cards,
        market_value: input.market_value,
        notes: input.notes,
        created_by: user.id
      });

    if (insertErr) {
      console.error('Insert legacy career stat error:', insertErr);
      return { error: `Kayıt eklenemedi: ${insertErr.message}` };
    }

    revalidatePath('/admin/players');
    revalidatePath('/oyuncular');
    if (profile.username) {
      revalidatePath(`/oyuncular/${profile.username}`);
    }

    return { success: 'Eski kariyer sezon kaydı başarıyla eklendi.' };
  } catch (err: any) {
    console.error('Unexpected error in addPlayerLegacyCareerAction:', err);
    return { error: err.message || 'Beklenmeyen bir hata oluştu.' };
  }
}

export async function updatePlayerLegacyCareerAction(statId: string, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Yetkisiz erişim. Lütfen giriş yapın.' };
    }

    const isAdmin = await checkAdmin(supabase, user);
    if (!isAdmin) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok.' };
    }

    if (!statId || !UUID_REGEX.test(statId)) {
      return { error: 'Geçersiz kayıt kimliği (UUID).' };
    }

    const { data: existingStat, error: statErr } = await supabase
      .from('player_legacy_career_stats')
      .select('id, player_id, profiles(username)')
      .eq('id', statId)
      .is('deleted_at', null)
      .maybeSingle();

    if (statErr || !existingStat) {
      return { error: 'Güncellenecek aktif legacy kariyer kaydı bulunamadı.' };
    }

    const validation = await validateAndResolveLegacyCareerInput(supabase, formData);
    if (validation.error || !validation.data) {
      return { error: validation.error || 'Doğrulama hatası.' };
    }

    const input = validation.data;

    // Duplicate Check excluding current statId:
    let dupQuery = supabase
      .from('player_legacy_career_stats')
      .select('id')
      .eq('player_id', existingStat.player_id)
      .eq('season_name', input.season_name)
      .neq('id', statId)
      .is('deleted_at', null);

    if (input.team_id) {
      dupQuery = dupQuery.eq('team_id', input.team_id);
    } else {
      dupQuery = dupQuery.is('team_id', null).eq('team_name', input.team_name);
    }

    const { data: duplicateRecord } = await dupQuery.maybeSingle();
    if (duplicateRecord) {
      return { error: 'Bu oyuncu için belirtilen sezon ve takımda başka bir aktif legacy kaydı zaten var.' };
    }

    const { error: updateErr } = await supabase
      .from('player_legacy_career_stats')
      .update({
        season_name: input.season_name,
        league_name: input.league_name,
        team_id: input.team_id,
        team_name: input.team_name,
        matches_played: input.matches_played,
        wins: input.wins,
        draws: input.draws,
        losses: input.losses,
        goals: input.goals,
        assists: input.assists,
        rating_avg: input.rating_avg,
        clean_sheets: input.clean_sheets,
        red_cards: input.red_cards,
        market_value: input.market_value,
        notes: input.notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', statId);

    if (updateErr) {
      console.error('Update legacy career stat error:', updateErr);
      return { error: `Güncelleme başarısız: ${updateErr.message}` };
    }

    revalidatePath('/admin/players');
    revalidatePath('/oyuncular');
    const profileObj = existingStat.profiles as any;
    if (profileObj?.username) {
      revalidatePath(`/oyuncular/${profileObj.username}`);
    }

    return { success: 'Eski kariyer sezon kaydı başarıyla güncellendi.' };
  } catch (err: any) {
    console.error('Unexpected error in updatePlayerLegacyCareerAction:', err);
    return { error: err.message || 'Beklenmeyen bir hata oluştu.' };
  }
}

export async function deletePlayerLegacyCareerAction(statId: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Yetkisiz erişim. Lütfen giriş yapın.' };
    }

    const isAdmin = await checkAdmin(supabase, user);
    if (!isAdmin) {
      return { error: 'Bu işlemi yapmaya yetkiniz yok.' };
    }

    if (!statId || !UUID_REGEX.test(statId)) {
      return { error: 'Geçersiz kayıt kimliği (UUID).' };
    }

    const { data: existingStat, error: statErr } = await supabase
      .from('player_legacy_career_stats')
      .select('id, player_id, profiles(username)')
      .eq('id', statId)
      .is('deleted_at', null)
      .maybeSingle();

    if (statErr || !existingStat) {
      return { error: 'Silinecek aktif legacy kariyer kaydı bulunamadı.' };
    }

    // Soft delete strictly
    const { error: delErr } = await supabase
      .from('player_legacy_career_stats')
      .update({
        deleted_at: new Date().toISOString()
      })
      .eq('id', statId);

    if (delErr) {
      console.error('Soft delete legacy career stat error:', delErr);
      return { error: `Silme işlemi başarısız: ${delErr.message}` };
    }

    revalidatePath('/admin/players');
    revalidatePath('/oyuncular');
    const profileObj = existingStat.profiles as any;
    if (profileObj?.username) {
      revalidatePath(`/oyuncular/${profileObj.username}`);
    }

    return { success: 'Eski kariyer sezon kaydı başarıyla silindi (arşive alındı).' };
  } catch (err: any) {
    console.error('Unexpected error in deletePlayerLegacyCareerAction:', err);
    return { error: err.message || 'Beklenmeyen bir hata oluştu.' };
  }
}
