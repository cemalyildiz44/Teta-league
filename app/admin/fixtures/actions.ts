
'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export interface TeamRef {
  id: string;
  name?: string;
}

export interface MatchPair {
  home: TeamRef;
  away: TeamRef;
  week: number;
}

/**
 * Standard Round-Robin Algorithm
 * Works for both even and odd number of teams.
 * Odd numbers are handled by a 'BYE' team.
 */
function generateRoundRobin(teams: TeamRef[], doubleRound: boolean = true): MatchPair[] {
  if (!teams || teams.length < 2) return [];

  const participants = [...teams];
  if (participants.length % 2 !== 0) {
    participants.push({ id: 'BYE', name: 'BYE' });
  }

  const n = participants.length;
  const rounds = n - 1;
  const matchesPerRound = n / 2;
  const fixtures: MatchPair[] = [];

  const currentTeams = [...participants];

  for (let round = 0; round < rounds; round++) {
    for (let match = 0; match < matchesPerRound; match++) {
      const home = currentTeams[match];
      const away = currentTeams[n - 1 - match];

      if (home.id !== 'BYE' && away.id !== 'BYE') {
        if (match === 0) {
          if (round % 2 === 0) {
            fixtures.push({ home, away, week: round + 1 });
          } else {
            fixtures.push({ home: away, away: home, week: round + 1 });
          }
        } else {
          fixtures.push({ home, away, week: round + 1 });
        }
      }
    }
    const lastTeam = currentTeams.pop()!;
    currentTeams.splice(1, 0, lastTeam);
  }

  if (doubleRound) {
    const firstHalfFixtures = [...fixtures];
    for (const fix of firstHalfFixtures) {
      fixtures.push({
        home: fix.away,
        away: fix.home,
        week: fix.week + rounds
      });
    }
  }

  return fixtures;
}

export async function generateLeagueFixturesAction(seasonId: string, leagueId: string, startDateStr: string, doubleRound: boolean = true) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Giriş yapmalısınız.' };

  const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['ADMIN', 'SUPER_ADMIN']).single();
  if (!role) return { error: 'Yetkisiz işlem.' };

  // 1. DUPLICATE KORUMASI
  const { data: existing } = await supabase
    .from('fixtures')
    .select('id')
    .eq('season_id', seasonId)
    .eq('league_id', leagueId)
    .limit(1);
    
  if (existing && existing.length > 0) {
    return { error: 'Bu lig için zaten fikstür oluşturulmuş.' };
  }

  // 2. TAKIMLARI GETİR
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

  // 3. FİKSTÜR ÜRET
  const matchPairs = generateRoundRobin(teams, doubleRound);
  
  if (matchPairs.length === 0) {
    return { error: 'Fikstür oluşturulamadı.' };
  }

  // 4. VERİTABANINA KAYDET
  const startDate = new Date(startDateStr);
  const rowsToInsert = matchPairs.map(mp => {
    // Hafta başı hesaplama (Her hafta için 7 gün ekle)
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

  revalidatePath('/admin/fixtures');
  return { success: 'Fikstür başarıyla oluşturuldu.', totalMatches: rowsToInsert.length };
}

export async function updateFixtureDateAction(fixtureId: string, newDateStr: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Giriş yapmalısınız.' };

  const { error } = await supabase.from('fixtures').update({ scheduled_at: new Date(newDateStr).toISOString(), updated_at: new Date().toISOString() }).eq('id', fixtureId);
  if (error) return { error: 'Tarih güncellenemedi: ' + error.message };

  revalidatePath('/admin/fixtures');
  return { success: 'Fikstür tarihi başarıyla güncellendi.' };
}

export async function cancelFixtureAction(fixtureId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Giriş yapmalısınız.' };

  const { error } = await supabase.from('fixtures').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('id', fixtureId);
  if (error) return { error: 'Fikstür iptal edilemedi: ' + error.message };

  revalidatePath('/admin/fixtures');
  return { success: 'Fikstür iptal edildi.' };
}

export async function deleteFixtureAction(fixtureId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Giriş yapmalısınız.' };

  const { error } = await supabase.from('fixtures').delete().eq('id', fixtureId);
  if (error) {
    if (error.code === '23503') return { error: 'Bu fikstüre bağlı maç/veri bulunduğu için silinemez.' };
    return { error: 'Fikstür silinemedi: ' + error.message };
  }

  revalidatePath('/admin/fixtures');
  return { success: 'Fikstür başarıyla silindi.' };
}

