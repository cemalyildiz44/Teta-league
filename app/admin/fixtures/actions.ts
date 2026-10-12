'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { slugify } from '@/app/lig/utils';
import { logAdminAudit } from '@/lib/audit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function checkAdmin(supabase: any, user: any) {
  if (!user) return false;
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

import {
  TeamRef,
  MatchPair,
  FixturePreviewItem,
  generateRoundRobin,
  validateFixtureUpdate,
  validateAndDetermineScoreStatus
} from '@/lib/fixture-generator';

export type { TeamRef, MatchPair, FixturePreviewItem };

/**
 * Previews Round-Robin fixtures before inserting into the database.
 * Detects existing / duplicate fixtures and gives a clear breakdown.
 */
export async function previewLeagueFixturesAction(
  seasonId: string,
  leagueId: string,
  startDateStr: string,
  doubleRound: boolean = true
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await checkAdmin(supabase, user))) {
    return { error: 'Yetkisiz erişim.' };
  }

  if (!seasonId || !leagueId || !startDateStr) {
    return { error: 'Sezon, lig ve başlangıç tarihi zorunludur.' };
  }

  // 1. Fetch active teams in the league
  const { data: leagueTeams, error: ltError } = await supabase
    .from('league_teams')
    .select('team_id, teams(id, name)')
    .eq('league_id', leagueId)
    .eq('is_active', true);

  if (ltError || !leagueTeams || leagueTeams.length < 2) {
    return { error: 'Fikstür ön izlemesi için ligde en az 2 aktif takım olmalıdır.' };
  }

  const teams: TeamRef[] = leagueTeams.map((lt: any) => ({
    id: lt.team_id,
    name: Array.isArray(lt.teams) ? lt.teams[0]?.name : lt.teams?.name || 'Takım'
  }));

  // 2. Generate pairs
  const matchPairs = generateRoundRobin(teams, doubleRound);
  if (matchPairs.length === 0) {
    return { error: 'Fikstür kombinasyonları oluşturulamadı.' };
  }

  // 3. Fetch existing fixtures in DB to detect collisions / duplicates
  const { data: existingFixtures } = await supabase
    .from('fixtures')
    .select('home_team_id, away_team_id, week_number')
    .eq('season_id', seasonId)
    .eq('league_id', leagueId);

  const existingSet = new Set(
    (existingFixtures || []).map((f: any) => `${f.home_team_id}_${f.away_team_id}_${f.week_number}`)
  );

  const startDate = new Date(startDateStr);
  const items: FixturePreviewItem[] = [];
  let duplicatesCount = 0;

  for (const mp of matchPairs) {
    const scheduledAt = new Date(startDate.getTime());
    scheduledAt.setDate(scheduledAt.getDate() + ((mp.week - 1) * 7));

    const key = `${mp.home.id}_${mp.away.id}_${mp.week}`;
    const isDuplicate = existingSet.has(key);
    if (isDuplicate) duplicatesCount++;

    items.push({
      week: mp.week,
      home_team_id: mp.home.id,
      home_team_name: mp.home.name || 'Ev Sahibi',
      away_team_id: mp.away.id,
      away_team_name: mp.away.name || 'Deplasman',
      scheduled_at: scheduledAt.toISOString(),
      is_duplicate: isDuplicate
    });
  }

  const weeksCount = Array.from(new Set(items.map(i => i.week))).length;

  return {
    data: {
      totalMatches: items.length,
      newMatchesCount: items.length - duplicatesCount,
      duplicateMatchesCount: duplicatesCount,
      weeksCount,
      items
    }
  };
}

/**
 * Creates or imports round-robin fixtures after admin confirmation.
 */
export async function generateLeagueFixturesAction(
  seasonId: string,
  leagueId: string,
  startDateStr: string,
  doubleRound: boolean = true
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await checkAdmin(supabase, user))) {
    return { error: 'Yetkisiz erişim.' };
  }

  if (!seasonId || !leagueId || !startDateStr) {
    return { error: 'Geçersiz parametreler.' };
  }

  // 1. DUPLICATE CHECK
  const { data: existing } = await supabase
    .from('fixtures')
    .select('id')
    .eq('season_id', seasonId)
    .eq('league_id', leagueId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { error: 'Bu lig için zaten oluşturulmuş fikstür kayıtları mevcut. Tekrar oluşturmadan önce mevcut fikstürleri temizlemelisiniz.' };
  }

  // 2. Fetch league teams
  const { data: leagueTeams } = await supabase
    .from('league_teams')
    .select('team_id, teams(name)')
    .eq('league_id', leagueId)
    .eq('is_active', true);

  if (!leagueTeams || leagueTeams.length < 2) {
    return { error: 'Fikstür oluşturmak için ligde en az 2 aktif takım olmalıdır.' };
  }

  const teams: TeamRef[] = leagueTeams.map(lt => ({
    id: lt.team_id,
    name: Array.isArray(lt.teams) ? lt.teams[0]?.name : (lt.teams as any)?.name
  }));

  // 3. Generate Round Robin
  const matchPairs = generateRoundRobin(teams, doubleRound);
  if (matchPairs.length === 0) {
    return { error: 'Fikstür oluşturulamadı.' };
  }

  // 4. Save to DB
  const startDate = new Date(startDateStr);
  const rowsToInsert = matchPairs.map(mp => {
    const scheduledAt = new Date(startDate.getTime());
    scheduledAt.setDate(scheduledAt.getDate() + ((mp.week - 1) * 7));

    return {
      season_id: seasonId,
      league_id: leagueId,
      home_team_id: mp.home.id,
      away_team_id: mp.away.id,
      week_number: mp.week,
      scheduled_at: scheduledAt.toISOString(),
      status: 'SCHEDULED',
      created_by: user.id
    };
  });

  const { error: insertError } = await supabase.from('fixtures').insert(rowsToInsert);

  if (insertError) {
    return { error: 'Fikstür kaydedilirken bir hata oluştu: ' + insertError.message };
  }

  const { data: leagueData } = await supabase.from('leagues').select('name').eq('id', leagueId).maybeSingle();
  const leagueName = leagueData?.name || leagueId;

  await logAdminAudit({
    action: 'GENERATE_LEAGUE_FIXTURES',
    entity_type: 'fixtures',
    entity_id: leagueId,
    entity_label: `${leagueName} (${rowsToInsert.length} Maç)`,
    new_data: {
      season_id: seasonId,
      league_id: leagueId,
      match_count: rowsToInsert.length,
      double_round: doubleRound,
      start_date: startDateStr,
    },
    description: `"${leagueName}" ligi için ${rowsToInsert.length} maçlık fikstür başarıyla oluşturuldu.`,
    actor_id: user.id
  });

  revalidatePath('/admin/fixtures');
  revalidatePath('/admin/matches');
  return { success: 'Fikstür başarıyla oluşturuldu.', totalMatches: rowsToInsert.length };
}

/**
 * Updates comprehensive fixture properties: week_number, scheduled_at, status, notes.
 * Guards team consistency and linked match integrity.
 */
export async function updateFixtureAction(
  fixtureId: string,
  data: {
    week_number?: number;
    scheduled_at?: string;
    home_team_id?: string;
    away_team_id?: string;
    status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED';
    notes?: string | null;
  }
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!fixtureId || !UUID_REGEX.test(fixtureId)) {
    return { error: 'Geçersiz fikstür kimliği.' };
  }

  // 1. Fetch current fixture and any linked match
  const { data: currentFixture, error: fetchErr } = await supabase
    .from('fixtures')
    .select('*, leagues(name), seasons(slug)')
    .eq('id', fixtureId)
    .maybeSingle();

  if (fetchErr || !currentFixture) return { error: 'Fikstür bulunamadı.' };

  const { data: linkedMatch } = await supabase
    .from('matches')
    .select('id, status, home_team_id, away_team_id, home_score, away_score')
    .eq('fixture_id', fixtureId)
    .maybeSingle();

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString()
  };

  // Week number validation
  if (data.week_number !== undefined) {
    if (!Number.isInteger(data.week_number) || data.week_number < 1) {
      return { error: 'Hafta numarası 1 veya daha büyük bir tam sayı olmalıdır.' };
    }
    updatePayload.week_number = data.week_number;
  }

  // Scheduled date validation
  if (data.scheduled_at) {
    const d = new Date(data.scheduled_at);
    if (isNaN(d.getTime())) return { error: 'Geçersiz tarih formatı.' };
    updatePayload.scheduled_at = d.toISOString();
  }

  // Status validation
  if (data.status) {
    const allowed = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'POSTPONED'];
    if (!allowed.includes(data.status)) {
      return { error: 'Geçersiz fikstür durumu.' };
    }
    updatePayload.status = data.status;
  }

  // Notes
  if (data.notes !== undefined) {
    updatePayload.notes = data.notes;
  }

  // Team validation (if changing teams)
  const newHome = data.home_team_id || currentFixture.home_team_id;
  const newAway = data.away_team_id || currentFixture.away_team_id;

  if (newHome === newAway) {
    return { error: 'Ev sahibi ve deplasman takımları aynı olamaz.' };
  }

  if (data.home_team_id || data.away_team_id) {
    // If teams are changing and there's a linked match, prevent breaking composite FK
    if (linkedMatch) {
      return {
        error: 'Bu fikstüre bağlı oynanmış/kaydedilmiş bir maç kaydı bulunmaktadır. Takımları değiştirmek için önce bağlı maçı silmelisiniz.'
      };
    }

    // Verify both teams belong to the league
    const { data: validTeams } = await supabase
      .from('league_teams')
      .select('team_id')
      .eq('league_id', currentFixture.league_id)
      .in('team_id', [newHome, newAway]);

    if (!validTeams || validTeams.length < 2) {
      return { error: 'Seçilen takımlar bu lige ait aktif takımlar arasında bulunamadı.' };
    }

    updatePayload.home_team_id = newHome;
    updatePayload.away_team_id = newAway;
  }

  // 2. Perform update
  const { error: updateErr } = await supabase
    .from('fixtures')
    .update(updatePayload)
    .eq('id', fixtureId);

  if (updateErr) return { error: 'Fikstür güncellenemedi: ' + updateErr.message };

  await logAdminAudit({
    action: 'UPDATE_FIXTURE',
    entity_type: 'fixtures',
    entity_id: fixtureId,
    entity_label: `Hafta ${updatePayload.week_number || currentFixture.week_number} Fikstürü`,
    old_data: {
      week_number: currentFixture.week_number,
      scheduled_at: currentFixture.scheduled_at,
      status: currentFixture.status,
      home_team_id: currentFixture.home_team_id,
      away_team_id: currentFixture.away_team_id
    },
    new_data: updatePayload,
    description: `Fikstür bilgileri güncellendi.`,
    actor_id: user.id
  });

  revalidatePath('/admin/fixtures');
  revalidatePath('/admin/matches');
  return { success: 'Fikstür başarıyla güncellendi.' };
}

/**
 * Updates date only (fast action).
 */
export async function updateFixtureDateAction(fixtureId: string, newDateStr: string) {
  return updateFixtureAction(fixtureId, { scheduled_at: newDateStr });
}

/**
 * Cancels a fixture.
 */
export async function cancelFixtureAction(fixtureId: string) {
  return updateFixtureAction(fixtureId, { status: 'CANCELLED' });
}

/**
 * Deletes a fixture completely if not referenced by a match.
 */
export async function deleteFixtureAction(fixtureId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!fixtureId || !UUID_REGEX.test(fixtureId)) {
    return { error: 'Geçersiz fikstür kimliği.' };
  }

  const { data: currentFixture } = await supabase
    .from('fixtures')
    .select('id, week_number, scheduled_at, league_id')
    .eq('id', fixtureId)
    .maybeSingle();

  if (!currentFixture) return { error: 'Fikstür bulunamadı.' };

  const { error } = await supabase.from('fixtures').delete().eq('id', fixtureId);
  if (error) {
    if (error.code === '23503') {
      return { error: 'Bu fikstüre bağlı maç veya veri bulunduğu için silinemez. Önce ilişkili maçı silmelisiniz.' };
    }
    return { error: 'Fikstür silinemedi: ' + error.message };
  }

  await logAdminAudit({
    action: 'DELETE_FIXTURE',
    entity_type: 'fixtures',
    entity_id: fixtureId,
    entity_label: `Hafta ${currentFixture?.week_number || ''} Fikstürü`,
    old_data: currentFixture,
    description: `Fikstür kaydı silindi.`,
    actor_id: user.id
  });

  revalidatePath('/admin/fixtures');
  return { success: 'Fikstür başarıyla silindi.' };
}

/**
 * Sets or updates match score directly linked to a fixture.
 * CRITICAL: Setting score DOES NOT automatically approve the match.
 * If no match exists for this fixture, it creates one as PENDING_REVIEW.
 */
export async function updateFixtureScoreAction(
  fixtureId: string,
  homeScore: number,
  awayScore: number
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!fixtureId || !UUID_REGEX.test(fixtureId)) {
    return { error: 'Geçersiz fikstür kimliği.' };
  }

  if (
    typeof homeScore !== 'number' ||
    typeof awayScore !== 'number' ||
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    return { error: 'Geçersiz skor: Skorlar negatif olamaz ve tam sayı olmalıdır.' };
  }

  // 1. Fetch fixture
  const { data: fixture, error: fixErr } = await supabase
    .from('fixtures')
    .select('id, season_id, league_id, home_team_id, away_team_id, week_number, scheduled_at, seasons(slug), leagues(name)')
    .eq('id', fixtureId)
    .maybeSingle();

  if (fixErr || !fixture) return { error: 'Fikstür bulunamadı.' };

  // 2. Check for linked match
  const { data: existingMatch } = await supabase
    .from('matches')
    .select('id, status, home_score, away_score')
    .eq('fixture_id', fixtureId)
    .maybeSingle();

  if (existingMatch) {
    // Update existing match score while PRESERVING status (does not auto-approve!)
    const { error: matchUpdateErr } = await supabase
      .from('matches')
      .update({
        home_score: homeScore,
        away_score: awayScore,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingMatch.id);

    if (matchUpdateErr) return { error: 'Skor güncellenemedi: ' + matchUpdateErr.message };

    await logAdminAudit({
      action: 'UPDATE_FIXTURE_SCORE',
      entity_type: 'matches',
      entity_id: existingMatch.id,
      entity_label: `Maç #${existingMatch.id.substring(0, 8)}`,
      old_data: { home_score: existingMatch.home_score, away_score: existingMatch.away_score },
      new_data: { home_score: homeScore, away_score: awayScore },
      description: `Fikstür (Hafta ${fixture.week_number}) skoru ${homeScore} - ${awayScore} olarak güncellendi.`,
      actor_id: user.id
    });

    // If match was APPROVED, trigger recalculation will run automatically in Postgres
    if (existingMatch.status === 'APPROVED') {
      revalidatePath('/');
      revalidatePath('/ligler');
      revalidatePath('/oyuncular');
      revalidatePath(`/mac/${existingMatch.id}`);
      const seasonSlug = (fixture.seasons as any)?.slug;
      const leagueName = (fixture.leagues as any)?.name;
      if (seasonSlug && leagueName) {
        const leagueSlug = slugify(leagueName);
        revalidatePath(`/lig/${seasonSlug}/${leagueSlug}`);
        revalidatePath(`/lig/${seasonSlug}/${leagueSlug}/istatistikler`);
        revalidatePath(`/lig/${seasonSlug}/${leagueSlug}/fikstur`);
      }
    }
  } else {
    // Create new match in PENDING_REVIEW status (does not auto-approve!)
    const { data: newMatch, error: insertErr } = await supabase
      .from('matches')
      .insert({
        fixture_id: fixture.id,
        season_id: fixture.season_id,
        league_id: fixture.league_id,
        home_team_id: fixture.home_team_id,
        away_team_id: fixture.away_team_id,
        home_score: homeScore,
        away_score: awayScore,
        source: 'MANUAL',
        status: 'PENDING_REVIEW',
        played_at: fixture.scheduled_at,
        submitted_by: user.id
      })
      .select('id')
      .single();

    if (insertErr || !newMatch) {
      return { error: 'Yeni maç kaydı oluşturulamadı: ' + insertErr?.message };
    }

    await logAdminAudit({
      action: 'CREATE_FIXTURE_MATCH',
      entity_type: 'matches',
      entity_id: newMatch.id,
      entity_label: `Fikstür Maçı (Hafta ${fixture.week_number})`,
      new_data: { home_score: homeScore, away_score: awayScore, status: 'PENDING_REVIEW' },
      description: `Fikstür için manuel maç skoru (${homeScore} - ${awayScore}) girildi (Onay Bekliyor).`,
      actor_id: user.id
    });
  }

  revalidatePath('/admin/fixtures');
  revalidatePath('/admin/matches');
  return { success: 'Skor başarıyla kaydedildi.' };
}

/**
 * Fetches full details for a fixture, including linked match, raw EA data, and player stats.
 */
export async function getFixtureDetailAction(fixtureId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  if (!fixtureId || !UUID_REGEX.test(fixtureId)) {
    return { error: 'Geçersiz fikstür kimliği.' };
  }

  const { data: fixture, error: fixErr } = await supabase
    .from('fixtures')
    .select(`
      *,
      seasons(id, name, slug),
      leagues(id, name),
      home_team:home_team_id(id, name, logo_url, ea_club_id),
      away_team:away_team_id(id, name, logo_url, ea_club_id),
      matches:matches(
        id, status, home_score, away_score, played_at, source, ea_match_id, is_stats_applied, updated_at,
        match_raw_ea_data(id, ea_match_id, raw_data, fetched_at),
        stats:match_player_stats(
          id, player_id, team_id, ea_player_id, ea_player_name, position,
          goals, assists, rating, shots, passes_made, pass_attempts, tackles_made, saves,
          extra_stats,
          profiles:player_id(id, username, full_name, current_ea_player_id)
        )
      )
    `)
    .eq('id', fixtureId)
    .maybeSingle();

  if (fixErr || !fixture) return { error: 'Fikstür bulunamadı.' };

  return { data: fixture };
}
