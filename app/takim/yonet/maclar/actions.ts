'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// Captain Security Check
async function getCaptainContext(supabase: any, user: any): Promise<{ teamId: string; seasonId: string; userId: string } | { error: string } | null> {
  if (!user) return null;

  // Check captain's profile status
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.status === 'BANNED') {
    return { error: 'Hesabınız yasaklanmıştır (BANLI). Kaptanlık işlemi yapamazsınız.' };
  }
  if (profile?.status === 'SUSPENDED' || profile?.is_active === false) {
    return { error: 'Hesabınız askıya alınmıştır. Kaptanlık işlemi yapamazsınız.' };
  }

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
  if ('error' in ctx) return { error: ctx.error };

  const fixture_id = (formData.get('fixture_id') as string)?.trim();
  const rawHomeScore = formData.get('home_score');
  const rawAwayScore = formData.get('away_score');
  const confirmed = formData.get('confirmed');

  // 1. Mandatory disciplinary confirmation
  if (confirmed !== 'true' && confirmed !== 'on') {
    return { error: 'Skor bildirimini tamamlamak için doğruluk ve disiplin onay kutucuğunu işaretlemelisiniz.' };
  }

  // 2. Score input validation
  if (!fixture_id || rawHomeScore === null || rawAwayScore === null || rawHomeScore === '' || rawAwayScore === '') {
    return { error: 'Lütfen ev sahibi ve deplasman skorlarını eksiksiz girin.' };
  }

  const home_score = Number(rawHomeScore);
  const away_score = Number(rawAwayScore);

  if (!Number.isInteger(home_score) || !Number.isInteger(away_score)) {
    return { error: 'Skorlar tam sayı olmalıdır.' };
  }

  if (home_score < 0 || away_score < 0) {
    return { error: 'Skorlar negatif bir sayı olamaz.' };
  }

  if (home_score > 50 || away_score > 50) {
    return { error: 'Girilen skor geçerli bir futbol skoru aralığında olmalıdır (en fazla 50).' };
  }

  // 3. Find and validate the fixture
  const { data: fixture } = await supabase
    .from('fixtures')
    .select('id, season_id, league_id, home_team_id, away_team_id, status, scheduled_at')
    .eq('id', fixture_id)
    .maybeSingle();

  if (!fixture) return { error: 'Fikstür bulunamadı.' };

  if (fixture.status !== 'SCHEDULED') {
    return { error: 'Bu maç tamamlanmış veya iptal edilmiş olduğu için skor girilemez.' };
  }

  // 4. Verify captain authorization for this fixture
  if (fixture.home_team_id !== ctx.teamId && fixture.away_team_id !== ctx.teamId) {
    return { error: 'Sadece kendi takımınızın maçlarına skor girebilirsiniz.' };
  }

  // 5. Check if a match already exists for this fixture (prevent duplicate/concurrent submissions)
  const { data: existingMatch } = await supabase
    .from('matches')
    .select('id')
    .eq('fixture_id', fixture_id)
    .maybeSingle();

  if (existingMatch) {
    return { error: 'Bu fikstür için zaten bir maç sonucu bildirilmiş.' };
  }

  // 6. Try Controlled RPC for atomic score submission and auto-recalculation
  const { data: rpcData, error: rpcError } = await supabase.rpc('submit_official_match_score', {
    p_fixture_id: fixture_id,
    p_home_score: home_score,
    p_away_score: away_score,
    p_confirmation_accepted: true,
  });

  let matchId = '';
  let isApproved = false;

  if (!rpcError && rpcData) {
    if (!rpcData.success) {
      return { error: rpcData.error || 'Skor kaydedilemedi.' };
    }
    matchId = rpcData.match_id;
    isApproved = true;
  } else {
    // Fallback: If RPC function does not exist in DB yet (e.g. before migration is run), perform safe manual insert
    const played_at = fixture.scheduled_at
      ? new Date(fixture.scheduled_at).toISOString()
      : new Date().toISOString();

    const { data: insertedMatch, error: insertErr } = await supabase.from('matches').insert({
      fixture_id,
      season_id: ctx.seasonId,
      league_id: fixture.league_id,
      home_team_id: fixture.home_team_id,
      away_team_id: fixture.away_team_id,
      home_score,
      away_score,
      source: 'MANUAL',
      status: 'PENDING_REVIEW',
      played_at,
      notes: 'Kaptan tarafından onaylı skor bildirimi.',
      screenshot_url: null,
      submitted_by: user!.id
    }).select('id').maybeSingle();

    if (insertErr) {
      if (insertErr.code === '23505' || insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')) {
        return { error: 'Bu fikstür için zaten bir maç skoru kaydedilmiş.' };
      }
      return { error: `Skor kaydedilemedi: ${insertErr.message}` };
    }
    matchId = insertedMatch?.id;
  }

  // 7. Invalidate caches
  revalidatePath('/takim/yonet/maclar');
  revalidatePath('/takim/yonet/maclar/yeni');
  revalidatePath('/ligler');
  revalidatePath('/');

  const successMessage = isApproved
    ? 'Maç skoru başarıyla kaydedildi, puan durumu ve fikstür güncellendi.'
    : 'Maç skoru kaydedildi ve incelemeye alındı.';

  return { success: successMessage, matchId };
}

export async function submitPlayerStatsAction(matchId: string, statsPayload: any[]) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  const ctx = await getCaptainContext(supabase, user);

  if (!ctx) return { error: 'Yetkisiz işlem. Kaptan yetkiniz yok.' };
  if ('error' in ctx) return { error: ctx.error };

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

    // Server-side check: player account status (SUSPENDED / BANNED)
    const { data: playerProfiles } = await supabase
      .from('profiles')
      .select('id, username, status, is_active')
      .in('id', submittedPlayerIds);

    const invalidPlayer = (playerProfiles || []).find(
      (p: any) => p.status === 'SUSPENDED' || p.status === 'BANNED' || p.is_active === false
    );

    if (invalidPlayer) {
      const statusLabel = invalidPlayer.status === 'BANNED' ? 'yasaklı (BANLI)' : 'askıda';
      return {
        error: `@${invalidPlayer.username || 'Bilinmeyen'} adlı oyuncunun hesabı ${statusLabel} olduğu için maç istatistiği kaydedilemez.`
      };
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
    if ('error' in ctx) return { error: ctx.error };

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
