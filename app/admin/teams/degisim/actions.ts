'use server';

import { cookies } from 'next/headers';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { getCachedUser } from '@/lib/fetchers';
import { logAdminAudit } from '@/lib/audit';

export interface ReplacementSummary {
  applied: boolean;
  blockers: string[];
  fixture_count: number;
  fixture_weeks: number[];
  released_players: number;
  cancelled_transfers?: number;
  unlinked_rejected_matches?: number;
  carried_stats: {
    matches_played?: number;
    wins?: number;
    draws?: number;
    losses?: number;
    goals_for?: number;
    goals_against?: number;
    points?: number;
  };
}

type Result = { summary: ReplacementSummary } | { error: string };

// Both calls go through admin_replace_team, which checks the ADMIN role itself; apply=false only reads.
async function callReplace(leagueId: string, outTeamId: string, inTeamId: string, apply: boolean) {
  const supabase = createClient(await cookies());
  const user = await getCachedUser();
  if (!user) return { supabase, user, res: { error: 'Yetkisiz erişim.' } as Result };

  const { data, error } = await supabase.rpc('admin_replace_team', {
    p_league_id: leagueId,
    p_withdrawing_team_id: outTeamId,
    p_entering_team_id: inTeamId,
    p_apply: apply,
  });
  if (error) return { supabase, user, res: { error: error.message } as Result };
  return { supabase, user, res: { summary: data as ReplacementSummary } as Result };
}

export async function previewTeamReplacement(leagueId: string, outTeamId: string, inTeamId: string): Promise<Result> {
  return (await callReplace(leagueId, outTeamId, inTeamId, false)).res;
}

export async function applyTeamReplacement(leagueId: string, outTeamId: string, inTeamId: string): Promise<Result> {
  const { supabase, user, res } = await callReplace(leagueId, outTeamId, inTeamId, true);
  if ('error' in res || !res.summary.applied) return res;

  const [{ data: teams }, { data: league }] = await Promise.all([
    supabase.from('teams').select('id, name, slug').in('id', [outTeamId, inTeamId]),
    supabase.from('leagues').select('name').eq('id', leagueId).maybeSingle(),
  ]);
  const outTeam = teams?.find((t) => t.id === outTeamId);
  const inTeam = teams?.find((t) => t.id === inTeamId);

  await logAdminAudit({
    action: 'REPLACE_TEAM',
    entity_type: 'league_teams',
    entity_id: leagueId,
    entity_label: league?.name || 'Lig',
    new_data: { withdrawing_team_id: outTeamId, entering_team_id: inTeamId, ...res.summary },
    description: `${league?.name || 'Lig'}: "${outTeam?.name || 'Takım'}" ligden çekildi, yerine "${inTeam?.name || 'Takım'}" girdi (${res.summary.fixture_count} fikstür devredildi).`,
    actor_id: user?.id,
  });

  revalidateTag('public-team-page', 'max');
  for (const team of teams || []) revalidateTag(`team-${team.slug}`, 'max');
  revalidatePath('/', 'layout');
  return res;
}
