'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  STARTING_LINEUP_COUNT,
  getRequiredLineupCount,
  validateStartingLineupAndStats,
  validateTeamMatchReportSubmission,
  type ExistingTeamReportSummary,
  type ReportPlayerStatInput,
  type ReportPosition,
} from '@/lib/match-reporting';

// Captain Security Check
async function getCaptainContext(
  supabase: any,
  user: any
): Promise<{ teamId: string; seasonId: string; userId: string } | { error: string } | null> {
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
    .is('revoked_at', null)
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

function normalizePlayerStatsArray(rawPlayers: any[]): ReportPlayerStatInput[] {
  if (!Array.isArray(rawPlayers)) return [];
  const validPositions = new Set(['GK', 'DEF', 'MID', 'FWD']);

  return rawPlayers
    .filter((p) => p && p.played !== false && typeof p.player_id === 'string' && p.player_id.trim())
    .map((p) => {
      const pos = String(p.position || 'MID').toUpperCase();
      const position: ReportPosition = validPositions.has(pos) ? (pos as ReportPosition) : 'MID';
      const parsedRating =
        p.rating !== null && p.rating !== undefined && String(p.rating).trim() !== ''
          ? Number(p.rating)
          : null;

      return {
        player_id: String(p.player_id).trim(),
        position,
        goals: Math.max(0, parseInt(String(p.goals ?? 0), 10) || 0),
        assists: Math.max(0, parseInt(String(p.assists ?? 0), 10) || 0),
        rating:
          parsedRating !== null && !Number.isNaN(parsedRating) && parsedRating > 0
            ? Math.min(10, Math.max(0, parsedRating))
            : null,
        shots: Math.max(0, parseInt(String(p.shots ?? 0), 10) || 0),
        passes_made: Math.max(0, parseInt(String(p.passes_made ?? 0), 10) || 0),
        pass_attempts: Math.max(0, parseInt(String(p.pass_attempts ?? 0), 10) || 0),
        tackles_made: Math.max(0, parseInt(String(p.tackles_made ?? 0), 10) || 0),
        tackle_attempts: Math.max(0, parseInt(String(p.tackle_attempts ?? 0), 10) || 0),
        saves: Math.max(0, parseInt(String(p.saves ?? 0), 10) || 0),
        goals_conceded: Math.max(0, parseInt(String(p.goals_conceded ?? 0), 10) || 0),
        cleansheets_gk: Math.max(0, parseInt(String(p.cleansheets_gk ?? 0), 10) || 0),
        cleansheets_def: Math.max(0, parseInt(String(p.cleansheets_def ?? 0), 10) || 0),
        yellow_cards: Math.max(0, parseInt(String(p.yellow_cards ?? 0), 10) || 0),
        red_cards: Math.max(0, parseInt(String(p.red_cards ?? 0), 10) || 0),
        minutes_played: 90,
        is_mom: Boolean(p.is_mom),
      };
    });
}

export async function submitMatchAction(prevState: any, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getCaptainContext(supabase, user);

  if (!ctx) return { error: 'Yetkisiz işlem. Kaptan yetkiniz yok.' };
  if ('error' in ctx) return { error: ctx.error };

  const fixture_id = (formData.get('fixture_id') as string)?.trim();
  const home_score = parseInt(formData.get('home_score') as string, 10);
  const away_score = parseInt(formData.get('away_score') as string, 10);
  const played_at = (formData.get('played_at') as string)?.trim();
  const notes = (formData.get('notes') as string)?.trim() || null;
  const screenshot_url = (formData.get('screenshot_url') as string)?.trim() || null;
  const players_json = (formData.get('players_json') as string)?.trim() || null;

  if (!fixture_id || isNaN(home_score) || isNaN(away_score) || !played_at) {
    return { error: 'Gerekli alanları doldurun.' };
  }

  // Find the fixture
  const { data: fixture } = await supabase
    .from('fixtures')
    .select('*')
    .eq('id', fixture_id)
    .maybeSingle();

  if (!fixture) return { error: 'Fikstür bulunamadı.' };

  // Verify the captain's team is part of the fixture
  if (fixture.home_team_id !== ctx.teamId && fixture.away_team_id !== ctx.teamId) {
    return { error: 'Sadece kendi takımınızın maçlarını girebilirsiniz.' };
  }

  // Rule 2: COMPLETED, POSTPONED, CANCELLED, FORFEITED fixtures are strictly closed to captain reporting
  if (fixture.status !== 'SCHEDULED') {
    return {
      error:
        fixture.status === 'COMPLETED'
          ? 'Tamamlanmış (COMPLETED) fikstürler kaptan raporlamasına kapalıdır.'
          : 'Yalnızca henüz oynanmamış (SCHEDULED) fikstürler için maç raporu gönderilebilir.',
    };
  }

  const seasonIdForCheck = fixture.season_id || ctx.seasonId;

  // Check existing match and existing team reports for this fixture
  const [{ data: existingMatch }, { data: existingReportsData }] = await Promise.all([
    supabase
      .from('matches')
      .select('id, status, source, submitted_by, home_score, away_score')
      .eq('fixture_id', fixture_id)
      .maybeSingle(),
    supabase
      .from('match_team_reports')
      .select('id, team_id, home_score, away_score, status, is_stats_applied')
      .eq('fixture_id', fixture_id),
  ]);

  // Rule 2: APPROVED, CANCELLED, AUTO (EA imported), or FORFEIT matches are strictly closed
  if (
    existingMatch &&
    (existingMatch.status === 'APPROVED' ||
      existingMatch.status === 'CANCELLED' ||
      existingMatch.source === 'AUTO' ||
      existingMatch.source === 'FORFEIT')
  ) {
    return {
      error:
        'Onaylanmış (APPROVED) veya geçmişte oynanmış maçlar kaptan raporlamasına kapalıdır.',
    };
  }

  let myTeamHasSavedStats = false;
  if (existingMatch?.id) {
    const { count } = await supabase
      .from('match_player_stats')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', existingMatch.id)
      .eq('team_id', ctx.teamId);
    myTeamHasSavedStats = (count || 0) > 0;
  }

  if (myTeamHasSavedStats) {
    return {
      error: 'Bu maç için takımınızın oyuncu istatistikleri zaten işlenmiştir.',
    };
  }

  const existingReports: ExistingTeamReportSummary[] = (existingReportsData || []).map(
    (r: any) => ({
      id: r.id,
      team_id: r.team_id,
      home_score: r.home_score,
      away_score: r.away_score,
      status: r.status,
      is_stats_applied: r.is_stats_applied,
    })
  );

  // Parse starting 11 player stats if submitted
  let parsedPlayers: ReportPlayerStatInput[] = [];
  if (players_json) {
    try {
      const raw = JSON.parse(players_json);
      parsedPlayers = normalizePlayerStatsArray(raw);
    } catch {
      return { error: 'Oyuncu istatistik verisi okunamadı.' };
    }
  }

  // Fetch captain's active team roster & player statuses for server-side validation
  const { data: rosterMemberships } = await supabase
    .from('team_memberships')
    .select('player_id, profiles!team_memberships_player_id_fkey(id, username, status, is_active)')
    .eq('team_id', ctx.teamId)
    .eq('season_id', seasonIdForCheck)
    .is('left_at', null);

  const allowedRosterPlayerIds: string[] = [];
  const bannedOrSuspendedPlayerIds: string[] = [];

  for (const m of rosterMemberships || []) {
    if (!m.player_id) continue;
    allowedRosterPlayerIds.push(m.player_id);
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (prof && (prof.status === 'BANNED' || prof.status === 'SUSPENDED' || prof.is_active === false)) {
      bannedOrSuspendedPlayerIds.push(m.player_id);
    }
  }

  const eligibleRosterCount = allowedRosterPlayerIds.filter(
    (id) => !bannedOrSuspendedPlayerIds.includes(id)
  ).length;

  // Validate full report submission (captain team auth, fixture/match status, active report uniqueness per team, unique players, stats bounds)
  const validation = validateTeamMatchReportSubmission({
    fixtureId: fixture_id,
    captainTeamId: ctx.teamId,
    fixtureHomeTeamId: fixture.home_team_id,
    fixtureAwayTeamId: fixture.away_team_id,
    fixtureStatus: fixture.status,
    matchStatus: existingMatch?.status ?? null,
    matchSource: existingMatch?.source ?? null,
    myTeamHasSavedStats,
    homeScore: home_score,
    awayScore: away_score,
    playedAt: played_at,
    screenshotUrl: screenshot_url,
    notes,
    players: parsedPlayers,
    allowedRosterPlayerIds,
    bannedOrSuspendedPlayerIds,
    existingTeamReports: existingReports,
    requiredPlayerCount: getRequiredLineupCount(eligibleRosterCount || STARTING_LINEUP_COUNT),
  });

  if (!validation.valid) {
    return { error: validation.error || 'Rapor doğrulaması başarısız oldu.' };
  }

  // Legacy duplicate guard if no team reports exist yet and a non-rejected match already exists
  if (
    existingMatch &&
    existingReports.length === 0 &&
    existingMatch.status !== 'REJECTED'
  ) {
    return { error: 'Bu fikstür için zaten bir maç sonucu girilmiş.' };
  }

  const playedAtIso = new Date(played_at).toISOString();

  // Execute atomic RPC submit_match_team_report
  const { data: rpcResult, error: rpcError } = await supabase.rpc('submit_match_team_report', {
    p_fixture_id: fixture_id,
    p_team_id: ctx.teamId,
    p_home_score: home_score,
    p_away_score: away_score,
    p_played_at: playedAtIso,
    p_screenshot_url: screenshot_url,
    p_notes: notes,
    p_players: parsedPlayers,
  });

  if (!rpcError && rpcResult) {
    revalidatePath('/takim/yonet/maclar');
    revalidatePath('/admin/matches');
    if (rpcResult.match_id) {
      revalidatePath(`/takim/yonet/maclar/${rpcResult.match_id}`);
    }
    return {
      success: 'Maç raporu ve ilk 11 oyuncu istatistikleri başarıyla onaya gönderildi.',
      matchId: rpcResult.match_id,
      reportId: rpcResult.report_id,
    };
  }

  // If the RPC raised a domain validation error, surface it directly
  const isMissingRpc =
    rpcError &&
    (rpcError.code === 'PGRST202' ||
      rpcError.message?.includes('submit_match_team_report') ||
      rpcError.message?.includes('match_team_reports'));

  if (rpcError && !isMissingRpc) {
    return { error: rpcError.message };
  }

  // Fallback path if RPC is not yet available
  const adminSupabase = supabase;
  let matchId = existingMatch?.id || null;

  if (!existingMatch) {
    const { data: insertedMatch, error: matchInsertErr } = await supabase
      .from('matches')
      .insert({
        fixture_id,
        season_id: seasonIdForCheck,
        league_id: fixture.league_id,
        home_team_id: fixture.home_team_id,
        away_team_id: fixture.away_team_id,
        home_score,
        away_score,
        source: 'MANUAL',
        status: 'PENDING_REVIEW', // enforce_match_rules ensures this
        played_at: playedAtIso,
        notes,
        screenshot_url,
        submitted_by: user!.id,
      })
      .select('id')
      .maybeSingle();

    if (matchInsertErr) return { error: matchInsertErr.message };
    matchId = insertedMatch?.id || null;
  } else if (existingMatch.status === 'REJECTED') {
    await adminSupabase
      .from('matches')
      .update({
        status: 'PENDING_REVIEW',
        home_score,
        away_score,
        played_at: playedAtIso,
        notes: notes ?? undefined,
        screenshot_url: screenshot_url ?? undefined,
        rejection_reason: null,
        submitted_by: user!.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingMatch.id);
  }

  // Try inserting into match_team_reports if table exists
  const { data: insertedReport, error: reportErr } = await adminSupabase
    .from('match_team_reports')
    .insert({
      fixture_id,
      match_id: matchId,
      season_id: seasonIdForCheck,
      league_id: fixture.league_id,
      team_id: ctx.teamId,
      submitted_by: user!.id,
      home_score,
      away_score,
      played_at: playedAtIso,
      screenshot_url,
      notes,
      status: 'PENDING_REVIEW',
      is_stats_applied: false,
    })
    .select('id')
    .maybeSingle();

  if (!reportErr && insertedReport?.id && parsedPlayers.length > 0) {
    const reportPlayersRows = parsedPlayers.map((p) => ({
      report_id: insertedReport.id,
      player_id: p.player_id,
      team_id: ctx.teamId,
      position: p.position,
      goals: p.goals,
      assists: p.assists,
      rating: p.rating,
      shots: p.shots,
      passes_made: p.passes_made,
      pass_attempts: p.pass_attempts,
      tackles_made: p.tackles_made,
      tackle_attempts: p.tackle_attempts,
      saves: p.saves,
      goals_conceded: p.goals_conceded,
      cleansheets_gk: p.cleansheets_gk,
      cleansheets_def: p.cleansheets_def,
      yellow_cards: p.yellow_cards ?? 0,
      red_cards: p.red_cards,
      minutes_played: p.minutes_played ?? 90,
      is_mom: p.is_mom,
    }));

    const { error: rpErr } = await adminSupabase
      .from('match_team_report_players')
      .insert(reportPlayersRows);

    if (rpErr) {
      await adminSupabase.from('match_team_reports').delete().eq('id', insertedReport.id);
      return { error: rpErr.message };
    }
  }

  revalidatePath('/takim/yonet/maclar');
  revalidatePath('/admin/matches');
  if (matchId) {
    revalidatePath(`/takim/yonet/maclar/${matchId}`);
  }
  return {
    success: 'Maç raporu ve ilk 11 oyuncu istatistikleri başarıyla onaya gönderildi.',
    matchId,
    reportId: insertedReport?.id,
  };
}

export async function submitPlayerStatsAction(matchId: string, statsPayload: any[]) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx = await getCaptainContext(supabase, user);

  if (!ctx) return { error: 'Yetkisiz işlem. Kaptan yetkiniz yok.' };
  if ('error' in ctx) return { error: ctx.error };

  // Validate match and parent fixture status
  const { data: match } = await supabase
    .from('matches')
    .select('id, fixture_id, status, source, home_team_id, away_team_id, season_id, fixtures(status)')
    .eq('id', matchId)
    .single();

  if (!match) return { error: 'Maç bulunamadı.' };
  if (match.home_team_id !== ctx.teamId && match.away_team_id !== ctx.teamId) {
    return { error: 'Bu maç sizin takımınıza ait değil.' };
  }

  const fixtureObj = Array.isArray(match.fixtures) ? match.fixtures[0] : match.fixtures;
  const fixtureStatus = fixtureObj?.status ?? 'SCHEDULED';

  if (
    fixtureStatus !== 'SCHEDULED' ||
    match.status === 'APPROVED' ||
    match.status === 'CANCELLED' ||
    match.source === 'AUTO' ||
    match.source === 'FORFEIT'
  ) {
    return {
      error:
        'Tamamlanmış (COMPLETED), onaylanmış (APPROVED) veya geçmişte oynanmış maçlar kaptan raporlamasına kapalıdır.',
    };
  }

  // Check if captain's team has an active report in match_team_reports
  const { data: myTeamReport } = match.fixture_id
    ? await supabase
        .from('match_team_reports')
        .select('id, status, is_stats_applied')
        .eq('fixture_id', match.fixture_id)
        .eq('team_id', ctx.teamId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  if (myTeamReport) {
    if (myTeamReport.status === 'APPROVED' || myTeamReport.is_stats_applied) {
      return { error: 'Onaylanmış bir takım raporunun oyuncu istatistikleri değiştirilemez.' };
    }
    if (myTeamReport.status === 'REJECTED') {
      return {
        error:
          'Bu rapor reddedilmiştir. Lütfen "Yeniden Rapor Gönder" ekranından yeni rapor oluşturun.',
      };
    }
  } else if (match.status !== 'PENDING_REVIEW') {
    return { error: 'Sadece inceleme bekleyen maçlara istatistik girilebilir.' };
  }

  const normalizedPlayers = normalizePlayerStatsArray(statsPayload || []);
  const submittedPlayerIds = normalizedPlayers.map((s) => s.player_id);

  // Fetch captain's active team roster
  const { data: validMemberships } = await supabase
    .from('team_memberships')
    .select('player_id, profiles!team_memberships_player_id_fkey(id, username, status, is_active)')
    .eq('team_id', ctx.teamId)
    .eq('season_id', match.season_id)
    .is('left_at', null);

  const allowedRosterIds: string[] = [];
  const bannedPlayerIds: string[] = [];

  for (const m of validMemberships || []) {
    if (!m.player_id) continue;
    allowedRosterIds.push(m.player_id);
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (prof && (prof.status === 'SUSPENDED' || prof.status === 'BANNED' || prof.is_active === false)) {
      bannedPlayerIds.push(m.player_id);
    }
  }

  const validPlayerSet = new Set(allowedRosterIds);
  const hasInvalidPlayer = submittedPlayerIds.some((id) => !validPlayerSet.has(id));
  if (hasInvalidPlayer) {
    return { error: 'Takımınızın aktif kadrosunda yer almayan oyuncular için istatistik girilemez.' };
  }

  const eligibleCountForMatch = allowedRosterIds.filter(
    (id) => !bannedPlayerIds.includes(id)
  ).length;
  const lineupValidation = validateStartingLineupAndStats(normalizedPlayers, allowedRosterIds, {
    requiredCount: getRequiredLineupCount(eligibleCountForMatch || STARTING_LINEUP_COUNT),
    bannedOrSuspendedPlayerIds: bannedPlayerIds,
  });

  if (!lineupValidation.valid) {
    return { error: lineupValidation.error };
  }

  // If this team has a pending report in match_team_reports, update match_team_report_players
  if (myTeamReport && myTeamReport.status === 'PENDING_REVIEW') {
    await supabase.from('match_team_report_players').delete().eq('report_id', myTeamReport.id);

    const reportPlayerRows = normalizedPlayers.map((stat) => ({
      report_id: myTeamReport.id,
      player_id: stat.player_id,
      team_id: ctx.teamId,
      position: stat.position,
      goals: stat.goals,
      assists: stat.assists,
      rating: stat.rating,
      shots: stat.shots,
      passes_made: stat.passes_made,
      pass_attempts: stat.pass_attempts,
      tackles_made: stat.tackles_made,
      tackle_attempts: stat.tackle_attempts,
      saves: stat.saves,
      goals_conceded: stat.goals_conceded,
      cleansheets_gk: stat.cleansheets_gk,
      cleansheets_def: stat.cleansheets_def,
      red_cards: stat.red_cards,
      is_mom: stat.is_mom,
    }));

    const { error: rpErr } = await supabase
      .from('match_team_report_players')
      .insert(reportPlayerRows);

    if (rpErr) return { error: rpErr.message };

    revalidatePath(`/takim/yonet/maclar/${matchId}`);
    revalidatePath('/takim/yonet/maclar');
    revalidatePath('/admin/matches');
    return { success: 'İlk 11 oyuncu istatistikleri başarıyla güncellendi.' };
  }

  // Fallback for legacy PENDING_REVIEW match without a match_team_reports row
  const upsertData = normalizedPlayers.map((stat) => ({
    match_id: matchId,
    player_id: stat.player_id,
    team_id: ctx.teamId,
    position: stat.position || null,
    goals: stat.goals,
    assists: stat.assists,
    rating: stat.rating,
    shots: stat.shots,
    passes_made: stat.passes_made,
    pass_attempts: stat.pass_attempts,
    tackles_made: stat.tackles_made,
    tackle_attempts: stat.tackle_attempts,
    saves: stat.saves,
    goals_conceded: stat.goals_conceded,
    cleansheets_gk: stat.cleansheets_gk,
    cleansheets_def: stat.cleansheets_def,
    red_cards: stat.red_cards,
    is_mom: stat.is_mom,
  }));

  await supabase.from('match_player_stats').delete().eq('match_id', matchId).eq('team_id', ctx.teamId);

  if (upsertData.length > 0) {
    const { error } = await supabase.from('match_player_stats').insert(upsertData);
    if (error) return { error: error.message };
  }

  revalidatePath(`/takim/yonet/maclar/${matchId}`);
  revalidatePath('/takim/yonet/maclar');
  revalidatePath('/admin/matches');
  return { success: 'İstatistikler başarıyla kaydedildi.' };
}

export async function editMatchAction(matchId: string, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
      .select('id, fixture_id, status, source, home_team_id, away_team_id, season_id, fixtures(status)')
      .eq('id', matchId)
      .maybeSingle();

    if (fetchErr || !match) {
      return { error: 'Maç bulunamadı.' };
    }

    // E) Kaptanın takımı maçın ev sahibi veya deplasmanı mı?
    if (match.home_team_id !== ctx.teamId && match.away_team_id !== ctx.teamId) {
      return {
        error:
          'Bu maçı düzenleme yetkiniz yok. Yalnızca kendi takımınızın maçlarını düzenleyebilirsiniz.',
      };
    }

    const fixtureObj = Array.isArray(match.fixtures) ? match.fixtures[0] : match.fixtures;
    const fixtureStatus = fixtureObj?.status ?? 'SCHEDULED';

    if (
      fixtureStatus !== 'SCHEDULED' ||
      match.status === 'APPROVED' ||
      match.status === 'CANCELLED' ||
      match.source === 'AUTO' ||
      match.source === 'FORFEIT'
    ) {
      return {
        error:
          'Tamamlanmış (COMPLETED), onaylanmış (APPROVED) veya geçmişte oynanmış maçlar kaptan raporlamasına kapalıdır.',
      };
    }

    // Check if captain has a pending team report
    const { data: myTeamReport } = match.fixture_id
      ? await supabase
          .from('match_team_reports')
          .select('id, status, is_stats_applied')
          .eq('fixture_id', match.fixture_id)
          .eq('team_id', ctx.teamId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    // D) PENDING_REVIEW durum kontrolü (APPROVED raporlar/maçlar düzenlenemez)
    if (myTeamReport) {
      if (myTeamReport.status !== 'PENDING_REVIEW') {
        return {
          error: `Takım raporunuz ${myTeamReport.status} durumunda olduğu için düzenlenemez. Yalnızca inceleme bekleyen (PENDING_REVIEW) raporlar düzenlenebilir.`,
        };
      }
    } else if (match.status !== 'PENDING_REVIEW') {
      return {
        error: `Bu maç ${match.status} durumunda olduğu için düzenlenemez. Yalnızca inceleme bekleyen (PENDING_REVIEW) maçlar düzenlenebilir.`,
      };
    }

    // F) Skor doğrulaması (negatif skor engeli)
    const rawHome = formData.get('home_score');
    const rawAway = formData.get('away_score');
    const home_score = parseInt(rawHome as string, 10);
    const away_score = parseInt(rawAway as string, 10);

    if (isNaN(home_score) || isNaN(away_score)) {
      return { error: 'Geçerli bir ev sahibi ve deplasman skoru giriniz.' };
    }

    if (home_score < 0 || away_score < 0 || home_score > 99 || away_score > 99) {
      return { error: 'Skorlar 0 ile 99 arasında olmalıdır.' };
    }

    // G) Screenshot ve Notlar
    const screenshot_url = (formData.get('screenshot_url') as string)?.trim() || null;
    const notes = (formData.get('notes') as string)?.trim() || null;

    if (myTeamReport && myTeamReport.status === 'PENDING_REVIEW') {
      const { error: reportUpdateErr } = await supabase
        .from('match_team_reports')
        .update({
          home_score,
          away_score,
          screenshot_url,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', myTeamReport.id);

      if (reportUpdateErr) {
        return { error: `Rapor güncellenemedi: ${reportUpdateErr.message}` };
      }
    }

    // If overall match is still PENDING_REVIEW, also keep matches record synced
    if (match.status === 'PENDING_REVIEW') {
      const { error: updateErr } = await supabase
        .from('matches')
        .update({
          home_score,
          away_score,
          screenshot_url,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', matchId);

      if (updateErr && !myTeamReport) {
        return { error: `Maç güncellenemedi: ${updateErr.message}` };
      }
    }

    // J) Revalidate
    revalidatePath('/takim/yonet/maclar');
    revalidatePath(`/takim/yonet/maclar/${matchId}`);
    revalidatePath('/admin/matches');

    return { success: 'Maç skoru ve kanıt bilgileri başarıyla güncellendi.' };
  } catch (err: any) {
    console.error('editMatchAction error:', err);
    return { error: err.message || 'Beklenmeyen bir hata oluştu.' };
  }
}
