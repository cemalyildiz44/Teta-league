import type { SupabaseClient } from '@supabase/supabase-js';
import { compareTeamStats } from '@/app/lig/utils';

// Data for the weekly Instagram posts (admin "Haftalık Paylaşım"). Standings follow the league page's
// order (penalty-adjusted points, expelled teams last); TOTW reads the locked selections.

export type PostTheme = 'superlig' | 'ecl';

export interface PostLeague {
  id: string;
  name: string;
  level: number | null;
  season_id: string;
}

export interface StandingsPostRow {
  rank: number;
  teamName: string;
  played: number;
  goalDifference: number;
  points: number;
}

export interface TotwPostPlayer {
  slotIndex: number;
  playerName: string;
  teamName: string;
}

export function themeForLeague(league: Pick<PostLeague, 'name' | 'level'>): PostTheme {
  const name = league.name.toLocaleLowerCase('tr');
  return league.level === 1 || name.includes('süper') || name.includes('super') ? 'superlig' : 'ecl';
}

export async function getPostLeague(supabase: SupabaseClient, leagueId: string): Promise<PostLeague | null> {
  const { data } = await supabase.from('leagues').select('id, name, level, season_id').eq('id', leagueId).maybeSingle();
  return data;
}

interface ApprovedMatch {
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  played_at: string | null;
  approved_at: string | null;
  week: number | null;
}

const matchWeek = (m: ApprovedMatch) => m.week;

// matches → fixtures is a composite foreign key that PostgREST cannot embed, so weeks are joined here
async function getApprovedMatches(supabase: SupabaseClient, league: PostLeague): Promise<ApprovedMatch[]> {
  const [matchesRes, fixturesRes] = await Promise.all([
    supabase
      .from('matches')
      .select('fixture_id, home_team_id, away_team_id, home_score, away_score, played_at, approved_at')
      .eq('league_id', league.id)
      .eq('season_id', league.season_id)
      .eq('status', 'APPROVED'),
    supabase.from('fixtures').select('id, week_number').eq('league_id', league.id).eq('season_id', league.season_id),
  ]);
  const weeks = new Map((fixturesRes.data || []).map((f) => [f.id as string, f.week_number as number]));
  return (matchesRes.data || []).map((m) => ({ ...m, week: (m.fixture_id && weeks.get(m.fixture_id)) || null }));
}

// Highest fixture week that has an approved result: the default week of the standings post
export async function getLatestPlayedWeek(supabase: SupabaseClient, league: PostLeague): Promise<number> {
  const weeks = (await getApprovedMatches(supabase, league)).map(matchWeek).filter((w): w is number => w !== null);
  return Math.max(1, ...weeks);
}

// Standings after the given fixture week, rebuilt from approved matches the same way the database builds
// team_season_stats (recalculate_season_stats). Matches without a fixture have no week, so they count only
// from the latest played week on; penalties count once they were issued before the week's last result.
export async function getStandingsPostRows(supabase: SupabaseClient, league: PostLeague, week: number): Promise<StandingsPostRow[]> {
  const [leagueTeamsRes, matches, penaltiesRes, seasonRes] = await Promise.all([
    supabase.from('league_teams').select('team_id, team:teams!team_id(name)').eq('league_id', league.id).eq('is_active', true),
    getApprovedMatches(supabase, league),
    supabase
      .from('team_penalties')
      .select('team_id, penalty_type, points_deducted, issued_at')
      .eq('league_id', league.id)
      .eq('season_id', league.season_id)
      .eq('is_revoked', false),
    supabase.from('seasons').select('win_points, draw_points, loss_points').eq('id', league.season_id).maybeSingle(),
  ]);

  const latestWeek = Math.max(1, ...matches.map(matchWeek).filter((w): w is number => w !== null));
  const isLatest = week >= latestWeek;
  const included = matches.filter((m) => {
    const w = matchWeek(m);
    return w === null ? isLatest : w <= week;
  });
  const cutoff = Math.max(0, ...included.map((m) => Date.parse(m.approved_at || m.played_at || '') || 0));

  const winPts = seasonRes.data?.win_points ?? 3;
  const drawPts = seasonRes.data?.draw_points ?? 1;
  const lossPts = seasonRes.data?.loss_points ?? 0;

  type Tally = { matches_played: number; wins: number; goals_for: number; goals_against: number; points: number };
  const tally = new Map<string, Tally>();
  const add = (teamId: string, gf: number, ga: number) => {
    const t = tally.get(teamId) || { matches_played: 0, wins: 0, goals_for: 0, goals_against: 0, points: 0 };
    t.matches_played += 1;
    t.goals_for += gf;
    t.goals_against += ga;
    if (gf > ga) t.wins += 1;
    t.points += gf > ga ? winPts : gf === ga ? drawPts : lossPts;
    tally.set(teamId, t);
  };
  for (const m of included) {
    add(m.home_team_id, m.home_score, m.away_score);
    add(m.away_team_id, m.away_score, m.home_score);
  }

  const penaltyPoints = new Map<string, number>();
  const expelled = new Set<string>();
  for (const p of penaltiesRes.data || []) {
    if (!isLatest && Date.parse(p.issued_at) > cutoff) continue;
    if (p.penalty_type === 'EXPULSION') expelled.add(p.team_id);
    penaltyPoints.set(p.team_id, (penaltyPoints.get(p.team_id) || 0) + (p.points_deducted || 0));
  }

  const rows = (leagueTeamsRes.data || []).map((lt: { team_id: string; team: { name: string } | { name: string }[] | null }) => {
    const team = Array.isArray(lt.team) ? lt.team[0] : lt.team;
    const t = tally.get(lt.team_id) || { matches_played: 0, wins: 0, goals_for: 0, goals_against: 0, points: 0 };
    return {
      ...t,
      team_id: lt.team_id,
      team_name: team?.name || '',
      effective: Math.max(0, t.points - (penaltyPoints.get(lt.team_id) || 0)),
    };
  });

  const normal = rows
    .filter((r) => !expelled.has(r.team_id))
    .sort((a, b) => (b.effective !== a.effective ? b.effective - a.effective : compareTeamStats(a, b)));
  const out = rows.filter((r) => expelled.has(r.team_id)).sort(compareTeamStats);

  return [...normal, ...out].map((r, i) => ({
    rank: i + 1,
    teamName: r.team_name,
    played: r.matches_played,
    goalDifference: r.goals_for - r.goals_against,
    points: r.effective,
  }));
}

export interface LockedTotwWeek {
  id: string;
  weekNumber: number;
  formation: string;
}

export async function getLockedTotwWeeks(supabase: SupabaseClient, league: PostLeague): Promise<LockedTotwWeek[]> {
  const { data } = await supabase
    .from('totw_weeks')
    .select('id, week_number, formation')
    .eq('season_id', league.season_id)
    .eq('league_id', league.id)
    .eq('is_locked', true)
    .order('week_number', { ascending: false });
  return (data || []).map((w: any) => ({ id: w.id, weekNumber: w.week_number, formation: w.formation }));
}

export async function getTotwPostPlayers(
  supabase: SupabaseClient,
  league: PostLeague,
  totwWeekId: string
): Promise<TotwPostPlayer[] | null> {
  const { data: week } = await supabase
    .from('totw_weeks')
    .select('id')
    .eq('id', totwWeekId)
    .eq('league_id', league.id)
    .eq('is_locked', true)
    .maybeSingle();
  if (!week) return null;

  const { data } = await supabase
    .from('totw_selections')
    .select('slot_index, profile:profiles!player_id(username), team:teams!team_id(name)')
    .eq('totw_week_id', totwWeekId)
    .order('slot_index', { ascending: true });

  return (data || []).map((s: any) => {
    const profile = Array.isArray(s.profile) ? s.profile[0] : s.profile;
    const team = Array.isArray(s.team) ? s.team[0] : s.team;
    return { slotIndex: s.slot_index, playerName: profile?.username || '', teamName: team?.name || '' };
  });
}
