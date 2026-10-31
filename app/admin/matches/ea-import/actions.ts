'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logAdminAudit } from '@/lib/audit';
import { fetchClubMatches } from '@/lib/ea/client';
import { normalizeMatch } from '@/lib/ea/normalizer';
import { matchFixture, FixtureCandidate } from '@/lib/ea/matcher';
import { NormalizedMatch } from '@/lib/ea/types';
import { matchPlayerToProfile, validateRosterMembership } from '@/lib/ea/roster-validator';
import { attachTeamNames } from '@/lib/admin-scope';

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

export interface EAPreviewMatch extends NormalizedMatch {
  fixture_id?: string;
  match_status: 'READY' | 'DUPLICATE_EA_MATCH' | 'FIXTURE_ALREADY_HAS_MATCH' | 'DRAW_REQUIRES_CAPTAIN_REPORT' | 'UNMATCHED' | 'AMBIGUOUS';
  home_team_id?: string;
  away_team_id?: string;
  is_reversed?: boolean;
}

export async function fetchEaPreviewAction(leagueId: string, weekNumber: number) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 1. Verify Admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };
    
    if (!(await checkAdmin(supabase, user))) {
      return { error: 'Unauthorized: Admins only' };
    }

    // 2. Fetch fixtures for the league & week (NO composite FK shorthand for teams, we map it manually)
    const { data: fixtures, error: fixErr } = await supabase
      .from('fixtures')
      .select(`id, home_team_id, away_team_id, scheduled_at`)
      .eq('league_id', leagueId)
      .eq('week_number', weekNumber);

    if (fixErr || !fixtures) return { error: 'Fikstürler alınamadı: ' + fixErr?.message };

    // Fetch team ea_club_ids
    const teamIds = new Set<string>();
    fixtures.forEach((f: any) => {
      if (f.home_team_id) teamIds.add(f.home_team_id);
      if (f.away_team_id) teamIds.add(f.away_team_id);
    });

    const { data: teams } = await supabase.from('teams').select('id, ea_club_id').in('id', Array.from(teamIds));
    const teamMap = new Map(teams?.map(t => [t.id, t.ea_club_id]));

    // Attach team ea_club_id to fixtures
    fixtures.forEach((f: any) => {
      f.home_team = { ea_club_id: teamMap.get(f.home_team_id) };
      f.away_team = { ea_club_id: teamMap.get(f.away_team_id) };
    });

    // 3. Extract unique ea_club_ids
    const clubIds = new Set<number>();
    fixtures.forEach((f: any) => {
      if (f.home_team?.ea_club_id) clubIds.add(f.home_team.ea_club_id);
      if (f.away_team?.ea_club_id) clubIds.add(f.away_team.ea_club_id);
    });

    if (clubIds.size === 0) return { error: 'Bu haftadaki takımların EA Club ID kayıtları bulunamadı.' };

    // 4. Fetch EA matches
    let allEaMatches: any[] = [];
    for (const clubId of Array.from(clubIds)) {
      try {
        const matches = await fetchClubMatches(clubId);
        if (Array.isArray(matches)) {
          allEaMatches.push(...matches);
        }
      } catch (err: any) {
        console.warn(`Failed to fetch for club ${clubId}: ${err.message}`);
        return { error: `EA API çağrısı başarısız oldu (Club: ${clubId}): ${err.message}` };
      }
    }

    if (allEaMatches.length === 0) {
      return { error: 'EA API\'den hiçbir maç verisi dönmedi veya zaman aşımına uğradı.' };
    }

    // Deduplicate by ea_match_id
    const uniquePayloads = Array.from(new Map(allEaMatches.map(m => [m.matchId, m])).values());

    // 5. Match with fixtures and check duplicates in DB
    const preview: EAPreviewMatch[] = [];

    for (const payload of uniquePayloads) {
      const normalized = normalizeMatch(payload, 0); // 0 is arbitrary, we parse both
      if (!normalized) continue;

      const matchRes = matchFixture(normalized, fixtures as any);

      let match_status: EAPreviewMatch['match_status'] = 'UNMATCHED';
      
      if (matchRes.status === 'MATCHED') {
        // Check for DB duplicates
        const { data: dupEa } = await supabase.from('matches').select('id').eq('ea_match_id', normalized.ea_match_id).maybeSingle();
        if (dupEa) {
          match_status = 'DUPLICATE_EA_MATCH';
        } else {
          const { data: dupFix } = await supabase.from('matches').select('id').eq('fixture_id', matchRes.fixture_id).maybeSingle();
          const { data: dupCaptainReport } = await supabase.from('match_team_reports').select('id').eq('fixture_id', matchRes.fixture_id).in('status', ['PENDING_REVIEW', 'APPROVED']).limit(1).maybeSingle();
          if (dupFix || dupCaptainReport) {
            match_status = 'FIXTURE_ALREADY_HAS_MATCH';
          } else {
            match_status = normalized.home_team.score === normalized.away_team.score ? 'DRAW_REQUIRES_CAPTAIN_REPORT' : 'READY';
          }
        }
      } else {
        match_status = matchRes.status as EAPreviewMatch['match_status'];
      }

      preview.push({
        ...normalized,
        fixture_id: matchRes.fixture_id,
        home_team_id: matchRes.home_team_id,
        away_team_id: matchRes.away_team_id,
        is_reversed: matchRes.is_reversed,
        match_status
      });
    }

    return { data: preview };
  } catch (err: any) {
    return { error: 'Sunucu hatası: ' + err.message };
  }
}

export async function importEaMatchAction(matchData: EAPreviewMatch, seasonId: string, leagueId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  if (!(await checkAdmin(supabase, user))) {
    return { error: 'Yetkisiz erişim.' };
  }

  if (!seasonId || !leagueId) {
    return { error: 'Sezon ve Lig ID parametreleri zorunludur.' };
  }

  if (matchData.match_status === 'DRAW_REQUIRES_CAPTAIN_REPORT' || matchData.home_team.score === matchData.away_team.score) {
    return {
      error:
        'Beraberlikle sonuçlanan maçlar EA API üzerinden otomatik içe aktarılamaz; bu maçlar kaptanların manuel raporlamasına bırakılmalıdır.',
    };
  }
  if (matchData.match_status !== 'READY') {
    return { error: 'Maç READY statüsünde değil.' };
  }

  if (!matchData.fixture_id) {
    return { error: 'Fikstür kimliği bulunamadı.' };
  }

  if (!matchData.home_team_id || !matchData.away_team_id) {
    return { error: 'Takım ID eşleştirmeleri bulunamadı.' };
  }

  const homeTeamId = matchData.home_team_id;
  const awayTeamId = matchData.away_team_id;

  // 0. Guard: Never overwrite an existing match or approved/pending captain report for this fixture
  const [{ data: existingFixtureMatch }, { data: existingCaptainReport }] = await Promise.all([
    supabase
      .from('matches')
      .select('id, status, source')
      .eq('fixture_id', matchData.fixture_id)
      .maybeSingle(),
    supabase
      .from('match_team_reports')
      .select('id, status')
      .eq('fixture_id', matchData.fixture_id)
      .in('status', ['PENDING_REVIEW', 'APPROVED'])
      .limit(1)
      .maybeSingle(),
  ]);

  if (existingFixtureMatch || existingCaptainReport) {
    return {
      error:
        'Bu fikstür için sistemde zaten bir maç kaydı veya kaptan raporu mevcut. Onaylanmış veya bekleyen kaptan raporları EA senkronizasyonu ile ezilemez.',
    };
  }

  // 1. Insert Match
  const { data: newMatch, error: matchErr } = await supabase.from('matches').insert({
    fixture_id: matchData.fixture_id,
    season_id: seasonId,
    league_id: leagueId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home_score: matchData.is_reversed ? matchData.away_team.score : matchData.home_team.score,
    away_score: matchData.is_reversed ? matchData.home_team.score : matchData.away_team.score,
    source: 'AUTO',
    status: 'PENDING_REVIEW', // Important: Goes to pending review
    ea_match_id: matchData.ea_match_id,
    played_at: matchData.played_at,
    submitted_by: user.id
  }).select('id').single();

  if (matchErr || !newMatch) {
    if (matchErr?.message?.includes('uq_ea_match_id') || matchErr?.message?.includes('uq_match_fixture') || matchErr?.code === '23505') {
      return { error: 'Bu EA maçı veya fikstürü sisteme zaten içe aktarılmış.' };
    }
    console.error('[importEaMatchAction] Match insert error:', matchErr);
    return { error: 'Maç kaydedilemedi. Lütfen fikstür ve takım bilgilerini kontrol edin.' };
  }

  // 2. Insert Raw Data
  await supabase.from('match_raw_ea_data').insert({
    match_id: newMatch.id,
    ea_match_id: matchData.ea_match_id,
    raw_data: matchData.raw_data,
    platform: 'common-gen5'
  });

  // 3. Match players to profiles with case-insensitive normalization & collision detection
  const allPlayers = [
    ...matchData.home_team.players.map(p => ({ ...p, _eaClub: matchData.home_team.ea_club_id })),
    ...matchData.away_team.players.map(p => ({ ...p, _eaClub: matchData.away_team.ea_club_id }))
  ];

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, username, full_name, current_ea_player_id')
    .not('current_ea_player_id', 'is', null);

  // Initial individual matches
  const individualMatches = allPlayers.map(p => ({
    player: p,
    matchRes: matchPlayerToProfile(p, allProfiles || [])
  }));

  // Detect and resolve in-match collisions (if same profile is matched to >1 player in this match)
  const profileUsageCount = new Map<string, number>();
  for (const { matchRes } of individualMatches) {
    if (matchRes.player_id) {
      profileUsageCount.set(matchRes.player_id, (profileUsageCount.get(matchRes.player_id) || 0) + 1);
    }
  }

  // Fetch active memberships for all candidate player_ids in this season
  const matchedPlayerIds = Array.from(new Set(
    individualMatches
      .map(m => m.matchRes.player_id)
      .filter((id): id is string => Boolean(id) && (profileUsageCount.get(id as string) || 0) === 1)
  ));

  let memberships: any[] = [];
  if (matchedPlayerIds.length > 0) {
    const { data: memData } = await supabase
      .from('team_memberships')
      .select('id, player_id, team_id, season_id, left_at')
      .eq('season_id', seasonId)
      .is('left_at', null)
      .in('player_id', matchedPlayerIds);
    // team_memberships has no direct relationship to teams: names are attached from an explicit lookup (roster validation unchanged)
    memberships = await attachTeamNames(supabase, memData || []);
  }

  // 4. Insert Player Stats with extra_stats validation metadata
  const statsToInsert = individualMatches.map(({ player: p, matchRes }) => {
    const isHome = p._eaClub === matchData.home_team.ea_club_id;
    // Account for reversed fixtures
    const team_id = (isHome !== matchData.is_reversed) ? homeTeamId : awayTeamId;

    let finalPlayerId: string | null = matchRes.player_id;
    let matchWarning: string | null = matchRes.warning || null;

    // Guard: In-match collision
    if (finalPlayerId && (profileUsageCount.get(finalPlayerId) || 0) > 1) {
      finalPlayerId = null;
      matchWarning = 'Belirsiz/çakışan eşleşme: Bu profil aynı maçta birden fazla EA oyuncusuyla eşleşti';
    }

    const rosterVal = validateRosterMembership({
      player_id: finalPlayerId,
      match_team_id: team_id,
      season_id: seasonId,
      memberships
    });

    const extra_stats = {
      roster_status: rosterVal.roster_status,
      roster_warning: rosterVal.roster_warning || matchWarning || null,
      registered_team_id: rosterVal.registered_team_id,
      registered_team_name: rosterVal.registered_team_name,
      match_team_id: team_id,
      ea_identifier_status: matchRes.status
    };

    return {
      match_id: newMatch.id,
      player_id: finalPlayerId,
      ea_player_id: p.ea_player_id,
      ea_player_name: p.ea_player_name,
      team_id: team_id,
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
      red_cards: p.red_cards,
      is_mom: p.is_mom,
      extra_stats
    };
  });

  const { error: statsErr } = await supabase.from('match_player_stats').insert(statsToInsert);
  
  if (statsErr) {
    // Basic rollback attempt (not a true transaction but helps)
    await supabase.from('matches').delete().eq('id', newMatch.id);
    console.error('[importEaMatchAction] Player stats insert error:', statsErr);
    return { error: 'Oyuncu istatistikleri kaydedilemedi. Maç kaydı geri alındı.' };
  }

  await logAdminAudit({
    action: 'IMPORT_EA_MATCH',
    entity_type: 'matches',
    entity_id: newMatch.id,
    entity_label: `EA Maç #${matchData.ea_match_id}`,
    new_data: {
      fixture_id: matchData.fixture_id,
      season_id: seasonId,
      league_id: leagueId,
      ea_match_id: matchData.ea_match_id,
      home_score: matchData.is_reversed ? matchData.away_team.score : matchData.home_team.score,
      away_score: matchData.is_reversed ? matchData.home_team.score : matchData.away_team.score,
      player_stats_count: statsToInsert.length
    },
    description: `EA Maçı (#${matchData.ea_match_id}) başarıyla sisteme aktarıldı (${statsToInsert.length} oyuncu istatistiği).`,
    actor_id: user.id
  });

  revalidatePath('/admin/matches');
  return { success: true };
}
