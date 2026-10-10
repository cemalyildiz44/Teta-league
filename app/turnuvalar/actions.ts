'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { formatTournamentDate } from '@/lib/date-utils';

const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5MB

function detectImageFormat(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (!buffer || buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }
  // WebP: "RIFF" at offset 0, "WEBP" at offset 8
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

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
      error: `Başvurular henüz başlamadı. Başlangıç tarihi: ${formatTournamentDate(tour.registration_start)}`
    };
  }

  if (tour.registration_end && new Date(tour.registration_end) < now) {
    return {
      error: `Başvuru süresi dolmuştur. Bitiş tarihi: ${formatTournamentDate(tour.registration_end)}`
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

  // 6. Safe Logo Upload (Strictly tournament-logos, isolated from official league teams)
  let logo_url: string | null = null;
  let uploadedStoragePath: string | null = null;

  if (image_file && image_file.size > 0) {
    if (image_file.size > MAX_LOGO_SIZE) {
      return { error: 'Logo görsel boyutu en fazla 5MB olabilir.' };
    }

    // Read file buffer and verify authentic image magic bytes
    const imageBuffer = Buffer.from(await image_file.arrayBuffer());
    const detectedFormat = detectImageFormat(imageBuffer);

    if (!detectedFormat) {
      return { error: 'Yalnızca geçerli JPEG, PNG veya WEBP formatında görsel yükleyebilirsiniz.' };
    }

    const normalizedExt = detectedFormat === 'jpeg' ? 'jpeg' : detectedFormat;
    const contentType = `image/${detectedFormat}`;

    // Storage path format: ${user.id}/nc_${Date.now()}_${random}.${ext} (required by RLS policy)
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileName = `${user.id}/nc_${Date.now()}_${randomSuffix}.${normalizedExt}`;

    const { error: uploadError } = await supabase.storage
      .from('tournament-logos')
      .upload(fileName, imageBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[Night Cup Logo Upload Error]:', uploadError);
      let errMsg = uploadError.message || 'Depolama hatası oluştu.';
      if (errMsg.toLowerCase().includes('row-level security') || errMsg.toLowerCase().includes('violates')) {
        errMsg = 'Logo yükleme izni reddedildi. Hesabınızın aktif durumda olduğundan emin olun.';
      } else if (errMsg.toLowerCase().includes('entity too large') || errMsg.toLowerCase().includes('file size')) {
        errMsg = 'Logo boyutu izin verilen sınırı aşıyor (Maksimum 5MB).';
      }
      return { error: `Logo yüklenemedi: ${errMsg}` };
    }

    uploadedStoragePath = fileName;
    const { data: urlData } = supabase.storage
      .from('tournament-logos')
      .getPublicUrl(fileName);

    logo_url = urlData.publicUrl;
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
    // Clean up uploaded orphan file if DB insert fails
    if (uploadedStoragePath) {
      try {
        await supabase.storage.from('tournament-logos').remove([uploadedStoragePath]);
      } catch (cleanErr) {
        console.error('[Night Cup Storage Cleanup Error]:', cleanErr);
      }
    }
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
      // Rollback application and cleanup orphan logo if player insert fails
      await supabase.from('tournament_applications').delete().eq('id', appData.id);
      if (uploadedStoragePath) {
        try {
          await supabase.storage.from('tournament-logos').remove([uploadedStoragePath]);
        } catch (cleanErr) {
          console.error('[Night Cup Storage Cleanup Error]:', cleanErr);
        }
      }
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

export async function captainAddPlayerToSquadAction(application_id: string, profile_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Kadro düzenlemek için giriş yapmanız gerekmektedir.' };
  }

  if (!application_id || !profile_id) {
    return { error: 'Geçersiz başvuru veya oyuncu kimliği.' };
  }

  // 1. Fetch application and tournament with deadline info
  const { data: app, error: appErr } = await supabase
    .from('tournament_applications')
    .select(`
      id,
      tournament_id,
      applicant_id,
      status,
      tournaments (
        id,
        registration_end,
        is_registration_open,
        status
      )
    `)
    .eq('id', application_id)
    .maybeSingle();

  if (appErr || !app) {
    return { error: 'Başvuru bulunamadı.' };
  }

  // 2. Authorization check - only the applicant captain can edit
  if (app.applicant_id !== user.id) {
    return { error: 'Bu takımın kadrosunu düzenleme yetkiniz yok.' };
  }

  if (app.status === 'CANCELLED' || app.status === 'REJECTED') {
    return { error: 'İptal edilmiş veya reddedilmiş başvuruların kadrosu düzenlenemez.' };
  }

  // 3. Strict Server-Side Deadline Check (Europe/Istanbul normalized)
  const tour: any = app.tournaments;
  if (!tour) {
    return { error: 'İlgili turnuva bulunamadı.' };
  }

  const now = new Date();
  if (tour.registration_end && new Date(tour.registration_end) < now) {
    return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };
  }

  if (!tour.is_registration_open || tour.status === 'COMPLETED' || tour.status === 'ARCHIVED') {
    return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };
  }

  // 4. Validate player profile exists and is eligible
  const { data: playerProfile, error: profErr } = await supabase
    .from('profiles')
    .select('id, username, status, is_active')
    .eq('id', profile_id)
    .maybeSingle();

  if (profErr || !playerProfile) {
    return { error: 'Seçilen oyuncu profili bulunamadı.' };
  }

  if (playerProfile.status === 'BANNED') {
    return { error: 'Bu oyuncu sistemden yasaklı olduğu için kadroya eklenemez.' };
  }
  if (playerProfile.status === 'SUSPENDED' || playerProfile.is_active === false) {
    return { error: 'Bu oyuncunun hesabı askıya alınmıştır.' };
  }

  // 5. Check if already in squad
  const { data: existing } = await supabase
    .from('tournament_application_players')
    .select('id')
    .eq('application_id', application_id)
    .eq('profile_id', profile_id)
    .maybeSingle();

  if (existing) {
    return { error: 'Bu oyuncu zaten kadroda yer alıyor.' };
  }

  // 6. Insert player into tournament_application_players only
  const { error: insertErr } = await supabase
    .from('tournament_application_players')
    .insert({
      application_id,
      profile_id
    });

  if (insertErr) {
    return { error: 'Oyuncu kadroya eklenemedi: ' + insertErr.message };
  }

  revalidatePath(`/turnuvalar/${app.tournament_id}`);
  revalidatePath('/turnuvalar');
  revalidatePath('/admin/tournaments');

  return { success: `@${playerProfile.username} kadroya eklendi.` };
}

export async function captainRemovePlayerFromSquadAction(application_id: string, profile_id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Kadro düzenlemek için giriş yapmanız gerekmektedir.' };
  }

  if (!application_id || !profile_id) {
    return { error: 'Geçersiz başvuru veya oyuncu kimliği.' };
  }

  // 1. Fetch application and tournament with deadline info
  const { data: app, error: appErr } = await supabase
    .from('tournament_applications')
    .select(`
      id,
      tournament_id,
      applicant_id,
      status,
      tournaments (
        id,
        registration_end,
        is_registration_open,
        status
      )
    `)
    .eq('id', application_id)
    .maybeSingle();

  if (appErr || !app) {
    return { error: 'Başvuru bulunamadı.' };
  }

  // 2. Authorization check - only the applicant captain can edit
  if (app.applicant_id !== user.id) {
    return { error: 'Bu takımın kadrosunu düzenleme yetkiniz yok.' };
  }

  if (app.status === 'CANCELLED' || app.status === 'REJECTED') {
    return { error: 'İptal edilmiş veya reddedilmiş başvuruların kadrosu düzenlenemez.' };
  }

  // 3. Strict Server-Side Deadline Check (Europe/Istanbul normalized)
  const tour: any = app.tournaments;
  if (!tour) {
    return { error: 'İlgili turnuva bulunamadı.' };
  }

  const now = new Date();
  if (tour.registration_end && new Date(tour.registration_end) < now) {
    return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };
  }

  if (!tour.is_registration_open || tour.status === 'COMPLETED' || tour.status === 'ARCHIVED') {
    return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };
  }

  // 4. Captain cannot remove themselves
  if (profile_id === app.applicant_id) {
    return { error: 'Takım kaptanı kadrodan çıkarılamaz.' };
  }

  // 5. Delete player from tournament_application_players only
  const { error: delErr } = await supabase
    .from('tournament_application_players')
    .delete()
    .eq('application_id', application_id)
    .eq('profile_id', profile_id);

  if (delErr) {
    return { error: 'Oyuncu kadrodan çıkarılamadı: ' + delErr.message };
  }

  revalidatePath(`/turnuvalar/${app.tournament_id}`);
  revalidatePath('/turnuvalar');
  revalidatePath('/admin/tournaments');

  return { success: 'Oyuncu kadrodan çıkarıldı.' };
}

