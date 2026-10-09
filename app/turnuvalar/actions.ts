'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function submitNightCupApplicationAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Başvuru yapabilmek için giriş yapmanız gerekmektedir.' };
  }

  // 1. Check user profile account status
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.status === 'BANNED') {
    return { error: 'Hesabınız sistem kurallarını ihlal ettiği için yasaklanmıştır (BANLI).' };
  }
  if (profile?.status === 'SUSPENDED' || profile?.is_active === false) {
    return { error: 'Hesabınız askıya alınmıştır. Başvuru yapamazsınız.' };
  }

  const tournament_id = formData.get('tournament_id') as string;
  const team_name = (formData.get('team_name') as string)?.trim();
  const profilesRaw = formData.get('profiles') as string;
  const image_file = formData.get('image_file') as File | null;

  if (!tournament_id || !team_name) {
    return { error: 'Turnuva kimliği ve takım adı zorunludur.' };
  }

  if (team_name.length < 2 || team_name.length > 60) {
    return { error: 'Takım adı 2 ile 60 karakter arasında olmalıdır.' };
  }

  // 2. Parse optional squad player profiles
  let profiles: string[] = [];
  if (profilesRaw && profilesRaw.trim()) {
    try {
      profiles = JSON.parse(profilesRaw);
    } catch {
      return { error: 'Geçersiz oyuncu listesi biçimi.' };
    }
  }

  if (!Array.isArray(profiles)) {
    profiles = [];
  }

  // Check unique players within the squad
  const uniqueProfiles = new Set(profiles);
  if (uniqueProfiles.size !== profiles.length) {
    return { error: 'Aynı oyuncuyu kadroya birden fazla kez ekleyemezsiniz.' };
  }

  // 3. Verify Tournament status, dates & quota
  const { data: tour, error: tourError } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournament_id)
    .maybeSingle();

  if (tourError || !tour || tour.type !== 'NIGHT_CUP') {
    return { error: 'Geçerli bir Night Cup turnuvası bulunamadı.' };
  }

  // Registration open check
  if (!tour.is_registration_open || (tour.status && (tour.status === 'COMPLETED' || tour.status === 'ARCHIVED'))) {
    return { error: 'Bu turnuva için başvurular kapalıdır.' };
  }

  const now = new Date();
  if (tour.registration_start && new Date(tour.registration_start) > now) {
    return {
      error: `Başvurular henüz başlamadı. Başlangıç tarihi: ${new Date(tour.registration_start).toLocaleString('tr-TR')}`
    };
  }

  if (tour.registration_end && new Date(tour.registration_end) < now) {
    return {
      error: `Başvuru süresi dolmuştur. Bitiş tarihi: ${new Date(tour.registration_end).toLocaleString('tr-TR')}`
    };
  }

  // 4. Duplicate application check for the same applicant in this tournament
  const { data: existingApp } = await supabase
    .from('tournament_applications')
    .select('id, status')
    .eq('tournament_id', tournament_id)
    .eq('applicant_id', user.id)
    .maybeSingle();

  if (existingApp) {
    const statusText =
      existingApp.status === 'APPROVED'
        ? 'Onaylandı'
        : existingApp.status === 'REJECTED'
        ? 'Reddedildi'
        : 'İnceleme Bekliyor';
    return { error: `Bu turnuvaya zaten bir başvurunuz bulunmaktadır. (Durum: ${statusText})` };
  }

  // 5. Quota check (exclude REJECTED and CANCELLED)
  if (tour.max_teams && tour.max_teams > 0) {
    const { count } = await supabase
      .from('tournament_applications')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournament_id)
      .not('status', 'in', '("REJECTED","CANCELLED")');

    if (count !== null && count >= tour.max_teams) {
      return { error: `Turnuvanın maksimum takım kontenjanı (${tour.max_teams}) dolmuştur.` };
    }
  }

  // 6. Safe Logo Upload
  let logo_url: string | null = null;
  if (image_file && image_file.size > 0) {
    if (image_file.size > MAX_LOGO_SIZE) {
      return { error: 'Logo görsel boyutu en fazla 5MB olabilir.' };
    }

    if (!ALLOWED_MIME_TYPES.includes(image_file.type)) {
      return { error: 'Yalnızca JPEG, PNG veya WEBP formatında logo yükleyebilirsiniz.' };
    }

    const ext = image_file.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `${user.id}/nc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

    // Try uploading to tournament-logos bucket first, fallback to team-logos
    let uploadSuccess = false;
    let uploadedBucket = 'tournament-logos';

    const { error: primaryUploadError } = await supabase.storage
      .from('tournament-logos')
      .upload(fileName, image_file, { cacheControl: '3600', upsert: true });

    if (!primaryUploadError) {
      uploadSuccess = true;
    } else {
      // Fallback attempt to team-logos if tournament-logos is not yet provisioned in remote DB
      const fallbackFileName = `nc_${user.id}_${Date.now()}.${ext}`;
      const { error: fallbackError } = await supabase.storage
        .from('team-logos')
        .upload(fallbackFileName, image_file, { cacheControl: '3600', upsert: true });

      if (!fallbackError) {
        uploadSuccess = true;
        uploadedBucket = 'team-logos';
        const { data: fbUrl } = supabase.storage.from('team-logos').getPublicUrl(fallbackFileName);
        logo_url = fbUrl.publicUrl;
      } else {
        return { error: 'Logo yüklenemedi: ' + (primaryUploadError.message || fallbackError.message) };
      }
    }

    if (uploadSuccess && !logo_url) {
      const { data } = supabase.storage.from(uploadedBucket).getPublicUrl(fileName);
      logo_url = data.publicUrl;
    }
  }

  // 7. Insert tournament application with PENDING status
  const { data: appData, error: appError } = await supabase
    .from('tournament_applications')
    .insert({
      tournament_id,
      applicant_id: user.id,
      team_name,
      logo_url,
      status: 'PENDING'
    })
    .select('id')
    .single();

  if (appError || !appData) {
    return { error: 'Başvuru kaydedilemedi: ' + (appError?.message || 'Bilinmeyen hata') };
  }

  // 8. Insert optional squad players if any selected
  if (profiles.length > 0) {
    const playersToInsert = profiles.map((pId: string) => ({
      application_id: appData.id,
      profile_id: pId
    }));

    const { error: playersError } = await supabase
      .from('tournament_application_players')
      .insert(playersToInsert);

    if (playersError) {
      // Rollback application if player insert fails
      await supabase.from('tournament_applications').delete().eq('id', appData.id);
      return { error: 'Kadro oyuncuları kaydedilemedi: ' + playersError.message };
    }
  }

  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${tournament_id}`);
  revalidatePath('/admin/tournaments');

  return {
    success: 'Başvurunuz başarıyla alındı. Yönetici onayının ardından takımınız turnuvaya dahil edilecektir.',
    applicationId: appData.id
  };
}

export async function cancelMyApplicationAction(applicationId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Giriş yapmanız gerekiyor.' };
  }

  const { data: app } = await supabase
    .from('tournament_applications')
    .select('id, tournament_id, applicant_id, status')
    .eq('id', applicationId)
    .maybeSingle();

  if (!app || app.applicant_id !== user.id) {
    return { error: 'Başvuru bulunamadı veya bu işlem için yetkiniz yok.' };
  }

  if (app.status !== 'PENDING') {
    return { error: 'Yalnızca inceleme aşamasındaki (bekleyen) başvurular iptal edilebilir.' };
  }

  const { error } = await supabase
    .from('tournament_applications')
    .delete()
    .eq('id', applicationId);

  if (error) {
    return { error: 'Başvuru iptal edilemedi: ' + error.message };
  }

  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${app.tournament_id}`);
  revalidatePath('/admin/tournaments');

  return { success: 'Başvurunuz iptal edildi.' };
}

// ==============================================================================
// PHASE 3: SUBMIT TOURNAMENT MATCH SCORE & PROOF
// ==============================================================================

const ALLOWED_SCREENSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024; // 5MB

export async function submitTournamentMatchScoreAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Authenticate user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Skor bildirimi yapabilmek için giriş yapmalısınız.' };
  }

  // Check active profile status
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, status, username')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status === 'SUSPENDED' || profile.status === 'BANNED') {
    return { error: 'Hesabınız askıya alındığı veya kısıtlandığı için işlem yapamazsınız.' };
  }

  // 2. Parse form data
  const match_id = formData.get('match_id') as string;
  const tournament_id = formData.get('tournament_id') as string;
  const home_score_raw = formData.get('home_score') as string;
  const away_score_raw = formData.get('away_score') as string;
  const goals_json = formData.get('goals_json') as string;
  const notes = (formData.get('notes') as string)?.trim() || null;
  const screenshot_file = formData.get('screenshot_file') as File | null;

  if (!match_id || !tournament_id) {
    return { error: 'Geçersiz maç veya turnuva bilgisi.' };
  }

  const home_score = parseInt(home_score_raw, 10);
  const away_score = parseInt(away_score_raw, 10);

  if (isNaN(home_score) || isNaN(away_score) || home_score < 0 || away_score < 0) {
    return { error: 'Skorlar 0 veya daha büyük bir tam sayı olmalıdır.' };
  }

  // 3. Fetch match and verify authorization
  const { data: match, error: matchError } = await supabase
    .from('tournament_matches')
    .select(`
      id,
      tournament_id,
      home_application_id,
      away_application_id,
      status,
      home:tournament_applications!home_application_id(id, team_name, applicant_id, status),
      away:tournament_applications!away_application_id(id, team_name, applicant_id, status)
    `)
    .eq('id', match_id)
    .maybeSingle();

  if (matchError || !match) {
    return { error: 'Maç bulunamadı.' };
  }

  if (match.tournament_id !== tournament_id) {
    return { error: 'Maç turnuva ile eşleşmiyor.' };
  }

  // Verify tournament is active and not finished/archived
  const { data: tour } = await supabase
    .from('tournaments')
    .select('id, status')
    .eq('id', tournament_id)
    .maybeSingle();

  if (tour && (tour.status === 'COMPLETED' || tour.status === 'ARCHIVED')) {
    return { error: 'Bu turnuva tamamlanmış veya arşivlenmiş olduğundan yeni skor bildirimi kabul edilmemektedir.' };
  }

  // Authorization: user must be the approved applicant of home or away team
  const isHomeApplicant = (match.home as any)?.applicant_id === user.id;
  const isAwayApplicant = (match.away as any)?.applicant_id === user.id;

  if (!isHomeApplicant && !isAwayApplicant) {
    return { error: 'Yalnızca bu maçta mücadele eden takımların onaylı temsilcileri sonuç bildirebilir.' };
  }

  const submitterTeamAppId = isHomeApplicant ? match.home_application_id : match.away_application_id;

  // Status check: must be SCHEDULED or REJECTED
  if (match.status === 'PENDING_REVIEW') {
    return { error: 'Bu maç için zaten inceleme bekleyen bir skor bildirimi bulunmaktadır.' };
  }

  if (match.status === 'APPROVED' || match.status === 'COMPLETED') {
    return { error: 'Bu maçın sonucu zaten onaylanmıştır. Yeni bildirim gönderilemez.' };
  }

  // 4. Validate goalscorers
  let goals: Array<{
    team_application_id: string;
    player_id?: string | null;
    player_name?: string | null;
    goals: number;
    is_own_goal?: boolean;
  }> = [];

  if (goals_json) {
    try {
      goals = JSON.parse(goals_json);
    } catch {
      return { error: 'Golcü bilgileri geçersiz formatta.' };
    }
  }

  // Sum goals for home and away
  const homeGoalsCount = goals
    .filter((g) => g.team_application_id === match.home_application_id)
    .reduce((sum, g) => sum + (Number(g.goals) || 0), 0);

  const awayGoalsCount = goals
    .filter((g) => g.team_application_id === match.away_application_id)
    .reduce((sum, g) => sum + (Number(g.goals) || 0), 0);

  if (homeGoalsCount !== home_score) {
    return {
      error: `Ev sahibi takımın skoru (${home_score}) ile bildirilen golcülerin toplam gol sayısı (${homeGoalsCount}) eşleşmiyor. Lütfen golcüleri kontrol ediniz.`
    };
  }

  if (awayGoalsCount !== away_score) {
    return {
      error: `Deplasman takımın skoru (${away_score}) ile bildirilen golcülerin toplam gol sayısı (${awayGoalsCount}) eşleşmiyor. Lütfen golcüleri kontrol ediniz.`
    };
  }

  // 5. Validate and upload screenshot proof
  if (!screenshot_file || screenshot_file.size === 0) {
    return { error: 'Maç sonucu kanıtı için ekran görüntüsü yüklenmesi zorunludur.' };
  }

  if (screenshot_file.size > MAX_SCREENSHOT_SIZE) {
    return { error: 'Ekran görüntüsü boyutu 5MB limitini aşıyor.' };
  }

  if (!ALLOWED_SCREENSHOT_TYPES.includes(screenshot_file.type)) {
    return { error: 'Geçersiz dosya formatı. Yalnızca JPEG, PNG veya WEBP yükleyebilirsiniz.' };
  }

  const ext = screenshot_file.name.split('.').pop() || 'png';
  const fileName = `${user.id}_${Date.now()}.${ext}`;
  const filePath = `${tournament_id}/${match_id}/${fileName}`;

  // Try tournament-proofs bucket first, fallback if bucket not created
  let screenshot_url = '';
  let uploadErr = null;

  const { error: proofErr } = await supabase.storage
    .from('tournament-proofs')
    .upload(filePath, screenshot_file, { upsert: true });

  if (!proofErr) {
    const { data } = supabase.storage.from('tournament-proofs').getPublicUrl(filePath);
    screenshot_url = data.publicUrl;
  } else {
    // Fallback attempt to tournament-logos bucket
    const fbPath = `proofs_${user.id}_${Date.now()}.${ext}`;
    const { error: fbErr } = await supabase.storage
      .from('tournament-logos')
      .upload(fbPath, screenshot_file, { upsert: true });

    if (fbErr) {
      return { error: 'Ekran görüntüsü yüklenemedi: ' + proofErr.message };
    }
    const { data } = supabase.storage.from('tournament-logos').getPublicUrl(fbPath);
    screenshot_url = data.publicUrl;
  }

  // 6. Insert into tournament_match_submissions
  // Clean up any old rejected submission for this match if re-submitting
  await supabase
    .from('tournament_match_submissions')
    .delete()
    .eq('match_id', match_id)
    .eq('status', 'REJECTED');

  const { data: submission, error: subError } = await supabase
    .from('tournament_match_submissions')
    .insert({
      tournament_id,
      match_id,
      submitted_by: user.id,
      submitted_team_application_id: submitterTeamAppId,
      home_score,
      away_score,
      screenshot_url,
      notes,
      status: 'PENDING_REVIEW',
    })
    .select('id')
    .single();

  if (subError || !submission) {
    return { error: 'Maç bildirimi kaydedilemedi: ' + subError?.message };
  }

  // 7. Insert goalscorers into tournament_match_goals
  if (goals.length > 0) {
    const goalsPayload = goals.map((g) => ({
      submission_id: submission.id,
      match_id,
      tournament_id,
      team_application_id: g.team_application_id,
      player_id: g.player_id || null,
      player_name: g.player_name || null,
      goals: Number(g.goals) || 1,
      is_own_goal: Boolean(g.is_own_goal),
    }));

    const { error: goalsErr } = await supabase
      .from('tournament_match_goals')
      .insert(goalsPayload);

    if (goalsErr) {
      // Rollback submission
      await supabase.from('tournament_match_submissions').delete().eq('id', submission.id);
      return { error: 'Golcüler kaydedilemedi: ' + goalsErr.message };
    }
  }

  // 8. Update tournament_matches status to PENDING_REVIEW
  await supabase
    .from('tournament_matches')
    .update({
      status: 'PENDING_REVIEW',
      home_score,
      away_score,
      screenshot_url,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', match_id);

  revalidatePath('/turnuvalar');
  revalidatePath(`/turnuvalar/${tournament_id}`);
  revalidatePath('/admin/tournaments');

  return {
    success: 'Skor bildirimi ve kanıt ekran görüntüsü başarıyla gönderildi. Yönetici onayının ardından sonuç puan tablosuna yansıtılacaktır.'
  };
}

