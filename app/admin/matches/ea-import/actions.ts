'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { fetchClubMatches } from '@/lib/ea/client';
import { normalizeMatch } from '@/lib/ea/normalizer';
import { matchFixture, FixtureCandidate } from '@/lib/ea/matcher';
import { NormalizedMatch } from '@/lib/ea/types';

async function checkAdmin(supabase: any, user: any) {
  if (!user) return false;
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['ADMIN', 'SUPER_ADMIN']).single();
  return !!data;
}

export interface EAPreviewMatch extends NormalizedMatch {
  fixture_id?: string;
  match_status: 'READY' | 'DUPLICATE_EA_MATCH' | 'FIXTURE_ALREADY_HAS_MATCH' | 'UNMATCHED' | 'AMBIGUOUS';
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
    
    const { data: roleData } = await supabase.from('user_roles')
      .select('role').eq('user_id', user.id).in('role', ['ADMIN', 'SUPER_ADMIN']).single();
      
    if (!roleData) return { error: 'Unauthorized: Admins only' };

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
          if (dupFix) {
            match_status = 'FIXTURE_ALREADY_HAS_MATCH';
          } else {
            match_status = 'READY';
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

  if (matchData.match_status !== 'READY') {
    return { error: 'Maç READY statüsünde değil.' };
  }

  // 1. Insert Match
  const { data: newMatch, error: matchErr } = await supabase.from('matches').insert({
    fixture_id: matchData.fixture_id,
    season_id: seasonId,
    league_id: leagueId,
    home_team_id: matchData.home_team_id,
    away_team_id: matchData.away_team_id,
    home_score: matchData.is_reversed ? matchData.away_team.score : matchData.home_team.score,
    away_score: matchData.is_reversed ? matchData.home_team.score : matchData.away_team.score,
    source: 'AUTO',
    status: 'PENDING_REVIEW', // Important: Goes to pending review
    ea_match_id: matchData.ea_match_id,
    played_at: matchData.played_at,
    submitted_by: user.id
  }).select('id').single();

  if (matchErr || !newMatch) return { error: 'Maç kaydedilemedi: ' + matchErr?.message };

  // 2. Insert Raw Data
  await supabase.from('match_raw_ea_data').insert({
    match_id: newMatch.id,
    ea_match_id: matchData.ea_match_id,
    raw_data: matchData.raw_data,
    platform: 'common-gen5'
  });

  // 3. Match players to profiles
  const allPlayers = [
    ...matchData.home_team.players.map(p => ({ ...p, _eaClub: matchData.home_team.ea_club_id })),
    ...matchData.away_team.players.map(p => ({ ...p, _eaClub: matchData.away_team.ea_club_id }))
  ];

  const eaPlayerIds = allPlayers.map(p => p.ea_player_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, current_ea_player_id')
    .in('current_ea_player_id', eaPlayerIds);

  const profileMap = new Map(profiles?.map(p => [p.current_ea_player_id, p.id]));

  // 4. Insert Player Stats
  const statsToInsert = allPlayers.map(p => {
    const isHome = p._eaClub === matchData.home_team.ea_club_id;
    // Account for reversed fixtures
    const team_id = (isHome !== matchData.is_reversed) ? matchData.home_team_id : matchData.away_team_id;

    return {
      match_id: newMatch.id,
      player_id: profileMap.get(p.ea_player_id) || null,
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
      is_mom: p.is_mom
    };
  });

  const { error: statsErr } = await supabase.from('match_player_stats').insert(statsToInsert);
  
  if (statsErr) {
    // Basic rollback attempt (not a true transaction but helps)
    await supabase.from('matches').delete().eq('id', newMatch.id);
    return { error: 'Oyuncu statları kaydedilemedi: ' + statsErr.message };
  }

  return { success: true };
}
