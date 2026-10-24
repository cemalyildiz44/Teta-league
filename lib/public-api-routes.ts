/* eslint-disable @typescript-eslint/no-explicit-any -- the Supabase client is injected (real client in routes, a fake in tests) */
// Query logic of the read-only public API. Every query selects an explicit allow-list of columns, so private profile
// fields, internal match fields (screenshots, reviewers, EA ids, notes) and admin data can never reach a response.
import { ApiError, enumParam, intParam, pageMeta, pageParams, slugParam, usernamePrefixParam, uuidParam } from './public-api.ts';

type Supa = any;
type Out = { data: unknown; meta?: unknown };

export const COLUMNS = {
  seasons: 'id, name, slug, status',
  leagues: 'id, name, level',
  teams: 'id, name, slug, logo_url, is_active',
  teamStats: 'league_id, team_id, matches_played, wins, draws, losses, goals_for, goals_against, points',
  profiles: 'id, username, avatar_url, primary_position, alternative_positions, platform',
  profileRef: 'id, username, avatar_url, status',
  playerStats: 'player_id, matches_played, goals, assists, rating_sum, rating_count, shots, passes_made, pass_attempts, tackles_made, tackle_attempts, saves, goals_conceded, cleansheets_gk, cleansheets_def, red_cards, mom_count',
  scorers: 'player_id, matches_played, goals, assists',
  teamScorers: 'player_id, team_id, matches_played, goals, assists',
  fixtures: 'id, league_id, week_number, home_team_id, away_team_id, scheduled_at, status',
  results: 'fixture_id, home_score, away_score, played_at',
} as const;

const FIXTURE_STATUSES = ['SCHEDULED', 'COMPLETED', 'POSTPONED', 'CANCELLED', 'FORFEITED'] as const;

/** Throws a generic error: details stay in the server log, never in the response. */
function must(res: { data: any; error: { code?: string } | null; count?: number | null }): { data: any; count: number | null } {
  if (res.error) throw new Error('db:' + (res.error.code ?? 'error'));
  return { data: res.data ?? [], count: res.count ?? null };
}

async function resolveSeason(sb: Supa, sp: URLSearchParams) {
  const slug = slugParam(sp, 'season');
  if (slug) {
    const { data } = must(await sb.from('seasons').select(COLUMNS.seasons).eq('slug', slug).limit(1));
    if (!data[0]) throw new ApiError(404, 'not_found', 'Season not found.');
    return data[0];
  }
  const active = must(await sb.from('seasons').select(COLUMNS.seasons).eq('status', 'ACTIVE').limit(1)).data[0];
  if (active) return active;
  const latest = must(await sb.from('seasons').select(COLUMNS.seasons).order('created_at', { ascending: false }).limit(1)).data[0];
  if (!latest) throw new ApiError(404, 'not_found', 'No season found.');
  return latest;
}

async function leaguesOf(sb: Supa, seasonId: string, leagueId: string | null) {
  let q = sb.from('leagues').select(COLUMNS.leagues).eq('season_id', seasonId).order('level', { ascending: true });
  if (leagueId) q = q.eq('id', leagueId);
  const { data } = must(await q);
  if (leagueId && !data[0]) throw new ApiError(404, 'not_found', 'League not found in this season.');
  return data as { id: string; name: string; level: number }[];
}

async function teamsByIds(sb: Supa, ids: string[]) {
  const map = new Map<string, { id: string; name: string; slug: string; logo_url: string | null }>();
  if (!ids.length) return map;
  const { data } = must(await sb.from('teams').select(COLUMNS.teams).in('id', ids));
  for (const t of data as any[]) map.set(t.id, { id: t.id, name: t.name, slug: t.slug, logo_url: t.logo_url ?? null });
  return map;
}

// Same ordering as the site's standings table (app/lig/utils.ts compareTeamStats): points, goal difference, goals for, wins, name.
export function compareStandings(a: any, b: any): number {
  if (b.points !== a.points) return b.points - a.points;
  const gdA = a.goals_for - a.goals_against;
  const gdB = b.goals_for - b.goals_against;
  if (gdB !== gdA) return gdB - gdA;
  if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return String(a.team.name).localeCompare(String(b.team.name), 'tr');
}

export async function getStandings(sb: Supa, sp: URLSearchParams): Promise<Out> {
  const page = pageParams(sp, 100, 100);
  const leagueId = uuidParam(sp, 'league');
  const season = await resolveSeason(sb, sp);
  const leagues = await leaguesOf(sb, season.id, leagueId);
  const ids = leagues.map((l) => l.id);
  if (!ids.length) return { data: [], meta: { season, ...pageMeta(page, 0) } };

  const [members, stats] = await Promise.all([
    sb.from('league_teams').select('league_id, team_id').in('league_id', ids).eq('season_id', season.id).eq('is_active', true),
    sb.from('team_season_stats').select(COLUMNS.teamStats).in('league_id', ids).eq('season_id', season.id),
  ]);
  const memberRows = must(members).data as { league_id: string; team_id: string }[];
  const statRows = must(stats).data as any[];
  const byKey = new Map(statRows.map((s) => [`${s.league_id}:${s.team_id}`, s]));
  const teams = await teamsByIds(sb, [...new Set(memberRows.map((m) => m.team_id))]);

  const rows: any[] = [];
  for (const league of leagues) {
    const table = memberRows
      .filter((m) => m.league_id === league.id && teams.has(m.team_id))
      .map((m) => {
        const s = byKey.get(`${league.id}:${m.team_id}`);
        const row = {
          team: teams.get(m.team_id)!,
          matches_played: s?.matches_played ?? 0,
          wins: s?.wins ?? 0,
          draws: s?.draws ?? 0,
          losses: s?.losses ?? 0,
          goals_for: s?.goals_for ?? 0,
          goals_against: s?.goals_against ?? 0,
          points: s?.points ?? 0,
        };
        return { ...row, goal_difference: row.goals_for - row.goals_against };
      })
      .sort(compareStandings);
    table.forEach((r, i) => rows.push({ league: { id: league.id, name: league.name, level: league.level }, rank: i + 1, ...r }));
  }
  return { data: rows.slice(page.from, page.to + 1), meta: { season, ...pageMeta(page, rows.length) } };
}

export async function getTeams(sb: Supa, sp: URLSearchParams): Promise<Out> {
  const page = pageParams(sp);
  const leagueId = uuidParam(sp, 'league');
  const active = enumParam(sp, 'active', ['true', 'false'] as const);
  let q = sb.from('teams').select(COLUMNS.teams, { count: 'exact' }).order('name', { ascending: true }).order('id', { ascending: true });
  if (active) q = q.eq('is_active', active === 'true');
  if (leagueId) {
    const { data } = must(await sb.from('league_teams').select('team_id').eq('league_id', leagueId).eq('is_active', true));
    const teamIds = (data as { team_id: string }[]).map((r) => r.team_id);
    if (!teamIds.length) return { data: [], meta: pageMeta(page, 0) };
    q = q.in('id', teamIds);
  }
  const { data, count } = must(await q.range(page.from, page.to));
  const rows = (data as any[]).map((t) => ({ id: t.id, name: t.name, slug: t.slug, logo_url: t.logo_url ?? null, is_active: !!t.is_active }));
  return { data: rows, meta: pageMeta(page, count) };
}

export async function getPlayers(sb: Supa, sp: URLSearchParams): Promise<Out> {
  const page = pageParams(sp);
  const prefix = usernamePrefixParam(sp, 'q');
  const season = await resolveSeason(sb, sp);
  let q = sb.from('profiles').select(COLUMNS.profiles, { count: 'exact' }).eq('status', 'ACTIVE').order('username', { ascending: true }).order('id', { ascending: true });
  if (prefix) q = q.ilike('username', prefix + '%');
  const { data, count } = must(await q.range(page.from, page.to));
  const profiles = data as any[];
  const stats = new Map<string, any>();
  if (profiles.length) {
    const res = must(await sb.from('player_season_stats').select(COLUMNS.playerStats).eq('season_id', season.id).in('player_id', profiles.map((p) => p.id)));
    for (const s of res.data as any[]) stats.set(s.player_id, s);
  }
  const rows = profiles.map((p) => {
    const s = stats.get(p.id);
    return {
      id: p.id,
      username: p.username,
      avatar_url: p.avatar_url ?? null,
      primary_position: p.primary_position ?? null,
      alternative_positions: p.alternative_positions ?? [],
      platform: p.platform ?? null,
      season_stats: s
        ? {
            matches_played: s.matches_played, goals: s.goals, assists: s.assists,
            average_rating: s.rating_count > 0 ? Math.round((s.rating_sum / s.rating_count) * 100) / 100 : null,
            shots: s.shots, passes_made: s.passes_made, pass_attempts: s.pass_attempts,
            tackles_made: s.tackles_made, tackle_attempts: s.tackle_attempts, saves: s.saves, goals_conceded: s.goals_conceded,
            cleansheets_gk: s.cleansheets_gk, cleansheets_def: s.cleansheets_def, red_cards: s.red_cards, man_of_the_match: s.mom_count,
          }
        : null,
    };
  });
  return { data: rows, meta: { season: { id: season.id, name: season.name, slug: season.slug }, ...pageMeta(page, count) } };
}

export async function getMatches(sb: Supa, sp: URLSearchParams): Promise<Out> {
  const page = pageParams(sp);
  const leagueId = uuidParam(sp, 'league');
  const week = sp.get('week') ? intParam(sp, 'week', 1, 1, 200) : null;
  const teamSlug = slugParam(sp, 'team');
  const status = enumParam(sp, 'status', FIXTURE_STATUSES);
  const season = await resolveSeason(sb, sp);
  const leagues = await leaguesOf(sb, season.id, leagueId);
  if (!leagues.length) return { data: [], meta: pageMeta(page, 0) };

  let q = sb.from('fixtures').select(COLUMNS.fixtures, { count: 'exact' }).eq('season_id', season.id).in('league_id', leagues.map((l) => l.id));
  if (week) q = q.eq('week_number', week);
  if (status) q = q.eq('status', status);
  if (teamSlug) {
    const t = must(await sb.from('teams').select('id').eq('slug', teamSlug).limit(1)).data[0] as { id: string } | undefined;
    if (!t) throw new ApiError(404, 'not_found', 'Team not found.');
    q = q.or(`home_team_id.eq.${t.id},away_team_id.eq.${t.id}`); // t.id comes from the database, not from the request
  }
  const { data, count } = must(await q.order('week_number', { ascending: true }).order('scheduled_at', { ascending: true }).order('id', { ascending: true }).range(page.from, page.to));
  const fixtures = data as any[];
  const teams = await teamsByIds(sb, [...new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]))]);
  const results = new Map<string, any>();
  if (fixtures.length) {
    // only reviewed (APPROVED) matches are public results; pending/rejected ones are never exposed
    const res = must(await sb.from('matches').select(COLUMNS.results).eq('status', 'APPROVED').in('fixture_id', fixtures.map((f) => f.id)));
    for (const m of res.data as any[]) results.set(m.fixture_id, m);
  }
  const leagueById = new Map(leagues.map((l) => [l.id, l]));
  const rows = fixtures.map((f) => {
    const r = results.get(f.id);
    const l = leagueById.get(f.league_id);
    return {
      id: f.id,
      league: l ? { id: l.id, name: l.name } : null,
      week: f.week_number,
      scheduled_at: f.scheduled_at,
      status: f.status,
      home_team: teams.get(f.home_team_id) ?? null,
      away_team: teams.get(f.away_team_id) ?? null,
      result: r ? { home_score: r.home_score, away_score: r.away_score, played_at: r.played_at } : null,
    };
  });
  return { data: rows, meta: { season: { id: season.id, name: season.name, slug: season.slug }, ...pageMeta(page, count) } };
}

export async function getTopScorers(sb: Supa, sp: URLSearchParams): Promise<Out> {
  const page = pageParams(sp, 10, 50);
  const leagueId = uuidParam(sp, 'league');
  const season = await resolveSeason(sb, sp);
  if (leagueId) await leaguesOf(sb, season.id, leagueId); // 404 unless the league belongs to this season

  const table = leagueId ? 'player_team_season_stats' : 'player_season_stats';
  let q = sb.from(table).select(leagueId ? COLUMNS.teamScorers : COLUMNS.scorers, { count: 'exact' }).eq('season_id', season.id).gt('goals', 0);
  if (leagueId) q = q.eq('league_id', leagueId);
  const { data, count } = must(await q.order('goals', { ascending: false }).order('assists', { ascending: false }).order('matches_played', { ascending: true }).order('player_id', { ascending: true }).range(page.from, page.to));
  const stats = data as any[];

  const profiles = new Map<string, any>();
  if (stats.length) {
    const res = must(await sb.from('profiles').select(COLUMNS.profileRef).in('id', stats.map((s) => s.player_id)));
    for (const p of res.data as any[]) profiles.set(p.id, p);
  }
  const teams = leagueId ? await teamsByIds(sb, [...new Set(stats.map((s) => s.team_id))]) : new Map();
  const rows = stats
    .map((s, i) => ({ s, i, p: profiles.get(s.player_id) }))
    .filter(({ p }) => p && p.status === 'ACTIVE')
    .map(({ s, i, p }) => ({
      rank: page.from + i + 1,
      player: { id: p.id, username: p.username, avatar_url: p.avatar_url ?? null },
      team: leagueId ? teams.get(s.team_id) ?? null : undefined,
      matches_played: s.matches_played,
      goals: s.goals,
      assists: s.assists,
    }));
  return { data: rows, meta: { season: { id: season.id, name: season.name, slug: season.slug }, ...pageMeta(page, count) } };
}
