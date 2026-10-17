import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { buildFixtureExport } from '@/lib/fixture-export';

// Read-only `teta.fixtures` v1 export. Admin-only: GET ?seasonId=<uuid>[&leagueId=<uuid>]
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export async function GET(request: Request) {
  const supabase = createClient(await cookies());

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Giriş yapmalısınız.' }, 401);

  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  if (!role) return json({ error: 'Yetkisiz erişim.' }, 403);

  const params = new URL(request.url).searchParams;
  const seasonId = params.get('seasonId') ?? '';
  const leagueId = params.get('leagueId');
  if (!UUID_REGEX.test(seasonId)) return json({ error: 'Geçerli bir seasonId zorunludur.' }, 400);
  if (leagueId !== null && !UUID_REGEX.test(leagueId)) return json({ error: 'Geçersiz leagueId.' }, 400);

  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .select('id, name, slug, status, start_date, end_date')
    .eq('id', seasonId)
    .maybeSingle();
  if (seasonErr) return json({ error: 'Sezon okunamadı: ' + seasonErr.message }, 500);
  if (!season) return json({ error: 'Sezon bulunamadı.' }, 404);

  let leaguesQ = supabase.from('leagues').select('id, season_id, name, level, status').eq('season_id', seasonId);
  let leagueTeamsQ = supabase.from('league_teams').select('league_id, season_id, team_id, is_active').eq('season_id', seasonId);
  let fixturesQ = supabase
    .from('fixtures')
    .select('id, season_id, league_id, week_number, home_team_id, away_team_id, scheduled_at, status')
    .eq('season_id', seasonId);
  if (leagueId) {
    leaguesQ = leaguesQ.eq('id', leagueId);
    leagueTeamsQ = leagueTeamsQ.eq('league_id', leagueId);
    fixturesQ = fixturesQ.eq('league_id', leagueId);
  }
  const [leaguesR, leagueTeamsR, fixturesR] = await Promise.all([leaguesQ, leagueTeamsQ, fixturesQ]);
  const readErr = leaguesR.error || leagueTeamsR.error || fixturesR.error;
  if (readErr) return json({ error: 'Veri okunamadı: ' + readErr.message }, 500);
  if (leagueId && !(leaguesR.data ?? []).length) return json({ error: 'Lig bu sezonda bulunamadı.' }, 404);

  const fixtures = fixturesR.data ?? [];
  const leagueTeams = leagueTeamsR.data ?? [];
  const teamIds = [...new Set([...leagueTeams.map((r) => r.team_id), ...fixtures.flatMap((f) => [f.home_team_id, f.away_team_id])])];
  const fixtureIds = fixtures.map((f) => f.id);

  const [teamsR, matchesR] = await Promise.all([
    teamIds.length
      ? supabase.from('teams').select('id, name, slug, ea_club_id, ea_club_name, is_active').in('id', teamIds)
      : Promise.resolve({ data: [], error: null }),
    fixtureIds.length
      ? supabase.from('matches').select('id, fixture_id, status, home_score, away_score, ea_match_id').in('fixture_id', fixtureIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (teamsR.error || matchesR.error) {
    return json({ error: 'Veri okunamadı: ' + (teamsR.error ?? matchesR.error)!.message }, 500);
  }

  const doc = buildFixtureExport({
    season,
    leagues: leaguesR.data ?? [],
    teams: (teamsR.data ?? []),
    leagueTeams,
    fixtures,
    matches: (matchesR.data ?? []),
  });

  return json(doc, 200, {
    'Content-Disposition': `attachment; filename="teta-fixtures-${season.slug}-${doc.exportId}.json"`,
  });
}
