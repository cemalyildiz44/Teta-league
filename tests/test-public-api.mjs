// Public read-only API (/api/v1): auth, methods, rate limit, parameters, column allow-lists and response shapes.
// Run: node --no-warnings tests/test-public-api.mjs
import assert from 'node:assert/strict';
import { authenticate, handleGet, hit, resetRateLimits, extractApiKey, secretsMatch, configuredKey, methodNotAllowed, pageParams, usernamePrefixParam, FAILED_AUTH_PER_MINUTE, RATE_LIMIT_PER_MINUTE, MAX_PER_PAGE } from '../lib/public-api.ts';
import { COLUMNS, getStandings, getTeams, getPlayers, getMatches, getTopScorers } from '../lib/public-api-routes.ts';

const KEY = 'k'.repeat(10) + 'TestKey-0123456789abcdefghijkl'; // >= 32 chars, test value only
const ENV = { TETA_PUBLIC_API_KEY: KEY };
const req = (headers = {}, url = 'https://x.test/api/v1/teams') => new Request(url, { headers });
const body = async (r) => JSON.parse(await r.text());

// ------------------------------------------------------------------ fake Supabase (honours select() column lists, filters, order, range, count)
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S1 = U(1), L1 = U(11), L2 = U(12);
const T = [1, 2, 3, 4].map((i) => U(20 + i));
const P = [1, 2, 3, 4].map((i) => U(30 + i));
const db = {
  seasons: [{ id: S1, name: 'Sezon 1', slug: 'sezon-1', status: 'ACTIVE', created_at: '2026-01-01', secret_note: 'x' }],
  leagues: [{ id: L1, season_id: S1, name: 'Süper Lig', level: 1, rules: 'private rules' }, { id: L2, season_id: S1, name: 'ECL', level: 2 }],
  teams: T.map((id, i) => ({ id, name: ['Alfa', 'Beta', 'Gama', 'Delta'][i], slug: ['alfa', 'beta', 'gama', 'delta'][i], logo_url: null, is_active: true, ea_club_id: 99000 + i, ea_club_name: 'PRIVATE', stream_url: 'https://stream', instagram_url: 'https://ig' })),
  league_teams: [[L1, T[0]], [L1, T[1]], [L1, T[2]], [L2, T[3]]].map(([league_id, team_id]) => ({ league_id, team_id, season_id: S1, is_active: true, captain_id: P[0] })),
  team_season_stats: [
    { league_id: L1, season_id: S1, team_id: T[0], matches_played: 2, wins: 1, draws: 1, losses: 0, goals_for: 4, goals_against: 2, points: 4 },
    { league_id: L1, season_id: S1, team_id: T[1], matches_played: 2, wins: 1, draws: 1, losses: 0, goals_for: 3, goals_against: 1, points: 4 },
  ],
  profiles: [
    { id: P[0], username: 'alice', avatar_url: 'a.png', primary_position: 'ST', alternative_positions: ['LW'], platform: 'PS5', status: 'ACTIVE', full_name: 'Alice Real', bio: 'private bio', current_ea_player_id: 'EA-SECRET', discord_url: 'd', instagram_url: 'i', social_links: {}, beta_old_stats: {}, email: 'alice@example.com' },
    { id: P[1], username: 'bob_x', avatar_url: null, primary_position: 'GK', alternative_positions: null, platform: null, status: 'ACTIVE', full_name: 'Bob', bio: null, current_ea_player_id: 'EA2' },
    { id: P[2], username: 'banned_guy', avatar_url: null, primary_position: 'CB', alternative_positions: [], platform: 'PC', status: 'BANNED', full_name: 'B' },
  ],
  player_season_stats: [
    { player_id: P[0], season_id: S1, matches_played: 3, goals: 5, assists: 2, rating_sum: 21, rating_count: 3, shots: 9, passes_made: 10, pass_attempts: 12, tackles_made: 1, tackle_attempts: 2, saves: 0, goals_conceded: 0, cleansheets_gk: 0, cleansheets_def: 0, red_cards: 0, mom_count: 1 },
    { player_id: P[1], season_id: S1, matches_played: 3, goals: 5, assists: 4, rating_sum: 0, rating_count: 0, shots: 1, passes_made: 1, pass_attempts: 1, tackles_made: 0, tackle_attempts: 0, saves: 7, goals_conceded: 1, cleansheets_gk: 1, cleansheets_def: 0, red_cards: 0, mom_count: 0 },
    { player_id: P[2], season_id: S1, matches_played: 3, goals: 9, assists: 0, rating_sum: 1, rating_count: 1, shots: 0, passes_made: 0, pass_attempts: 0, tackles_made: 0, tackle_attempts: 0, saves: 0, goals_conceded: 0, cleansheets_gk: 0, cleansheets_def: 0, red_cards: 0, mom_count: 0 },
  ],
  player_team_season_stats: [
    { player_id: P[0], team_id: T[0], league_id: L1, season_id: S1, matches_played: 3, goals: 5, assists: 2 },
    { player_id: P[1], team_id: T[1], league_id: L1, season_id: S1, matches_played: 3, goals: 5, assists: 4 },
  ],
  fixtures: [
    { id: U(101), season_id: S1, league_id: L1, week_number: 1, home_team_id: T[0], away_team_id: T[1], scheduled_at: '2026-02-01T19:00:00Z', status: 'COMPLETED', notes: 'private note', created_by: P[0] },
    { id: U(102), season_id: S1, league_id: L1, week_number: 2, home_team_id: T[1], away_team_id: T[2], scheduled_at: '2026-02-08T19:00:00Z', status: 'SCHEDULED', notes: null, created_by: P[0] },
    { id: U(103), season_id: S1, league_id: L1, week_number: 3, home_team_id: T[2], away_team_id: T[0], scheduled_at: '2026-02-15T19:00:00Z', status: 'SCHEDULED', notes: null, created_by: P[0] },
  ],
  matches: [
    { id: U(201), fixture_id: U(101), status: 'APPROVED', home_score: 3, away_score: 1, played_at: '2026-02-01T20:00:00Z', screenshot_url: 'https://private/shot.png', submitted_by: P[0], approved_by: P[1], rejection_reason: null, notes: 'internal', ea_match_id: '123456' },
    { id: U(202), fixture_id: U(102), status: 'PENDING_REVIEW', home_score: 7, away_score: 7, played_at: '2026-02-08T20:00:00Z', screenshot_url: null, submitted_by: P[0], approved_by: null, ea_match_id: '777' },
  ],
};

function fake(opts = {}) {
  const log = [];
  const from = (table) => {
    const st = { table, cols: null, filters: [], orders: [], range: null, limit: null, count: false };
    const b = {
      select(cols, o) { st.cols = String(cols).split(',').map((c) => c.trim()); st.count = !!o?.count; return b; },
      eq(c, v) { st.filters.push((r) => r[c] === v); return b; },
      neq(c, v) { st.filters.push((r) => r[c] !== v); return b; },
      gt(c, v) { st.filters.push((r) => r[c] > v); return b; },
      in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return b; },
      ilike(c, pat) { const p = pat.replace(/\\(.)/g, '$1').replace(/%$/, '').toLowerCase(); st.filters.push((r) => String(r[c]).toLowerCase().startsWith(p)); return b; },
      or(expr) { const parts = expr.split(',').map((x) => x.split('.')); st.filters.push((r) => parts.some(([c, op, v]) => op === 'eq' && r[c] === v)); return b; },
      order(c, o) { st.orders.push([c, o?.ascending !== false]); return b; },
      range(a, z) { st.range = [a, z]; return b; },
      limit(n) { st.limit = n; return b; },
      then(resolve, reject) {
        log.push({ table, cols: st.cols });
        if (opts.failTable === table) return resolve({ data: null, error: { code: '42P01', message: 'relation "secret_table" does not exist' } });
        let rows = (db[table] ?? []).filter((r) => st.filters.every((f) => f(r)));
        for (const [c, asc] of [...st.orders].reverse()) rows = [...rows].sort((x, y) => (x[c] > y[c] ? 1 : x[c] < y[c] ? -1 : 0) * (asc ? 1 : -1));
        const total = rows.length;
        if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
        if (st.limit !== null) rows = rows.slice(0, st.limit);
        rows = rows.map((r) => Object.fromEntries(st.cols.filter((c) => c in r).map((c) => [c, r[c]])));
        resolve({ data: rows, error: null, count: st.count ? total : null });
      },
    };
    return b;
  };
  return { from, log };
}
const sp = (q = '') => new URLSearchParams(q);
const FORBIDDEN = ['email', 'full_name', 'bio', 'current_ea_player_id', 'discord_url', 'instagram_url', 'social_links', 'beta_old_stats', 'ea_club_id', 'ea_club_name', 'stream_url', 'screenshot_url', 'submitted_by', 'approved_by', 'rejection_reason', 'ea_match_id', 'notes', 'created_by', 'captain_id', 'rules', 'secret_note', 'status_text'];
const hasForbidden = (v) => { const s = JSON.stringify(v); return FORBIDDEN.filter((k) => new RegExp(`"${k}"\\s*:`).test(s)); };

// ------------------------------------------------------------------ 1. authentication and methods
{
  resetRateLimits();
  assert.equal(configuredKey({}), null);
  assert.equal(configuredKey({ TETA_PUBLIC_API_KEY: 'short' }), null, 'weak keys disable the API');
  assert.equal(configuredKey(ENV), KEY);

  assert.equal(extractApiKey(new Headers({ authorization: `Bearer ${KEY}` })), KEY);
  assert.equal(extractApiKey(new Headers({ authorization: `bearer   ${KEY}` })), KEY);
  assert.equal(extractApiKey(new Headers({ 'x-api-key': KEY })), KEY);
  assert.equal(extractApiKey(new Headers({ authorization: 'Basic abc' })), null);
  assert.equal(extractApiKey(new Headers()), null);
  assert.equal(extractApiKey(new Headers()), null, 'the key is never read from the URL');
  assert.equal(secretsMatch(KEY, KEY), true);
  assert.equal(secretsMatch(KEY + 'x', KEY), false);
  assert.equal(secretsMatch('', KEY), false);

  const ok = async () => ({ data: [1] });
  // missing / wrong key -> 401 (and the key is not echoed)
  let r = await handleGet(req(), ok, ENV);
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('www-authenticate'), 'Bearer');
  assert.equal((await body(r)).error.code, 'unauthorized');
  r = await handleGet(req({ authorization: 'Bearer wrong-key-wrong-key-wrong-key-wrong-key' }), ok, ENV);
  assert.equal(r.status, 401);
  assert.ok(!(await r.clone().text()).includes('wrong-key'));
  r = await handleGet(req({ 'x-api-key': KEY }, `https://x.test/api/v1/teams?api_key=${KEY}`), ok, ENV);
  assert.equal(r.status, 200, 'x-api-key header works');
  r = await handleGet(req({}, `https://x.test/api/v1/teams?api_key=${KEY}&key=${KEY}`), ok, ENV);
  assert.equal(r.status, 401, 'a key in the query string is ignored');
  // API not configured -> disabled, never open
  r = await handleGet(req({ authorization: `Bearer ${KEY}` }), ok, {});
  assert.equal(r.status, 503);
  // success headers
  r = await handleGet(req({ authorization: `Bearer ${KEY}` }), ok, ENV);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'no CORS: server-to-server use only');
  assert.equal(r.headers.get('x-ratelimit-limit'), String(RATE_LIMIT_PER_MINUTE));
  assert.deepEqual(await body(r), { data: [1] });

  // non-GET methods
  const m = methodNotAllowed();
  assert.equal(m.status, 405);
  assert.equal(m.headers.get('allow'), 'GET');
}

// ------------------------------------------------------------------ 2. rate limits
{
  resetRateLimits();
  const good = { authorization: `Bearer ${KEY}` };
  const ok = async () => ({ data: [] });
  let last;
  for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) last = await handleGet(req(good), ok, ENV);
  assert.equal(last.status, 200);
  assert.equal(last.headers.get('x-ratelimit-remaining'), '0');
  const over = await handleGet(req(good), ok, ENV);
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers.get('retry-after')) >= 1);
  assert.equal((await body(over)).error.code, 'rate_limited');

  // failed attempts are limited per client IP (brute-force guard), independent of the valid-key bucket
  resetRateLimits();
  const bad = { authorization: 'Bearer nope-nope-nope-nope-nope-nope-nope-nope', 'x-forwarded-for': '203.0.113.9' };
  for (let i = 0; i < FAILED_AUTH_PER_MINUTE; i++) assert.equal((await handleGet(req(bad), ok, ENV)).status, 401);
  assert.equal((await handleGet(req(bad), ok, ENV)).status, 429);
  assert.equal((await handleGet(req({ ...bad, 'x-forwarded-for': '203.0.113.10' }), ok, ENV)).status, 401, 'other IPs unaffected');
  assert.equal((await handleGet(req(good), ok, ENV)).status, 200, 'the valid key still works');

  // fixed window resets
  resetRateLimits();
  assert.equal(hit('t', 1, 1000).allowed, true);
  assert.equal(hit('t', 1, 1001).allowed, false);
  assert.equal(hit('t', 1, 1000 + 61_000).allowed, true);
}

// ------------------------------------------------------------------ 3. parameters
{
  resetRateLimits();
  const run = (q, fn = async () => ({ data: [] })) => handleGet(req({ authorization: `Bearer ${KEY}` }, `https://x.test/api/v1/x?${q}`), fn, ENV);
  const bad = async (q, fn) => { const r = await run(q, fn); assert.equal(r.status, 400, q); assert.equal((await body(r)).error.code, 'invalid_parameter'); };
  const f = (fnc) => (s) => fnc(fake(), s);
  for (const q of ['page=0', 'page=-1', 'page=abc', 'page=1.5', 'per_page=0', `per_page=${MAX_PER_PAGE + 1}`, 'per_page=1e2', 'page=99999999999']) await bad(q, f(getTeams));
  await bad('league=not-a-uuid', f(getTeams));
  await bad("league=' or 1=1 --", f(getTeams));
  await bad('active=maybe', f(getTeams));
  await bad('season=Bad Slug!', f(getStandings));
  await bad('season=../etc/passwd', f(getStandings));
  await bad('week=0', f(getMatches));
  await bad('week=201', f(getMatches));
  await bad('status=DELETE', f(getMatches));
  await bad('team=a b', f(getMatches));
  await bad('q=a', f(getPlayers));
  await bad('q=ab,or(id.neq.0)', f(getPlayers));
  assert.equal(usernamePrefixParam(sp('q=a_b'), 'q'), 'a\\_b', 'LIKE wildcards are escaped');
  assert.deepEqual(pageParams(sp('page=3&per_page=10')), { page: 3, perPage: 10, from: 20, to: 29 });
  assert.equal(pageParams(sp()).perPage, 20);
}

// ------------------------------------------------------------------ 4. data, allow-lists and shapes
{
  const forbiddenCols = (log) => log.flatMap((l) => (l.cols ?? []).filter((c) => FORBIDDEN.includes(c)));
  const allSelects = (log) => log.map((l) => `${l.table}: ${l.cols.join(',')}`);

  // standings: all league members (zeros when no stats), sorted, ranked, only public fields
  let f1 = fake();
  let out = await getStandings(f1, sp());
  assert.equal(out.data.length, 4);
  const l1 = out.data.filter((r) => r.league.id === L1);
  assert.deepEqual(l1.map((r) => [r.rank, r.team.slug, r.points, r.goal_difference]), [[1, 'alfa', 4, 2], [2, 'beta', 4, 2], [3, 'gama', 0, 0]], 'points, goal difference, goals for, then name');
  assert.equal(out.data.find((r) => r.league.id === L2).rank, 1);
  assert.deepEqual(hasForbidden(out), []);
  assert.deepEqual(forbiddenCols(f1.log), []);
  assert.equal((await getStandings(fake(), sp(`league=${L2}`))).data.length, 1);
  await assert.rejects(getStandings(fake(), sp(`league=${U(999)}`)), (e) => e.status === 404);
  await assert.rejects(getStandings(fake(), sp('season=nope')), (e) => e.status === 404);

  // teams: public fields only, pagination and league filter
  const f2 = fake();
  out = await getTeams(f2, sp('per_page=2&page=2'));
  assert.equal(out.meta.total, 4);
  assert.equal(out.meta.total_pages, 2);
  assert.deepEqual(out.data.map((t) => t.slug), ['delta', 'gama'].sort(), 'second page, alphabetical');
  assert.deepEqual(Object.keys(out.data[0]).sort(), ['id', 'is_active', 'logo_url', 'name', 'slug']);
  assert.deepEqual(hasForbidden(out), []);
  assert.deepEqual(forbiddenCols(f2.log), []);
  assert.equal((await getTeams(fake(), sp(`league=${L2}`))).data.length, 1);

  // players: no private profile fields, banned users hidden, stats mapped, prefix search
  const f3 = fake();
  out = await getPlayers(f3, sp());
  assert.deepEqual(out.data.map((p) => p.username), ['alice', 'bob_x']);
  assert.deepEqual(Object.keys(out.data[0]).sort(), ['alternative_positions', 'avatar_url', 'id', 'platform', 'primary_position', 'season_stats', 'username']);
  assert.equal(out.data[0].season_stats.average_rating, 7);
  assert.equal(out.data[1].season_stats.average_rating, null);
  assert.equal(out.data[0].season_stats.man_of_the_match, 1);
  assert.deepEqual(hasForbidden(out), []);
  assert.ok(!JSON.stringify(out).includes('alice@example.com') && !JSON.stringify(out).includes('EA-SECRET') && !JSON.stringify(out).includes('Alice Real'));
  assert.deepEqual(forbiddenCols(f3.log), []);
  assert.deepEqual((await getPlayers(fake(), sp('q=AL'))).data.map((p) => p.username), ['alice']);
  assert.deepEqual((await getPlayers(fake(), sp('q=zz'))).data, []);

  // matches: results only from APPROVED matches; no internal fields
  const f4 = fake();
  out = await getMatches(f4, sp());
  assert.equal(out.data.length, 3);
  assert.deepEqual(out.data[0].result, { home_score: 3, away_score: 1, played_at: '2026-02-01T20:00:00Z' });
  assert.equal(out.data[1].result, null, 'a PENDING_REVIEW score (7-7) is never exposed');
  assert.equal(out.data[2].result, null);
  assert.ok(!JSON.stringify(out).includes('"home_score":7'));
  assert.equal(out.data[0].home_team.slug, 'alfa');
  assert.deepEqual(hasForbidden(out), []);
  assert.deepEqual(forbiddenCols(f4.log), []);
  assert.deepEqual((await getMatches(fake(), sp('week=2'))).data.map((m) => m.week), [2]);
  assert.deepEqual((await getMatches(fake(), sp('team=alfa'))).data.map((m) => m.week), [1, 3]);
  assert.deepEqual((await getMatches(fake(), sp('status=SCHEDULED'))).data.map((m) => m.week), [2, 3]);
  await assert.rejects(getMatches(fake(), sp('team=unknown')), (e) => e.status === 404);
  assert.equal((await getMatches(fake(), sp('per_page=1'))).data.length, 1);

  // top scorers: ranked, tie-break by assists, banned hidden, league variant carries the team
  const f5 = fake();
  out = await getTopScorers(f5, sp());
  assert.ok(!out.data.some((r) => r.player.username === 'banned_guy'), 'banned players are not listed');
  assert.deepEqual(out.data.map((r) => r.player.username), ['bob_x', 'alice'], 'equal goals: more assists first');
  assert.deepEqual(Object.keys(out.data[0].player).sort(), ['avatar_url', 'id', 'username']);
  assert.deepEqual(hasForbidden(out), []);
  assert.deepEqual(forbiddenCols(f5.log), []);
  out = await getTopScorers(fake(), sp(`league=${L1}`));
  assert.deepEqual(out.data.map((r) => r.team.slug), ['beta', 'alfa']);
  assert.equal((await getTopScorers(fake(), sp('per_page=1'))).meta.per_page, 1);
  await assert.rejects(getTopScorers(fake(), sp(`league=${U(999)}`)), (e) => e.status === 404);

  // every column list used by the API is free of private fields
  for (const [name, cols] of Object.entries(COLUMNS)) {
    const bad = cols.split(',').map((c) => c.trim()).filter((c) => FORBIDDEN.includes(c));
    assert.deepEqual(bad, [], `COLUMNS.${name}`);
  }
}

// ------------------------------------------------------------------ 5. failures never leak details
{
  resetRateLimits();
  const r = await handleGet(req({ authorization: `Bearer ${KEY}` }), (s) => getTeams(fake({ failTable: 'teams' }), s), ENV);
  assert.equal(r.status, 500);
  const text = await r.text();
  assert.deepEqual(JSON.parse(text), { error: { code: 'internal_error', message: 'Something went wrong.' } });
  assert.ok(!/secret_table|relation|42P01|select|supabase/i.test(text));
  const e2 = await handleGet(req({ authorization: `Bearer ${KEY}` }), async () => { throw new Error(`password=${KEY}`); }, ENV);
  assert.equal(e2.status, 500);
  assert.ok(!(await e2.text()).includes(KEY));
}

console.log('public-api tests passed');
