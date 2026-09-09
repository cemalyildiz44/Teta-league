'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// Captain Security Check
async function getCaptainContext(supabase: any, user: any) {
  if (!user) return null;
  const { data: role } = await supabase
    .from('user_roles')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .maybeSingle();
  if (!role || !role.team_id) return null;

  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'ACTIVE')
    .single();

  if (!activeSeason) return null;

  return { teamId: role.team_id, seasonId: activeSeason.id, userId: user.id };
}

export async function submitMatchAction(prevState: any, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  const ctx = await getCaptainContext(supabase, user);

  if (!ctx) return { error: 'Yetkisiz işlem. Kaptan yetkiniz yok.' };

  const fixture_id = formData.get('fixture_id') as string;
  const home_score = parseInt(formData.get('home_score') as string, 10);
  const away_score = parseInt(formData.get('away_score') as string, 10);
  const played_at = formData.get('played_at') as string;
  const notes = (formData.get('notes') as string)?.trim() || null;
  const screenshot_url = (formData.get('screenshot_url') as string)?.trim() || null;

  if (!fixture_id || isNaN(home_score) || isNaN(away_score) || !played_at) {
    return { error: 'Gerekli alanları doldurun.' };
  }

  // Find the fixture
  const { data: fixture } = await supabase
    .from('fixtures')
    .select('*')
    .eq('id', fixture_id)
    .single();

  if (!fixture) return { error: 'Fikstür bulunamadı.' };

  // Check if a match already exists for this fixture
  const { data: existingMatch } = await supabase
    .from('matches')
    .select('id')
    .eq('fixture_id', fixture_id)
    .maybeSingle();

  if (existingMatch) {
    return { error: 'Bu fikstür için zaten bir maç sonucu girilmiş.' };
  }

  // Verify the captain's team is part of the fixture
  if (fixture.home_team_id !== ctx.teamId && fixture.away_team_id !== ctx.teamId) {
    return { error: 'Sadece kendi takımınızın maçlarını girebilirsiniz.' };
  }

  // Insert match
  const { data: insertedMatch, error } = await supabase.from('matches').insert({
    fixture_id,
    season_id: ctx.seasonId,
    league_id: fixture.league_id,
    home_team_id: fixture.home_team_id,
    away_team_id: fixture.away_team_id,
    home_score,
    away_score,
    source: 'MANUAL',
    status: 'PENDING_REVIEW', // enforce_match_rules ensures this
    played_at: new Date(played_at).toISOString(),
    notes,
    screenshot_url,
    submitted_by: user!.id
  }).select('id').single();

  if (error) return { error: error.message };

  revalidatePath('/takim/yonet/maclar');
  return { success: 'Maç başarıyla gönderildi.', matchId: insertedMatch?.id };
}

export async function submitPlayerStatsAction(matchId: string, statsPayload: any[]) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  const ctx = await getCaptainContext(supabase, user);

  if (!ctx) return { error: 'Yetkisiz işlem. Kaptan yetkiniz yok.' };

  // Validate match
  const { data: match } = await supabase
    .from('matches')
    .select('id, status, home_team_id, away_team_id, season_id')
    .eq('id', matchId)
    .single();

  if (!match) return { error: 'Maç bulunamadı.' };
  if (match.status !== 'PENDING_REVIEW') return { error: 'Sadece inceleme bekleyen maçlara istatistik girilebilir.' };
  if (match.home_team_id !== ctx.teamId && match.away_team_id !== ctx.teamId) {
    return { error: 'Bu maç sizin takımınıza ait değil.' };
  }

  // 1. Foreign Player Stats Server-Side Check:
  // Validate that all submitted player_ids actually belong to the captain's active team roster for this season
  const submittedPlayerIds = (statsPayload || [])
    .filter(stat => stat.played !== false && stat.player_id)
    .map(stat => stat.player_id);

  if (submittedPlayerIds.length > 0) {
    const { data: validMemberships } = await supabase
      .from('team_memberships')
      .select('player_id')
      .eq('team_id', ctx.teamId)
      .eq('season_id', match.season_id)
      .is('left_at', null)
      .in('player_id', submittedPlayerIds);

    const validPlayerSet = new Set((validMemberships || []).map(m => m.player_id));
    const hasInvalidPlayer = submittedPlayerIds.some(id => !validPlayerSet.has(id));

    if (hasInvalidPlayer) {
      return { error: 'Takımınızın aktif kadrosunda yer almayan oyuncular için istatistik girilemez.' };
    }
  }

  // Format payload - only include players that actually participated
  const upsertData = (statsPayload || [])
    .filter(stat => stat.played !== false && stat.player_id)
    .map(stat => ({
      match_id: matchId,
      player_id: stat.player_id,
      team_id: ctx.teamId,
      position: stat.position || null,
      goals: Math.max(0, parseInt(stat.goals, 10) || 0),
      assists: Math.max(0, parseInt(stat.assists, 10) || 0),
      rating: stat.rating && Number(stat.rating) > 0 ? Math.min(10, Math.max(0, Number(stat.rating))) : null,
      shots: Math.max(0, parseInt(stat.shots, 10) || 0),
      passes_made: Math.max(0, parseInt(stat.passes_made, 10) || 0),
      pass_attempts: Math.max(0, parseInt(stat.pass_attempts, 10) || 0),
      tackles_made: Math.max(0, parseInt(stat.tackles_made, 10) || 0),
      tackle_attempts: Math.max(0, parseInt(stat.tackle_attempts, 10) || 0),
      saves: Math.max(0, parseInt(stat.saves, 10) || 0),
      goals_conceded: Math.max(0, parseInt(stat.goals_conceded, 10) || 0),
      cleansheets_gk: Math.max(0, parseInt(stat.cleansheets_gk, 10) || 0),
      cleansheets_def: Math.max(0, parseInt(stat.cleansheets_def, 10) || 0),
      red_cards: Math.max(0, parseInt(stat.red_cards, 10) || 0),
      is_mom: Boolean(stat.is_mom),
    }));

  // Clean old stats for this team in this match and insert new ones
  await supabase.from('match_player_stats').delete().eq('match_id', matchId).eq('team_id', ctx.teamId);

  if (upsertData.length > 0) {
    const { error } = await supabase.from('match_player_stats').insert(upsertData);
    if (error) return { error: error.message };
  }

  revalidatePath(`/takim/yonet/maclar/${matchId}`);
  revalidatePath('/takim/yonet/maclar');
  return { success: 'İstatistikler başarıyla kaydedildi.' };
}

export async function editMatchAction(matchId: string, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    const ctx = await getCaptainContext(supabase, user);

    // A) Kaptan kontrolü
    if (!ctx) return { error: 'Yetkisiz işlem. Kaptan yetkiniz yok.' };

    // B) matchId UUID kontrolü
    if (!matchId || typeof matchId !== 'string') {
      return { error: 'Geçersiz maç kimliği.' };
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(matchId)) {
      return { error: 'Geçersiz maç kimlik formatı.' };
    }

    // C) Maçı DB'den tekrar çek
    const { data: match, error: fetchErr } = await supabase
      .from('matches')
      .select('id, status, home_team_id, away_team_id, season_id')
      .eq('id', matchId)
      .maybeSingle();

    if (fetchErr || !match) {
      return { error: 'Maç bulunamadı.' };
    }

    // D) PENDING_REVIEW durum kontrolü (APPROVED maçlar düzenlenemez)
    if (match.status !== 'PENDING_REVIEW') {
      return { error: `Bu maç ${match.status} durumunda olduğu için düzenlenemez. Yalnızca inceleme bekleyen (PENDING_REVIEW) maçlar düzenlenebilir.` };
    }

    // E) Kaptanın takımı maçın ev sahibi veya deplasmanı mı?
    if (match.home_team_id !== ctx.teamId && match.away_team_id !== ctx.teamId) {
      return { error: 'Bu maçı düzenleme yetkiniz yok. Yalnızca kendi takımınızın maçlarını düzenleyebilirsiniz.' };
    }

    // F) Skor doğrulaması (negatif skor engeli)
    const rawHome = formData.get('home_score');
    const rawAway = formData.get('away_score');
    const home_score = parseInt(rawHome as string, 10);
    const away_score = parseInt(rawAway as string, 10);

    if (isNaN(home_score) || isNaN(away_score)) {
      return { error: 'Geçerli bir ev sahibi ve deplasman skoru giriniz.' };
    }

    if (home_score < 0 || away_score < 0) {
      return { error: 'Skorlar negatif bir sayı olamaz.' };
    }

    // G) Screenshot ve Notlar
    const screenshot_url = (formData.get('screenshot_url') as string)?.trim() || null;
    const notes = (formData.get('notes') as string)?.trim() || null;

    // H) Sadece izin verilen alanları update et
    const { error: updateErr } = await supabase
      .from('matches')
      .update({
        home_score,
        away_score,
        screenshot_url,
        notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', matchId);

    if (updateErr) {
      return { error: `Maç güncellenemedi: ${updateErr.message}` };
    }

    // J) Revalidate
    revalidatePath('/takim/yonet/maclar');
    revalidatePath(`/takim/yonet/maclar/${matchId}`);

    return { success: 'Maç skoru ve kanıt bilgileri başarıyla güncellendi.' };
  } catch (err: any) {
    console.error('editMatchAction error:', err);
    return { error: err.message || 'Beklenmeyen bir hata oluştu.' };
  }
}
