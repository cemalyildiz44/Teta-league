import assert from 'node:assert/strict';
import { buildFixtureExport } from '../lib/fixture-export.ts';

const S = 's1', L = 'l1';
const season = { id: S, name: '2026', slug: 's-2026', status: 'ACTIVE', start_date: '2026-09-01', end_date: '2026-12-31' };
const leagues = [{ id: L, season_id: S, name: 'Lig 1', level: 1, status: 'ACTIVE' }];
const mkTeam = (id, ea) => ({ id, name: id, slug: id, ea_club_id: ea, ea_club_name: id, is_active: true });
const teams = [mkTeam('a', 1), mkTeam('b', 2), mkTeam('c', 3)];
const leagueTeams = ['a', 'b', 'c'].map((t) => ({ league_id: L, season_id: S, team_id: t, is_active: true }));
const fx = (id, w, h, a, at = '2026-10-11T19:00:00.000Z') => ({
  id, season_id: S, league_id: L, week_number: w, home_team_id: h, away_team_id: a, scheduled_at: at, status: 'SCHEDULED',
});
const base = { season, leagues, teams, leagueTeams, fixtures: [fx('f1', 1, 'a', 'b'), fx('f2', 2, 'b', 'c', '2026-10-18T19:00:00.000Z')], matches: [], generatedAt: new Date('2026-10-17T00:00:00Z') };
const codes = (d) => d.issues.map((i) => i.code);

// clean export
const ok = buildFixtureExport(base);
assert.equal(ok.schema, 'teta.fixtures');
assert.equal(ok.schemaVersion, 1);
assert.equal(ok.generatedAt, '2026-10-17T00:00:00.000Z');
assert.equal(ok.summary.importable, true);
assert.equal(ok.issues.length, 0);
assert.equal(ok.leagues[0].weeks[0].fixtures[0].homeTeam.eaClubId, 1);
assert.equal(ok.leagues[0].weeks[0].window.fromDate, '2026-10-11');
// 22:00 Istanbul on 11th == 19:00Z; 21:30Z -> next day locally
assert.equal(buildFixtureExport({ ...base, fixtures: [fx('f1', 1, 'a', 'b', '2026-10-11T21:30:00.000Z')] }).leagues[0].weeks[0].window.fromDate, '2026-10-12');

// exportId stable for same data, independent of generatedAt; changes with data
assert.equal(buildFixtureExport({ ...base, generatedAt: new Date() }).exportId, ok.exportId);
assert.notEqual(buildFixtureExport({ ...base, fixtures: [base.fixtures[0]] }).exportId, ok.exportId);

// missing / invalid / duplicate EA ids reported
const bad = buildFixtureExport({ ...base, teams: [mkTeam('a', null), mkTeam('b', 2), mkTeam('c', 2)] });
assert(codes(bad).includes('MISSING_EA_CLUB_ID'));
assert.equal(codes(bad).filter((c) => c === 'DUPLICATE_EA_CLUB_ID').length, 2);
assert.equal(bad.summary.importable, false);
assert(codes(buildFixtureExport({ ...base, teams: [mkTeam('a', -5), mkTeam('b', 2), mkTeam('c', 3)] })).includes('INVALID_EA_CLUB_ID'));

// inconsistent fixtures reported
const incons = buildFixtureExport({
  ...base,
  fixtures: [
    fx('f1', 1, 'a', 'a'),
    fx('f2', 0, 'a', 'zz'),
    fx('f3', 1, 'a', 'b', 'not-a-date'),
    fx('f4', 3, 'a', 'b'), fx('f5', 3, 'a', 'b'),
    { ...fx('f6', 4, 'b', 'c'), season_id: 'other' },
    fx('f7', 5, 'a', 'b', '2027-02-01T10:00:00.000Z'),
  ],
});
for (const c of ['FIXTURE_SAME_TEAM', 'FIXTURE_INVALID_WEEK', 'TEAM_NOT_FOUND', 'TEAM_NOT_IN_LEAGUE', 'FIXTURE_INVALID_DATE',
  'FIXTURE_DUPLICATE_PAIRING', 'TEAM_PLAYS_TWICE_IN_WEEK', 'FIXTURE_SEASON_MISMATCH', 'FIXTURE_OUTSIDE_SEASON_DATES']) {
  assert(codes(incons).includes(c), `missing issue ${c}`);
}
assert.equal(incons.summary.fixtureCount, 7); // nothing dropped

// match linkage + multiple matches
const m = (id, fid) => ({ id, fixture_id: fid, status: 'APPROVED', home_score: 1, away_score: 0, ea_match_id: null });
const withMatch = buildFixtureExport({ ...base, matches: [m('m1', 'f1')] });
assert.equal(withMatch.leagues[0].weeks[0].fixtures[0].match.status, 'APPROVED');
assert(codes(buildFixtureExport({ ...base, matches: [m('m1', 'f1'), m('m2', 'f1')] })).includes('MULTIPLE_MATCHES_FOR_FIXTURE'));

// league without fixtures
assert(codes(buildFixtureExport({ ...base, fixtures: [] })).includes('LEAGUE_WITHOUT_FIXTURES'));

console.log('fixture-export tests passed');
