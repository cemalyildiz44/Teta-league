import assert from 'node:assert/strict';
import { buildWeeklyDocs, validateWeeklyDoc, computeWeeklyChecksum, weeklyFileName } from '../lib/fixture-weekly.ts';
import { applyWeeklyImport, previewWeeklyImport, exportWeeklyFiles, requireAdmin } from '../lib/fixture-import-service.ts';
import { createZip, crc32 } from '../lib/zip-store.ts';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = U(1), L = U(2), ADMIN = U(900);
const T = { a: U(11), b: U(12), c: U(13), d: U(14), x: U(15) };
const fxid = (n) => U(100 + n);

// ------------------------------------------------------------- in-memory fake supabase
function makeDb(overrides = {}) {
  const db = {
    user: { id: ADMIN },
    user_roles: [{ user_id: ADMIN, role: 'ADMIN', is_active: true, revoked_at: null }],
    seasons: [{ id: S, slug: 'sezon-5', name: 'Sezon 5' }],
    leagues: [{ id: L, season_id: S, name: 'Süper Lig' }],
    teams: Object.entries(T).map(([k, id], i) => ({ id, name: k.toUpperCase(), slug: k, ea_club_id: 1000 + i, ea_club_name: k })),
    league_teams: [T.a, T.b, T.c, T.d].map((team_id) => ({ league_id: L, season_id: S, team_id, is_active: true })),
    fixtures: [
      mkFx(1, 1, T.a, T.b, '2026-10-11T19:00:00.000Z'),
      mkFx(2, 1, T.c, T.d, '2026-10-11T20:00:00.000Z'),
      mkFx(3, 2, T.a, T.c, '2026-10-18T19:00:00.000Z'),
      mkFx(4, 2, T.b, T.d, '2026-10-18T20:00:00.000Z'),
      mkFx(5, 3, T.a, T.d, '2026-10-25T19:00:00.000Z'),
    ],
    matches: [],
    fixture_import_history: [],
    rpcCalls: [],
    rpcError: null,
    ...overrides,
  };
  db.client = client(db);
  return db;
}
function mkFx(n, week, h, a, at, extra = {}) {
  return { id: fxid(n), season_id: S, league_id: L, week_number: week, home_team_id: h, away_team_id: a, scheduled_at: at, status: 'SCHEDULED', notes: null, updated_at: '2026-10-01T10:00:00.123456+00:00', ...extra };
}
function client(db) {
  return {
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    rpc: async (name, args) => {
      db.rpcCalls.push({ name, args });
      if (db.rpcError) return { error: { message: db.rpcError } }; // transaction aborted => nothing written
      return { data: { applied: args.p_files.length }, error: null };
    },
    from(table) {
      const filters = [];
      let single = false;
      let insertRows = null;
      const b = {
        select: () => b,
        eq: (c, v) => (filters.push((r) => r[c] === v), b),
        in: (c, vs) => (filters.push((r) => vs.includes(r[c])), b),
        is: (c, v) => (filters.push((r) => (r[c] ?? null) === v), b),
        limit: () => b,
        order: () => b,
        maybeSingle: () => ((single = true), b),
        insert: (rows) => ((insertRows = Array.isArray(rows) ? rows : [rows]), b),
        then(res, rej) {
          try {
            if (insertRows) {
              db[table].push(...insertRows);
              return Promise.resolve({ data: null, error: null }).then(res, rej);
            }
            const rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
            return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej);
          } catch (e) {
            return Promise.reject(e).then(res, rej);
          }
        },
      };
      return b;
    },
  };
}

const exportWeek = async (db, week) => {
  const r = await exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [L], weekFrom: week, weekTo: week, generatedAt: new Date('2026-10-17T10:00:00Z') });
  assert.ok(r.result, r.error);
  return r.result.files[0];
};
const asUpload = (file, doc = file.doc) => ({ name: file.name, text: JSON.stringify(doc) });
// Re-sign a modified doc the way a legitimate producer would.
const resign = (doc) => {
  const ts = doc.fixtures.map((x) => new Date(x.scheduledAt).getTime());
  const from = new Date(Math.min(...ts)).toISOString();
  const to = new Date(Math.max(...ts)).toISOString();
  return { ...doc, window: { ...doc.window, from, to, fromDate: from.slice(0, 10), toDate: to.slice(0, 10) }, checksum: computeWeeklyChecksum(doc) };
};
const preview = (db, files, accepted = [], removalMode) => previewWeeklyImport(db.client, { seasonId: S, leagueId: L, files, acceptedFixtureIds: accepted, removalMode });
const apply = (db, files, pv, accepted = []) =>
  applyWeeklyImport(db.client, {
    seasonId: S, leagueId: L, files, acceptedFixtureIds: accepted,
    expectedHashes: Object.fromEntries(pv.plans.map((p) => [p.fileName, p.planHash])),
  });

// ------------------------------------------------------------- contract / export
{
  const db = makeDb();
  const f = await exportWeek(db, 1);
  assert.equal(f.name, 'teta-fixtures_sezon-5_super-lig_w01.json');
  assert.equal(f.doc.schemaVersion, 2);
  assert.equal(f.doc.scope.weekNumber, 1);
  assert.equal(f.doc.fixtures.length, 2);
  assert.deepEqual(f.doc.teams.map((t) => t.eaClubId).sort(), [1000, 1001, 1002, 1003].sort());
  assert.equal(validateWeeklyDoc(JSON.parse(JSON.stringify(f.doc))).ok, true);

  // range export: weeks 1-3, week 4 missing is reported not skipped silently
  const r = await exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [L], weekFrom: 1, weekTo: 4 });
  assert.equal(r.result.files.length, 3);
  assert.deepEqual(r.result.report.missing, [{ leagueId: L, weekNumber: 4 }]);

  // tamper => checksum mismatch; v1 doc rejected; wrong-week fixture rejected
  const t = JSON.parse(JSON.stringify(f.doc));
  t.fixtures[0].scheduledAt = '2026-10-12T19:00:00.000Z';
  assert.match(validateWeeklyDoc(t).errors.join(), /checksum|window/);
  assert.match(validateWeeklyDoc({ ...f.doc, schemaVersion: 1 }).errors[0], /v2|haftalık/);
  const wk = JSON.parse(JSON.stringify(f.doc)); wk.fixtures[0].weekNumber = 2;
  assert.match(validateWeeklyDoc(wk).errors.join(), /hafta/);
  // missing EA id is reported, not silently skipped
  const db2 = makeDb(); db2.teams[0].ea_club_id = null;
  const f2 = await exportWeek(db2, 1);
  assert(f2.doc.issues.some((i) => i.code === 'MISSING_EA_CLUB_ID'));
  assert.equal(validateWeeklyDoc(JSON.parse(JSON.stringify(f2.doc))).ok, false);

  // zip structure + crc
  const zip = createZip([{ name: 'a.json', data: '{"a":1}' }, { name: 'b.json', data: '{}' }]);
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(zip.length - 22 + 10, true), 2);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(weeklyFileName({ seasonSlug: 'S5', leagueName: 'İkinci Lig', weekNumber: 7 }), 'teta-fixtures_s5_ikinci-lig_w07.json');
}

// ------------------------------------------------------------- unchanged export => NOOP
{
  const db = makeDb();
  const f = await exportWeek(db, 1);
  const pv = await preview(db, [asUpload(f)]);
  assert.equal(pv.plans[0].status, 'NOOP');
  assert.equal(pv.plans[0].unchanged, 2);
  assert.equal(pv.canApply, false);
}

// ------------------------------------------------------------- date change on unplayed fixture: READY, apply, no writes outside RPC
{
  const db = makeDb();
  const f = await exportWeek(db, 1);
  const doc = resign({ ...f.doc, generatedAt: '2026-10-17T11:00:00.000Z', fixtures: f.doc.fixtures.map((x, i) => (i === 0 ? { ...x, scheduledAt: '2026-10-12T19:00:00.000Z' } : x)) });
  doc.window = { ...doc.window, from: '2026-10-11T20:00:00.000Z', to: '2026-10-12T19:00:00.000Z', fromDate: '2026-10-11', toDate: '2026-10-12' };
  doc.fixtures.sort((p, q) => p.scheduledAt.localeCompare(q.scheduledAt));
  const signed = resign(doc);
  const up = [asUpload(f, signed)];
  const pv = await preview(db, up);
  assert.equal(pv.plans[0].status, 'READY', JSON.stringify(pv.plans[0]));
  assert.equal(pv.plans[0].changes.length, 1);
  assert.deepEqual(pv.plans[0].changes[0].fields, ['scheduledAt']);
  assert.equal(db.rpcCalls.length, 0, 'preview must not write');
  assert.equal(db.fixtures.length, 5);

  const res = await apply(db, up, pv);
  assert.equal(res.ok, true);
  assert.equal(db.rpcCalls.length, 1);
  assert.equal(db.rpcCalls[0].name, 'apply_fixture_week_imports');
  assert.equal(db.rpcCalls[0].args.p_files[0].ops[0].op, 'update');

  // stale preview hash => refuses
  const bad = await applyWeeklyImport(db.client, { seasonId: S, leagueId: L, files: up, acceptedFixtureIds: [], expectedHashes: { [f.name]: 'deadbeef' } });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /önizleme/i);
}

// ------------------------------------------------------------- re-upload of an already-applied file => NOOP, no duplicate
{
  const db = makeDb();
  const f = await exportWeek(db, 1);
  const doc = resign({ ...f.doc, fixtures: f.doc.fixtures.map((x, i) => (i === 0 ? { ...x, status: 'POSTPONED' } : x)) });
  db.fixture_import_history.push({ result: 'APPLIED', checksum: doc.checksum, file_generated_at: doc.generatedAt, source_revision: doc.sourceRevision, season_id: S, league_id: L, week_number: 1 });
  const pv = await preview(db, [asUpload(f, doc)]);
  assert.equal(pv.plans[0].status, 'NOOP');
  assert.match(pv.plans[0].warnings[0], /daha önce uygulanmış/);
  assert.equal(pv.canApply, false);
}

// ------------------------------------------------------------- older file must not roll back a newer applied one
{
  const db = makeDb();
  const f = await exportWeek(db, 1);
  db.fixture_import_history.push({ result: 'APPLIED', checksum: 'a'.repeat(64), file_generated_at: '2026-10-18T00:00:00.000Z', source_revision: '2026-10-01T10:00:00.123Z', season_id: S, league_id: L, week_number: 1 });
  const older = resign({ ...f.doc, fixtures: f.doc.fixtures.map((x, i) => (i === 0 ? { ...x, status: 'POSTPONED' } : x)) });
  const pv = await preview(db, [asUpload(f, older)]);
  assert.equal(pv.plans[0].status, 'REJECTED');
  assert.match(pv.plans[0].rejections[0], /daha eski/);
  assert.equal(pv.canApply, false);
}

// ------------------------------------------------------------- live changed after export => needs explicit decision
{
  const db = makeDb();
  const f = await exportWeek(db, 1);
  db.fixtures[0].updated_at = '2026-10-16T10:00:00.000000+00:00'; // admin edited live after the export
  const doc = resign({ ...f.doc, fixtures: f.doc.fixtures.map((x, i) => (i === 0 ? { ...x, status: 'POSTPONED' } : x)) });
  const up = [asUpload(f, doc)];
  let pv = await preview(db, up);
  assert.equal(pv.plans[0].status, 'NEEDS_DECISION');
  assert.deepEqual(pv.plans[0].changes[0].reasons, ['LIVE_CHANGED_SINCE_EXPORT']);
  assert.equal((await apply(db, up, pv)).ok, false);
  pv = await preview(db, up, [fxid(1)]);
  assert.equal(pv.plans[0].status, 'READY');
}

// ------------------------------------------------------------- played fixtures
{
  const db = makeDb();
  db.fixtures[0].status = 'COMPLETED';
  db.matches.push({ id: U(500), fixture_id: fxid(1), league_id: L, status: 'APPROVED', home_score: 2, away_score: 1, ea_match_id: null });
  const f = await exportWeek(db, 1);

  // team change on played fixture: hard block even with a decision
  const swap = resign({ ...f.doc, teams: f.doc.teams.filter((t) => t.id !== T.b), fixtures: f.doc.fixtures.map((x) => (x.id === fxid(1) ? { ...x, awayTeamId: T.c } : x)) });
  let pv = await preview(db, [asUpload(f, swap)], [fxid(1)]);
  assert.equal(pv.plans[0].status, 'BLOCKED');
  assert(pv.plans[0].conflicts.some((c) => c.kind === 'PLAYED_FIXTURE_TEAM_OR_STATUS_CHANGE' && c.blocking));

  // date-only change on played fixture: needs explicit decision, then allowPlayed op
  const date = resign({ ...f.doc, fixtures: f.doc.fixtures.map((x) => (x.id === fxid(1) ? { ...x, scheduledAt: '2026-10-11T19:30:00.000Z' } : x)) });
  date.window = { ...date.window };
  pv = await preview(db, [asUpload(f, date)]);
  assert.equal(pv.plans[0].status, 'NEEDS_DECISION');
  assert(pv.plans[0].changes[0].reasons.includes('PLAYED_FIXTURE'));
  pv = await preview(db, [asUpload(f, date)], [fxid(1)]);
  assert.equal(pv.plans[0].status, 'READY');
  assert.equal(pv.plans[0].ops[0].allowPlayed, true);
  assert.deepEqual(Object.keys(pv.plans[0].ops[0].values), ['scheduled_at']);

  // removal of played fixture is blocked, never cancelled
  const drop = resign({ ...f.doc, teams: f.doc.teams.filter((t) => t.id === T.c || t.id === T.d), fixtures: f.doc.fixtures.filter((x) => x.id !== fxid(1)) });
  pv = await preview(db, [asUpload(f, drop)]);
  assert(pv.plans[0].conflicts.some((c) => c.kind === 'REMOVAL_OF_PLAYED_FIXTURE'));
  assert(!pv.plans[0].ops.some((o) => o.op === 'cancel'));
}

// ------------------------------------------------------------- removal => safe cancel; team swap => related weeks
{
  const db = makeDb();
  const f = await exportWeek(db, 1);
  const drop = resign({
    ...f.doc,
    teams: f.doc.teams.filter((t) => t.id === T.c || t.id === T.d),
    fixtures: f.doc.fixtures.filter((x) => x.id === fxid(2)),
  });
  // absence alone never cancels: explicit choice required
  let pv = await preview(db, [asUpload(f, drop)]);
  assert.equal(pv.plans[0].status, 'NEEDS_DECISION');
  assert.equal(pv.plans[0].removalDecisionRequired, true);
  assert.equal(pv.plans[0].ops.length, 0);
  assert.equal(pv.canApply, false);
  assert.equal((await apply(db, [asUpload(f, drop)], pv)).ok, false);
  assert.equal(db.rpcCalls.length, 0);
  // 'keep' => nothing is cancelled
  pv = await preview(db, [asUpload(f, drop)], [], 'keep');
  assert.equal(pv.plans[0].status, 'NOOP');
  assert.equal(pv.plans[0].ops.length, 0);
  // 'cancel' => safe cancel op, bound into the plan hash
  const hKeep = pv.plans[0].planHash;
  pv = await preview(db, [asUpload(f, drop)], [], 'cancel');
  assert.notEqual(pv.plans[0].planHash, hKeep);
  assert.equal(pv.plans[0].status, 'READY');
  const cancel = pv.plans[0].ops.find((o) => o.op === 'cancel');
  assert.equal(cancel.id, fxid(1));
  assert.equal(cancel.values.status, 'CANCELLED');
  assert(!pv.plans[0].ops.some((o) => o.op === 'delete'));

  // Team B withdrawn and replaced by X in week 1 => weeks 2 (B has a fixture) flagged; X must be in league
  const db2 = makeDb();
  const f2 = await exportWeek(db2, 1);
  const swapDoc = (xActive) => {
    const teams = f2.doc.teams.filter((t) => t.id !== T.b).concat([{ id: T.x, name: 'X', slug: 'x', eaClubId: 1004, eaClubName: 'x', activeInLeague: xActive }]);
    return resign({ ...f2.doc, teams, fixtures: f2.doc.fixtures.map((x) => (x.id === fxid(1) ? { ...x, awayTeamId: T.x } : x)) });
  };
  pv = await preview(db2, [asUpload(f2, swapDoc(true))]);
  assert(pv.plans[0].conflicts.some((c) => c.kind === 'TEAM_NOT_IN_LEAGUE' && c.blocking), 'new team not in league is blocked');
  db2.league_teams.push({ league_id: L, season_id: S, team_id: T.x, is_active: true });
  pv = await preview(db2, [asUpload(f2, swapDoc(true))]);
  assert.equal(pv.plans[0].status, 'READY', JSON.stringify(pv.plans[0].conflicts));
  const rel = pv.plans[0].relatedWeeks;
  assert(rel.some((r) => r.weekNumber === 2 && r.teamId === T.b && r.reason === 'OLD_TEAM_OTHER_WEEK_FIXTURES' && r.unplayedFixtureIds.includes(fxid(4))));
  assert(pv.plans[0].warnings.some((w) => /diğer haftaları/.test(w)));
  // EA id mismatch against live
  db2.teams.find((t) => t.id === T.x).ea_club_id = 9999;
  pv = await preview(db2, [asUpload(f2, swapDoc(true))]);
  assert(pv.plans[0].conflicts.some((c) => c.kind === 'TEAM_EA_ID_MISMATCH'));
  // inactive team in league now => related-weeks scan on its other fixtures
  const db3 = makeDb();
  db3.league_teams.find((l) => l.team_id === T.d).is_active = false;
  const f3 = await exportWeek(db3, 1);
  pv = await preview(db3, [asUpload(f3)]);
  assert(pv.plans[0].relatedWeeks.some((r) => r.reason === 'INACTIVE_TEAM_FIXTURES' && r.teamId === T.d));
}

// ------------------------------------------------------------- scope mismatch & multi-file failure
{
  const db = makeDb();
  db.leagues.push({ id: U(3), season_id: S, name: 'Lig 2' });
  const f1 = await exportWeek(db, 1);
  const f2 = await exportWeek(db, 2);
  const f3 = await exportWeek(db, 3);

  // admin selects a different league than the files' scope
  const wrong = await previewWeeklyImport(db.client, { seasonId: S, leagueId: U(3), files: [asUpload(f1)] });
  assert.equal(wrong.plans[0].status, 'REJECTED');
  assert.match(wrong.plans[0].rejections.join(), /lig/);

  // one invalid JSON among valid files => nothing applicable, reasons per file
  const changed = resign({ ...f2.doc, fixtures: f2.doc.fixtures.map((x, i) => (i === 0 ? { ...x, status: 'POSTPONED' } : x)) });
  const files = [asUpload(f1), asUpload(f2, changed), { name: 'bozuk.json', text: '{not json' }, asUpload(f3)];
  const pv = await preview(db, files);
  assert.equal(pv.canApply, false);
  assert.equal(pv.plans[2].status, 'REJECTED');
  assert.match(pv.plans[2].rejections[0], /JSON/);
  assert.match(pv.batchErrors.join(), /bozuk\.json/);
  assert.equal((await apply(db, files, pv)).ok, false);
  assert.equal(db.rpcCalls.length, 0, 'no partial application');

  // duplicate week in one batch
  const dup = await preview(db, [asUpload(f1), { name: 'copy.json', text: JSON.stringify(f1.doc) }]);
  assert(dup.plans.some((p) => p.status === 'REJECTED'));
}

// ------------------------------------------------------------- unauthorised
{
  for (const mutate of [(d) => { d.user = null; }, (d) => { d.user_roles = [{ user_id: ADMIN, role: 'PLAYER', is_active: true, revoked_at: null }]; }]) {
    const db = makeDb();
    const f = await exportWeek(db, 1);
    const doc = resign({ ...f.doc, fixtures: f.doc.fixtures.map((x, i) => (i === 0 ? { ...x, status: 'POSTPONED' } : x)) });
    const up = [asUpload(f, doc)];
    const pv = await preview(db, up);
    mutate(db);
    assert.equal((await requireAdmin(db.client)).ok, false);
    const res = await apply(db, up, pv);
    assert.equal(res.ok, false);
    assert.equal(db.rpcCalls.length, 0);
  }
}

// ------------------------------------------------------------- transaction failure: nothing written, failure recorded
{
  const db = makeDb();
  const f = await exportWeek(db, 1);
  const doc = resign({ ...f.doc, fixtures: f.doc.fixtures.map((x, i) => (i === 0 ? { ...x, status: 'POSTPONED' } : x)) });
  const up = [asUpload(f, doc)];
  const pv = await preview(db, up);
  const before = JSON.stringify(db.fixtures);
  db.rpcError = 'STALE_FIXTURE: fixture changed after preview';
  const res = await apply(db, up, pv);
  assert.equal(res.ok, false);
  assert.match(res.error, /hiçbir değişiklik yazılmadı/);
  assert.equal(JSON.stringify(db.fixtures), before);
  assert.equal(db.fixture_import_history.length, 1);
  assert.equal(db.fixture_import_history[0].result, 'REJECTED');
  assert.match(db.fixture_import_history[0].error_message, /STALE_FIXTURE/);
}

// ------------------------------------------------------------- 10-week ZIP, two-league ZIP, limits, bad files
{
  const readZip = (zip) => {
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const n = dv.getUint16(zip.length - 22 + 10, true);
    let off = dv.getUint32(zip.length - 22 + 16, true);
    const dec = new TextDecoder();
    const out = [];
    for (let i = 0; i < n; i++) {
      assert.equal(dv.getUint32(off, true), 0x02014b50);
      const crc = dv.getUint32(off + 16, true), size = dv.getUint32(off + 24, true);
      const nl = dv.getUint16(off + 28, true), lho = dv.getUint32(off + 42, true);
      const name = dec.decode(zip.subarray(off + 46, off + 46 + nl));
      const lnl = dv.getUint16(lho + 26, true);
      const data = zip.subarray(lho + 30 + lnl, lho + 30 + lnl + size);
      assert.equal(crc32(data), crc, 'crc ' + name);
      out.push({ name, text: dec.decode(data) });
      off += 46 + nl;
    }
    return out;
  };
  const L2 = U(3);
  const db = makeDb();
  db.leagues.push({ id: L2, season_id: S, name: 'İkinci Lig' });
  db.league_teams.push(...[T.a, T.b, T.c, T.d].map((team_id) => ({ league_id: L2, season_id: S, team_id, is_active: true })));
  db.fixtures.length = 0;
  for (let w = 1; w <= 10; w++) {
    for (const lg of [L, L2]) {
      db.fixtures.push(mkFx(w * 10 + (lg === L ? 1 : 2), w, T.a, T.b, `2026-10-${String(w).padStart(2, '0')}T19:00:00.000Z`, { league_id: lg, id: U((lg === L ? 1000 : 2000) + w) }));
    }
  }
  const one = await exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [L], weekFrom: 3, weekTo: 3 });
  assert.equal(one.result.files.length, 1);
  const ten = await exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [L], weekFrom: 1, weekTo: 10 });
  assert.equal(ten.result.files.length, 10);
  const two = await exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [L, L2], weekFrom: 1, weekTo: 10 });
  assert.equal(two.result.files.length, 20);
  const names = new Set(two.result.files.map((f) => f.name));
  assert.equal(names.size, 20, 'every league/week is an independent, uniquely named file');
  const zip = createZip([...two.result.files.map((f) => ({ name: f.name, data: JSON.stringify(f.doc, null, 2) })), { name: '_export-report.json', data: JSON.stringify(two.result.report) }]);
  const entries = readZip(zip);
  assert.equal(entries.length, 21);
  for (const e of entries.filter((x) => x.name !== '_export-report.json')) {
    const v = validateWeeklyDoc(JSON.parse(e.text));
    assert.equal(v.ok, true, e.name + ': ' + v.errors.join());           // each file stands alone
    assert(e.name.includes(v.doc.scope.leagueId === L ? 'super-lig' : 'ikinci-lig'));
  }
  // determinism: same data => same checksums/exportIds across runs
  const again = await exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [L], weekFrom: 1, weekTo: 10, generatedAt: new Date('2030-01-01') });
  assert.deepEqual(again.result.files.map((f) => f.doc.exportId), ten.result.files.map((f) => f.doc.exportId));
  // size: a realistic 10-week x 2-league zip is tiny
  assert(zip.length < 200 * 1024, 'zip size ' + zip.length);

  // limits
  const tooWide = await exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [L], weekFrom: 1, weekTo: 500 });
  assert.match(tooWide.error, /geniş/);
  const none = await exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [L], weekFrom: 50, weekTo: 52 });
  assert.equal(none.status, 404);
  const wrongSeason = await exportWeeklyFiles(db.client, { seasonId: S, leagueIds: [U(999)] });
  assert.equal(wrongSeason.status, 404);

  // import limits and bad files
  const many = Array.from({ length: 61 }, (_, i) => ({ name: `f${i}.json`, text: '{}' }));
  assert.match((await previewWeeklyImport(db.client, { seasonId: S, leagueId: L, files: many })).batchErrors[0], /En fazla 60/);
  assert.match((await previewWeeklyImport(db.client, { seasonId: S, leagueId: L, files: [] })).batchErrors[0], /Dosya seçilmedi/);
  const big = await previewWeeklyImport(db.client, { seasonId: S, leagueId: L, files: [{ name: 'big.json', text: ' '.repeat(600 * 1024) }] });
  assert.match(big.plans[0].rejections[0], /çok büyük/);
  const junk = await previewWeeklyImport(db.client, { seasonId: S, leagueId: L, files: [
    { name: 'arr.json', text: '[]' }, { name: 'nul.json', text: 'null' }, { name: 'empty.json', text: '' },
    { name: 'v1.json', text: JSON.stringify({ schema: 'teta.fixtures', schemaVersion: 1 }) },
    { name: 'proto.json', text: '{"__proto__":{"x":1},"schema":"teta.fixtures"}' },
  ] });
  assert(junk.plans.every((p) => p.status === 'REJECTED' && p.rejections.length), 'every malformed file is rejected with a reason');
  assert.equal(junk.canApply, false);
  // 10 valid files, one tampered => whole batch refused, tampered one named
  const files10 = ten.result.files.map((f) => asUpload(f));
  const t = JSON.parse(files10[4].text); t.fixtures[0].status = 'POSTPONED'; files10[4] = { name: ten.result.files[4].name, text: JSON.stringify(t) };
  const pv10 = await preview(db, files10);
  assert.equal(pv10.plans.filter((p) => p.status === 'REJECTED').length, 1);
  assert.match(pv10.batchErrors.join(), new RegExp(ten.result.files[4].name));
  assert.equal(pv10.canApply, false);
}

console.log('fixture-weekly-import tests passed');
