import assert from 'node:assert/strict';
import { validateWeeklyDoc, exportZipFileName, weeklyFileName } from '../lib/fixture-weekly.ts';
import { exportWeeklyFiles, prepareExportDelivery, requireAdmin } from '../lib/fixture-import-service.ts';
import { createZip } from '../lib/zip-store.ts';

// Export delivery tests (read-only): in-memory fake Supabase, no network, no real data.
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = U(1), L = U(2), L2 = U(3), ADMIN = U(900);
const T = { a: U(11), b: U(12), c: U(13), d: U(14) };
const fx = (n, week, h, a, at, league = L) => ({ id: U(100 + n), season_id: S, league_id: league, week_number: week, home_team_id: h, away_team_id: a, scheduled_at: at, status: 'SCHEDULED', notes: null, updated_at: '2026-10-01T10:00:00.123456+00:00' });

function makeDb(o = {}) {
  const db = {
    user: { id: ADMIN },
    user_roles: [{ user_id: ADMIN, role: 'ADMIN', is_active: true, revoked_at: null }],
    seasons: [{ id: S, slug: 'sezon-5', name: 'Sezon 5' }],
    leagues: [{ id: L, season_id: S, name: 'Süper Lig' }],
    teams: Object.entries(T).map(([k, id], i) => ({ id, name: k.toUpperCase(), slug: k, ea_club_id: 1000 + i, ea_club_name: k })),
    league_teams: Object.values(T).map((team_id) => ({ league_id: L, season_id: S, team_id, is_active: true })),
    fixtures: [
      fx(1, 1, T.a, T.b, '2026-10-11T19:00:00+00:00'),
      fx(2, 1, T.c, T.d, '2026-10-11T20:00:00.000Z'),
      fx(3, 2, T.a, T.c, '2026-10-18T19:00:00.000Z'),
      fx(4, 2, T.b, T.d, '2026-10-18T20:00:00.000Z'),
      fx(5, 3, T.a, T.d, '2026-10-25T19:00:00.000Z'),
    ],
    matches: [],
    writes: 0,
    ...o,
  };
  db.client = {
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    rpc: async () => { db.writes++; return { error: { message: 'rpc must not be called by export' } }; },
    from(table) {
      const filters = [];
      let single = false;
      const b = {
        select: () => b,
        eq: (c, v) => (filters.push((r) => r[c] === v), b),
        in: (c, vs) => (filters.push((r) => vs.includes(r[c])), b),
        is: (c, v) => (filters.push((r) => (r[c] ?? null) === v), b),
        limit: () => b,
        order: () => b,
        maybeSingle: () => ((single = true), b),
        insert: () => { db.writes++; return b; },
        update: () => { db.writes++; return b; },
        delete: () => { db.writes++; return b; },
        then(res, rej) {
          const rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
  return db;
}
const run = (db, p) => exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [L], generatedAt: new Date('2026-10-17T10:00:00Z'), ...p });

// ---- 1. single week: contract fields, ids, UTC dates, read-only
{
  const db = makeDb();
  const before = JSON.stringify([db.fixtures, db.teams, db.matches]);
  const r = await run(db, { weekFrom: 1, weekTo: 1 });
  const d = prepareExportDelivery(r.result);
  assert.equal(d.files.length, 1);
  assert.deepEqual(d.blocked, []);
  const doc = d.files[0].doc;
  assert.equal(d.files[0].name, 'teta-fixtures_sezon-5_super-lig_w01.json');
  assert.equal(doc.schema, 'teta.fixtures');
  assert.equal(doc.schemaVersion, 2);
  assert.equal(doc.kind, 'week');
  assert.deepEqual(doc.scope, { seasonId: S, seasonSlug: 'sezon-5', leagueId: L, leagueName: 'Süper Lig', weekNumber: 1 });
  assert.deepEqual(doc.fixtures.map((f) => [f.id, f.homeTeamId, f.awayTeamId]), [[U(101), T.a, T.b], [U(102), T.c, T.d]]);
  // UTC ISO with milliseconds and Z, even when the database returned "+00:00"
  assert.deepEqual(doc.fixtures.map((f) => f.scheduledAt), ['2026-10-11T19:00:00.000Z', '2026-10-11T20:00:00.000Z']);
  assert.ok(doc.fixtures.every((f) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(f.updatedAt)));
  assert.ok(doc.teams.every((t) => Number.isSafeInteger(t.eaClubId) && typeof t.eaClubId === 'number'));
  assert.equal(validateWeeklyDoc(JSON.parse(JSON.stringify(doc))).ok, true);
  assert.equal(db.writes, 0, 'export must not write');
  assert.equal(JSON.stringify([db.fixtures, db.teams, db.matches]), before, 'live data untouched');
}

// ---- 2. multi-week: every week is its own valid file inside the ZIP; missing week is reported
{
  const db = makeDb();
  const r = await run(db, { weekFrom: 1, weekTo: 4 });
  const d = prepareExportDelivery(r.result);
  assert.deepEqual(d.files.map((f) => f.doc.scope.weekNumber), [1, 2, 3]);
  assert.ok(d.files.every((f) => validateWeeklyDoc(JSON.parse(JSON.stringify(f.doc))).ok));
  assert.ok(d.notices.some((n) => n.includes('4. hafta')), 'missing week 4 must be explained');
  const zip = createZip([...d.files.map((f) => ({ name: f.name, data: JSON.stringify(f.doc, null, 2) })), { name: '_export-report.json', data: JSON.stringify({ notices: d.notices }) }]);
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(dv.getUint16(zip.length - 22 + 10, true), 4, '3 weekly files + report');
  // omitted range = all weeks present
  const all = await run(db, {});
  assert.deepEqual(all.result.files.map((f) => f.doc.scope.weekNumber), [1, 2, 3]);
}

// ---- 3. missing EA club id / unknown team => withheld with a clear reason (never a silently invalid file)
{
  const db = makeDb();
  db.teams[0].ea_club_id = null; // team A: weeks 1, 2, 3 all have it
  const r = await run(db, { weekFrom: 1, weekTo: 3 });
  const d = prepareExportDelivery(r.result);
  assert.equal(d.files.length, 0);
  assert.equal(d.blocked.length, 3);
  assert.ok(d.blocked[0].issues.some((i) => i.code === 'MISSING_EA_CLUB_ID' && i.message.includes('A')));
  assert.ok(d.notices.some((n) => n.includes('verilmedi')));

  const db2 = makeDb();
  db2.teams[2].ea_club_id = 'abc'; // team C only plays weeks 1-2 => week 3 is deliverable
  const d2 = prepareExportDelivery((await run(db2, { weekFrom: 1, weekTo: 3 })).result);
  assert.deepEqual(d2.files.map((f) => f.doc.scope.weekNumber), [3]);
  assert.deepEqual(d2.blocked.map((b) => b.weekNumber), [1, 2]);

  const db3 = makeDb();
  db3.teams = db3.teams.filter((t) => t.id !== T.d); // unknown team
  const d3 = prepareExportDelivery((await run(db3, { weekFrom: 1, weekTo: 1 })).result);
  assert.equal(d3.files.length, 0);
  assert.ok(d3.blocked[0].issues.some((i) => i.code === 'TEAM_NOT_FOUND'));
}

// ---- 4. non-blocking warning: team no longer in the league is delivered with a notice
{
  const db = makeDb();
  db.league_teams = db.league_teams.filter((x) => x.team_id !== T.d);
  const d = prepareExportDelivery((await run(db, { weekFrom: 1, weekTo: 1 })).result);
  assert.equal(d.files.length, 1);
  assert.ok(d.notices.some((n) => n.includes('ligin kadrosunda değil')));
}

// ---- 5. empty / invalid scopes give explicit errors
{
  const db = makeDb();
  const none = await run(db, { weekFrom: 50, weekTo: 52 });
  assert.equal(none.status, 404);
  assert.match(none.error, /fikstür yok/);
  const wide = await run(db, { weekFrom: 1, weekTo: 500 });
  assert.equal(wide.status, 400);
  const wrongSeason = await exportWeeklyFiles(db.client, { seasonId: U(777), leagueIds: [L] });
  assert.equal(wrongSeason.status, 404);
  const wrongLeague = await run(db, { leagueIds: [U(999)] });
  assert.equal(wrongLeague.status, 404);
}

// ---- 6. server-side authorization
{
  assert.deepEqual(await requireAdmin(makeDb({ user: null }).client), { ok: false, error: 'Giriş yapmalısınız.', status: 401 });
  const nonAdmin = makeDb({ user_roles: [{ user_id: ADMIN, role: 'PLAYER', is_active: true, revoked_at: null }] });
  assert.equal((await requireAdmin(nonAdmin.client)).status, 403);
  const revoked = makeDb({ user_roles: [{ user_id: ADMIN, role: 'ADMIN', is_active: true, revoked_at: '2026-01-01T00:00:00Z' }] });
  assert.equal((await requireAdmin(revoked.client)).status, 403);
  assert.equal((await requireAdmin(makeDb().client)).ok, true);
}

// ---- 7. file names: unique inside one ZIP, ASCII-only zip name
{
  const db = makeDb();
  db.leagues.push({ id: L2, season_id: S, name: 'SUPER LİG' }); // slugifies to the same name as 'Süper Lig'
  db.league_teams.push(...[T.a, T.b].map((team_id) => ({ league_id: L2, season_id: S, team_id, is_active: true })));
  db.fixtures.push(fx(50, 1, T.a, T.b, '2026-10-11T19:00:00.000Z', L2));
  const r = await exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [L, L2], weekFrom: 1, weekTo: 1 });
  const names = r.result.files.map((f) => f.name);
  assert.equal(new Set(names).size, 2, names.join());
  assert.ok(r.result.report.issues.every((i) => names.includes(i.file)));
  assert.equal(exportZipFileName('Sezon İ-5', 3), 'teta-fixtures_sezon-i-5_3-files.zip');
  assert.match(exportZipFileName('Şampiyonlar "Ligi"', 2), /^[\x20-\x7e]+$/);
  assert.equal(weeklyFileName({ seasonSlug: 'S5', leagueName: 'İkinci Lig', weekNumber: 7 }), 'teta-fixtures_s5_ikinci-lig_w07.json');
}

console.log('fixture-export-delivery tests passed');
