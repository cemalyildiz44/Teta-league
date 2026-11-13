/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client rows are untyped here */
// Shared cache invalidation after a league match changes. This module must NOT be marked 'use server':
// every export of a 'use server' file becomes a server action that any visitor can call.
import { revalidatePath, revalidateTag } from 'next/cache';
import { slugify } from '@/app/lig/utils';
import { getScopeNames } from '@/lib/admin-scope';

export async function revalidateMatchDependencies(supabase: any, matchId: string, matchData?: any, extraPlayerUsernames?: string[]) {
  revalidatePath('/admin/matches');
  revalidatePath('/admin/players');
  revalidatePath('/');
  revalidatePath('/ligler');
  revalidatePath('/oyuncular');
  revalidatePath('/istatistikler');
  revalidatePath(`/mac/${matchId}`);
  try {
    revalidateTag('player-rankings', 'max');
    revalidateTag('public-statistics', 'max');
    revalidateTag('public-team-page', 'max');
  } catch {}

  let match = matchData;
  if (!match) {
    const { data } = await supabase
      .from('matches')
      .select('id, fixture_id, source, status, season_id, league_id, home_team_id, away_team_id')
      .eq('id', matchId)
      .maybeSingle();
    match = data;
  }
  if (!match) return;

  const { seasonSlug, leagueName } = await getScopeNames(supabase, match);
  if (seasonSlug && leagueName) {
    const leagueSlug = slugify(leagueName);
    revalidatePath(`/lig/${seasonSlug}/${leagueSlug}`);
    revalidatePath(`/lig/${seasonSlug}/${leagueSlug}/istatistikler`);
    revalidatePath(`/lig/${seasonSlug}/${leagueSlug}/fikstur`);
  }

  // Takım profillerini revalidate et
  const teamIds = [match.home_team_id, match.away_team_id].filter(Boolean);
  if (teamIds.length > 0) {
    const { data: matchTeams } = await supabase
      .from('teams')
      .select('slug')
      .in('id', teamIds);
    for (const tm of matchTeams || []) {
      if (tm.slug) {
        revalidatePath(`/takim/${tm.slug}`);
        try {
          revalidateTag(`team-${tm.slug}`, 'max');
        } catch {}
      }
    }
  }

  // Maçta oynayan ve eşleşmiş oyuncuların profillerini revalidate et
  const { data: matchPlayerRows } = await supabase
    .from('match_player_stats')
    .select('profiles!match_player_stats_player_id_fkey(username)')
    .eq('match_id', matchId)
    .not('player_id', 'is', null);

  if (matchPlayerRows) {
    for (const row of matchPlayerRows) {
      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (prof?.username) {
        revalidatePath(`/oyuncular/${encodeURIComponent(prof.username)}`);
      }
    }
  }

  if (extraPlayerUsernames && extraPlayerUsernames.length > 0) {
    for (const uname of extraPlayerUsernames) {
      if (uname) {
        revalidatePath(`/oyuncular/${encodeURIComponent(uname)}`);
      }
    }
  }
}

// Refreshes every public page at once. For changes that touch many matches/teams at a time (EA import,
// fixture import, penalties) where per-page invalidation would be easy to get wrong.
export function revalidatePublicSite() {
  revalidatePath('/', 'layout');
  try {
    revalidateTag('player-rankings', 'max');
    revalidateTag('public-statistics', 'max');
    revalidateTag('public-team-page', 'max');
  } catch {}
}
