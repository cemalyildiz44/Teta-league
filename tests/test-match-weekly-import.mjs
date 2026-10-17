import assert from 'node:assert/strict';
import { canonicalJson, sha256 } from '../lib/fixture-weekly.ts';
import { validateResultsDoc, computeResultsChecksum } from '../lib/match-results-weekly.ts';
import { planMatchImport } from '../lib/match-import-plan.ts';
import { applyMatchImport, previewMatchImport } from '../lib/match-import-service.ts';

// Weekly match-results import tests: synthetic data and an in-memory fake Supabase (no network, no real database).
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = U(1), L = U(2), L2 = U(3), ADMIN = U(900), PLAYER_USER = U(901);
const T = { 1: U(21), 2: U(22), 3: U(23), 4: U(24) };
const EA = (n) => 9000000000000 + n;
const FX = { 1: U(101), 2: U(102) };
const UPDATED = '2026-10-01T10:00:00.123456+00:00';
const UPDATED_ISO = '2026-10-01T10:00:00.123Z';
const SCHEDULED = { 1: '2030-01-07T19:00:00+00:00', 2: '2030-01-07T20:00:00+00:00' };

// ------------------------------------------------------------------ results file builders (contract: checksum over {schemaVersion, kind, target, matches})
function player(side, clubN, id, name, goals) {
  return { side, eaClubId: EA(clubN), eaPlayerId: id, eaPlayerName: name, position: 'midfielder', goals, assists: 0, rating: 7.5, shots: 2, passesMade: 10, passAttempts: 12, tacklesMade: 1, tackleAttempts: 2, saves: 0, goalsConceded: 1, cleanSheetsGk: 0, cleanSheetsDef: 0, redCards: 0, mom: false };
}
function mkMatch(n, extra = {}) {
  const [h, a] = n === 1 ? [1, 2] : [3, 4];
  const base = 326658000 + n * 10;
  return {
    fixtureId: FX[n],
    fixtureUpdatedAt: UPDATED_ISO,
    kind: 'EA_MATCH',
    eaMatchId: `10880000000000${n}`,
    playedAt: n === 1 ? '2030-01-07T19:20:05.000Z' : '2030-01-07T20:10:00.000Z',
    home: { teamId: T[h], eaClubId: EA(h), score: 2 },
    away: { teamId: T[a], eaClubId: EA(a), score: 1 },
    players: [player('home', h, String(base), `ZZ Oyuncu ${base}`, 2), player('home', h, String(base + 1), `ZZ Oyuncu ${base + 1}`, 0), player('away', a, String(base + 2), `ZZ Oyuncu ${base + 2}`, 1), player('away', a, String(base + 3), `ZZ Oyuncu ${base + 3}`, 0)],
    ...extra,
  };
}
function sign(doc) {
  const checksum = computeResultsChecksum(doc);
  return { ...doc, checksum, exportId: 'twm_' + checksum.slice(0, 32) };
}
function makeDoc(o = {}) {
  const target = { seasonId: S, seasonSlug: 'zz-sezon', leagueId: L, leagueName: 'ZZ Lig', weekNumber: 1, ...(o.target ?? {}) };
  const doc = {
    schema: 'teta.weekly-matches', schemaVersion: 1, kind: 'week-results', exportId: '', checksum: '',
    generatedAt: o.generatedAt ?? '2030-01-08T10:00:00.000Z', generator: { name: 'teta-weekly-tool', version: '0.1.0' },
    source: { fixturesExportId: 'tfw_' + 'a'.repeat(32), fixturesChecksum: 'a'.repeat(64), fixturesGeneratedAt: '2030-01-02T00:00:00.000Z' },
    target, matches: o.matches ?? [mkMatch(1)],
  };
  return sign(doc);
}
const upload = (doc, name = 'sonuc.json') => ({ name, text: JSON.stringify(doc) });

// ------------------------------------------------------------------ in-memory fake supabase
function makeDb(o = {}) {
  const db = {
    user: { id: ADMIN },
    user_roles: [{ user_id: ADMIN, role: 'ADMIN', is_active: true, revoked_at: null }, { user_id: PLAYER_USER, role: 'PLAYER', is_active: true, revoked_at: null }],
    seasons: [{ id: S }],
    leagues: [{ id: L, season_id: S }, { id: L2, season_id: U(99) }],
    fixtures: [
      { id: FX[1], season_id: S, league_id: L, week_number: 1, home_team_id: T[1], away_team_id: T[2], scheduled_at: SCHEDULED[1], status: 'SCHEDULED', updated_at: UPDATED },
      { id: FX[2], season_id: S, league_id: L, week_number: 1, home_team_id: T[3], away_team_id: T[4], scheduled_at: SCHEDULED[2], status: 'SCHEDULED', updated_at: UPDATED },
    ],
    teams: [1, 2, 3, 4].map((n) => ({ id: T[n], name: `ZZ Takım ${n}`, ea_club_id: EA(n) })),
    matches: [],
    match_import_history: [],
    fixture_import_history: [{ result: 'APPLIED', checksum: 'a'.repeat(64), week_number: 1 }],
    profiles: [],
    team_memberships: [],
    rpcCalls: [],
    rpcError: null,
    historyInsertError: null,
    historyReadError: null,
    ...o,
  };
  db.client = client(db);
  return db;
}
function client(db) {
  return {
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    rpc: async (name, args) => {
      db.rpcCalls.push({ name, args });
      if (db.rpcError) return { error: { message: db.rpcError } }; // single transaction: nothing written
      return { data: { files: args.p_files.length }, error: null };
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
        not: (c, op, v) => (filters.push((r) => (op === 'is' && v === null ? (r[c] ?? null) !== null : true)), b),
        limit: () => b,
        order: () => b,
        maybeSingle: () => ((single = true), b),
        insert: (rows) => ((insertRows = Array.isArray(rows) ? rows : [rows]), b),
        then(res, rej) {
          if (table === 'match_import_history' && db.historyReadError && !insertRows) return Promise.resolve({ data: null, error: { message: db.historyReadError } }).then(res, rej);
          if (insertRows) {
            if (table === 'match_import_history' && db.historyInsertError) return Promise.resolve({ data: null, error: { message: db.historyInsertError } }).then(res, rej);
            db[table].push(...insertRows);
            return Promise.resolve({ data: null, error: null }).then(res, rej);
          }
          const rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
}
const SEL = { seasonId: S, leagueId: L };
const preview = (db, files, extra = {}) => previewMatchImport(db.client, { ...SEL, files, ...extra });
const first = (p) => p.plans[0];
const codes = (plan, i = 0) => plan.matches[i].errors.map((e) => e.code);

// ------------------------------------------------------------------ 0. contract vector produced by the LOCAL tool's own export code
{
  // Cross-checked against teta-weekly-tool (lib/core/export.ts): same canonical JSON + sha256 over {schemaVersion, kind, target, matches}.
  const target = { seasonId: S, seasonSlug: 'zz-sezon', leagueId: L, leagueName: 'ZZ Lig', weekNumber: 1 };
  const matches = [];
  assert.equal(sha256(canonicalJson({ schemaVersion: 1, kind: 'week-results', target, matches })), computeResultsChecksum({ target, matches }));
  assert.equal(canonicalJson({ b: 1, a: { d: 1, c: [2, { z: 1, y: 2 }] } }), '{"a":{"c":[2,{"y":2,"z":1}],"d":1},"b":1}');
  // Pinned value computed by the LOCAL tool's own implementation (teta-weekly-tool lib/core/export.ts computeResultsChecksum)
  // for exactly this target + mkMatch(1): the two independent implementations must agree byte for byte.
  assert.equal(makeDoc().checksum, 'e752640963de7baadfbf6dc7c75b849891e8337eb060e84545904d4a6f91c757');
  assert.equal(makeDoc().exportId, 'twm_e752640963de7baadfbf6dc7c75b8498');
}

// ------------------------------------------------------------------ 1. valid file: preview, plan, RPC payload, no auto-link
{
  const db = makeDb();
  const doc = makeDoc({ matches: [mkMatch(1), mkMatch(2)] });
  assert.equal(validateResultsDoc(JSON.parse(JSON.stringify(doc))).ok, true);
  const pv = await preview(db, [upload(doc)]);
  assert.equal(pv.canApply, true, JSON.stringify(pv.batchErrors));
  const plan = first(pv);
  assert.equal(plan.status, 'READY');
  assert.equal(plan.matches.length, 2);
  assert.equal(plan.matches[0].homeName, 'ZZ Takım 1');
  assert.ok(plan.planHash);
  assert.equal(db.rpcCalls.length, 0, 'preview must not write');
  assert.equal(db.matches.length, 0);

  const out = await applyMatchImport(db.client, { ...SEL, files: [upload(doc)], expectedHashes: { 'sonuc.json': plan.planHash } });
  assert.equal(out.ok, true, out.error);
  assert.equal(db.rpcCalls.length, 1);
  assert.equal(db.rpcCalls[0].name, 'apply_weekly_match_imports');
  const f = db.rpcCalls[0].args.p_files[0];
  assert.equal(f.checksum, doc.checksum);
  assert.equal(f.export_id, doc.exportId);
  assert.equal(f.matches.length, 2);
  const m = f.matches[0];
  assert.equal(m.fixture_id, FX[1]);
  assert.equal(m.home_team_id, T[1]); // from the LIVE fixture
  assert.equal(m.expected_fixture_updated_at, UPDATED);
  assert.equal(m.out_of_window_accepted, false);
  assert.ok(m.players.every((p) => p.player_id === null), 'no automatic player link');
  assert.equal(m.players[0].ea_player_id, '326658010');
  assert.equal(m.players[0].goals, 2);
  assert.ok(!('status' in f) && !('status' in m), 'payload carries no match status: the RPC fixes PENDING_REVIEW');
}

// ------------------------------------------------------------------ 2. contract / checksum / version / schema
{
  const db = makeDb();
  const good = makeDoc();
  const reject = async (mutated, re, name = 'x.json') => {
    const p = await preview(db, [typeof mutated === 'string' ? { name, text: mutated } : upload(mutated, name)]);
    assert.equal(first(p).status, 'REJECTED');
    assert.match(first(p).rejections.join(' | '), re);
    assert.equal(p.canApply, false);
  };
  const tampered = JSON.parse(JSON.stringify(good)); tampered.matches[0].home.score = 5;
  await reject(tampered, /checksum içerikle uyuşmuyor/);
  await reject({ ...good, schemaVersion: 2 }, /Desteklenmeyen schemaVersion/);
  await reject({ ...good, kind: 'season-results' }, /kind/);
  await reject({ ...good, schema: 'baska.sema' }, /schema/);
  await reject({ ...good, exportId: 'twm_' + 'b'.repeat(32) }, /exportId/);
  await reject({ schema: 'teta.fixtures', schemaVersion: 2, kind: 'week' }, /fikstür dosyası/);
  await reject('{ bozuk json', /JSON değil/);
  await reject('[]', /nesnesi değil/);
  await reject(sign({ ...good, matches: [mkMatch(1, { home: { teamId: T[1], eaClubId: String(EA(1)), score: 2 } })] }), /eaClubId/);
  await reject(sign({ ...good, matches: [mkMatch(1), mkMatch(1)] }), /iki kez/);
  await reject(sign({ ...good, matches: [mkMatch(1), mkMatch(2, { eaMatchId: mkMatch(1).eaMatchId })] }), /iki kez/);
  await reject(sign({ ...good, matches: [] }), /hiç maç yok/);
  await reject(sign({ ...good, matches: [mkMatch(1, { home: { teamId: T[1], eaClubId: EA(1), score: 100 } })] }), /score/);
  const badStat = mkMatch(1); badStat.players[0].goals = -1;
  await reject(sign({ ...good, matches: [badStat] }), /goals/);
  const badRating = mkMatch(1); badRating.players[0].rating = 11;
  await reject(sign({ ...good, matches: [badRating] }), /rating/);
  const badId = mkMatch(1, { eaMatchId: '12ab' });
  await reject(sign({ ...good, matches: [badId] }), /eaMatchId/);
  await reject('x'.repeat(900 * 1024), /çok büyük/);
  const raw = mkMatch(1); raw.rawEa = { a: 1 };
  const withRaw = await preview(db, [upload(sign({ ...good, matches: [raw] }))]);
  assert.equal(first(withRaw).status, 'READY');
  assert.ok(first(withRaw).warnings.some((w) => /ham EA alanı/.test(w)));
}

// ------------------------------------------------------------------ 3. scope: target league/season/week vs selection and live data
{
  const db = makeDb();
  assert.match(first(await preview(db, [upload(makeDoc({ target: { leagueId: L2 } }))])).rejections.join(), /lig/);
  assert.match(first(await preview(db, [upload(makeDoc({ target: { seasonId: U(55) } }))])).rejections.join(), /sezon/);
  const other = await previewMatchImport(db.client, { seasonId: S, leagueId: L2, files: [upload(makeDoc({ target: { leagueId: L2 } }))] });
  assert.match(first(other).rejections.join(), /sezona ait değil/);
  // file week differs from the fixtures' live week
  const wk = first(await preview(db, [upload(makeDoc({ target: { weekNumber: 2 } }))]));
  assert.equal(wk.status, 'BLOCKED');
  assert.ok(codes(wk).includes('FIXTURE_OUT_OF_SCOPE'));
  const missing = first(await preview(db, [upload(sign({ ...makeDoc(), matches: [mkMatch(1, { fixtureId: U(777) })] }))]));
  assert.ok(codes(missing).includes('FIXTURE_NOT_FOUND'));
}

// ------------------------------------------------------------------ 4. fixture state: changed / cancelled / played / has match / EA match used
{
  const doc = makeDoc();
  for (const status of ['CANCELLED', 'COMPLETED', 'POSTPONED', 'FORFEITED']) {
    const db = makeDb(); db.fixtures[0].status = status;
    const p = await preview(db, [upload(doc)]);
    assert.equal(first(p).status, 'BLOCKED', status);
    assert.ok(codes(first(p)).includes('FIXTURE_NOT_SCHEDULED'), status);
    assert.equal(p.canApply, false);
  }
  let db = makeDb(); db.fixtures[0].updated_at = '2026-10-05T10:00:00.000000+00:00';
  assert.ok(codes(first(await preview(db, [upload(doc)]))).includes('FIXTURE_CHANGED'), 'changed after the fixtures file');
  db = makeDb(); db.matches.push({ id: U(500), fixture_id: FX[1], status: 'PENDING_REVIEW', ea_match_id: '999' });
  assert.ok(codes(first(await preview(db, [upload(doc)]))).includes('FIXTURE_HAS_MATCH'));
  db = makeDb(); db.matches.push({ id: U(501), fixture_id: null, status: 'APPROVED', ea_match_id: mkMatch(1).eaMatchId });
  assert.ok(codes(first(await preview(db, [upload(doc)]))).includes('EA_MATCH_ALREADY_USED'));
  // never reaches the RPC when blocked
  db = makeDb(); db.fixtures[0].status = 'CANCELLED';
  const out = await applyMatchImport(db.client, { ...SEL, files: [upload(doc)], expectedHashes: { 'sonuc.json': 'x' } });
  assert.equal(out.ok, false);
  assert.equal(db.rpcCalls.length, 0);
  // one blocked match blocks the whole file and the whole batch (all-or-nothing)
  db = makeDb(); db.fixtures[1].status = 'CANCELLED';
  const two = await preview(db, [upload(makeDoc({ matches: [mkMatch(1), mkMatch(2)] }))]);
  assert.equal(first(two).status, 'BLOCKED');
  assert.equal(first(two).rpc, null);
  assert.equal(two.canApply, false);
}

// ------------------------------------------------------------------ 5. teams and EA club ids come from LIVE data, not the file
{
  let db = makeDb();
  const swapped = sign({ ...makeDoc(), matches: [mkMatch(1, { home: { teamId: T[2], eaClubId: EA(2), score: 2 }, away: { teamId: T[1], eaClubId: EA(1), score: 1 }, players: [] })] });
  assert.ok(codes(first(await preview(db, [upload(swapped)]))).includes('TEAM_MISMATCH'));
  const wrongClub = sign({ ...makeDoc(), matches: [mkMatch(1, { home: { teamId: T[1], eaClubId: EA(9), score: 2 }, players: [] })] });
  assert.ok(codes(first(await preview(db, [upload(wrongClub)]))).includes('EA_CLUB_MISMATCH'));
  db = makeDb(); db.teams[0].ea_club_id = null;
  assert.ok(codes(first(await preview(db, [upload(makeDoc())]))).includes('EA_CLUB_MISMATCH'));
  db = makeDb(); db.teams[0].ea_club_id = '9000000000001'; // text from the API is accepted when numerically equal
  assert.equal(first(await preview(db, [upload(makeDoc())])).status, 'READY');
}

// ------------------------------------------------------------------ 6. EA match window [17:00, 23:00) UTC of the fixture's day, decided by the admin
{
  const db = makeDb();
  const at = (iso) => sign({ ...makeDoc(), matches: [mkMatch(1, { playedAt: iso })] });
  assert.equal(first(await preview(db, [upload(at('2030-01-07T17:00:00.000Z'))])).status, 'READY', '17:00 inclusive');
  assert.equal(first(await preview(db, [upload(at('2030-01-07T22:59:59.999Z'))])).status, 'READY');
  for (const iso of ['2030-01-07T16:59:59.999Z', '2030-01-07T23:00:00.000Z', '2030-01-08T19:00:00.000Z']) {
    const p = first(await preview(db, [upload(at(iso))]));
    assert.equal(p.status, 'NEEDS_DECISION', iso);
    assert.ok(p.matches[0].warnings.some((w) => w.code === 'OUT_OF_WINDOW'));
    assert.equal(p.rpc, null);
  }
  const doc = at('2030-01-07T23:00:00.000Z');
  const blocked = await preview(db, [upload(doc)]);
  assert.equal(blocked.canApply, false);
  const accepted = await preview(db, [upload(doc)], { acceptedOutOfWindow: [doc.matches[0].eaMatchId] });
  assert.equal(accepted.canApply, true);
  assert.equal(first(accepted).rpc.matches[0].out_of_window_accepted, true);
  assert.deepEqual(first(accepted).rpc.decisions, [{ eaMatchId: doc.matches[0].eaMatchId, accepted: 'OUT_OF_WINDOW' }]);
  // the window follows the LIVE fixture time, not anything in the file
  const db2 = makeDb(); db2.fixtures[0].scheduled_at = '2030-01-09T19:00:00+00:00';
  assert.equal(first(await preview(db2, [upload(makeDoc())])).status, 'NEEDS_DECISION');
}

// ------------------------------------------------------------------ 7. repeats: same file, older file, duplicates inside one upload
{
  const doc = makeDoc();
  let db = makeDb(); db.match_import_history.push({ result: 'APPLIED', checksum: doc.checksum, file_generated_at: doc.generatedAt, season_id: S, league_id: L, week_number: 1 });
  let p = await preview(db, [upload(doc)]);
  assert.equal(first(p).status, 'NOOP');
  assert.equal(p.canApply, false);
  assert.equal((await applyMatchImport(db.client, { ...SEL, files: [upload(doc)], expectedHashes: {} })).ok, false);
  assert.equal(db.rpcCalls.length, 0);
  // same content with a different generatedAt/filename is still the same checksum
  p = await preview(db, [upload(sign({ ...doc, generatedAt: '2030-02-01T00:00:00.000Z' }), 'baska.json')]);
  assert.equal(first(p).status, 'NOOP');
  // an older export than the one already applied for the week
  db = makeDb(); db.match_import_history.push({ result: 'APPLIED', checksum: 'f'.repeat(64), file_generated_at: '2030-01-20T00:00:00.000Z', season_id: S, league_id: L, week_number: 1 });
  p = await preview(db, [upload(doc)]);
  assert.equal(first(p).status, 'REJECTED');
  assert.match(first(p).rejections.join(), /daha eski/);
  // REJECTED history rows never block a retry
  db = makeDb(); db.match_import_history.push({ result: 'REJECTED', checksum: doc.checksum, file_generated_at: doc.generatedAt, season_id: S, league_id: L, week_number: 1 });
  assert.equal((await preview(db, [upload(doc)])).canApply, true);
  // duplicates inside one upload
  db = makeDb();
  p = await preview(db, [upload(doc, 'a.json'), upload(doc, 'b.json')]);
  assert.match(p.plans[1].rejections.join(), /Aynı içerik/);
  assert.equal(p.canApply, false);
  const sameWeek = makeDoc({ generatedAt: '2030-01-09T00:00:00.000Z', matches: [mkMatch(2)] });
  p = await preview(db, [upload(doc, 'a.json'), upload(sameWeek, 'b.json')]);
  assert.match(p.plans[1].rejections.join(), /Aynı hafta/);
  const sameEa = makeDoc({ target: { weekNumber: 2 }, matches: [mkMatch(2, { eaMatchId: mkMatch(1).eaMatchId })] });
  p = await preview(db, [upload(doc, 'a.json'), upload(sameEa, 'b.json')]);
  assert.match(p.plans[1].rejections.join(), /başka bir dosyada da var/);
}

// ------------------------------------------------------------------ 8. authorization (server side)
{
  const doc = makeDoc();
  for (const [label, db] of [['yönetici olmayan', makeDb({ user: { id: PLAYER_USER } })], ['giriş yapmamış', makeDb({ user: null })], ['iptal edilmiş yönetici', makeDb({ user_roles: [{ user_id: ADMIN, role: 'ADMIN', is_active: true, revoked_at: '2026-01-01T00:00:00Z' }] })]]) {
    const out = await applyMatchImport(db.client, { ...SEL, files: [upload(doc)], expectedHashes: {} });
    assert.equal(out.ok, false, label);
    assert.match(out.error, /Giriş yapmalısınız|Yetkisiz/, label);
    assert.equal(db.rpcCalls.length, 0, label);
  }
}

// ------------------------------------------------------------------ 9. player identity: suggestions only, never an automatic link
{
  const doc = makeDoc();
  const key = doc.matches[0].players[0].eaPlayerId;
  const name = doc.matches[0].players[1].eaPlayerName;
  const PR = (n) => U(600 + n);
  let db = makeDb({
    profiles: [
      { id: PR(1), username: 'zz_anahtar', full_name: null, current_ea_player_id: key }, // profile holds the numeric EA key
      { id: PR(2), username: 'zz_ad', full_name: null, current_ea_player_id: name }, // profile holds the gamertag (name only)
    ],
  });
  let p = first(await preview(db, [upload(doc)]));
  const [k, n] = p.matches[0].players;
  assert.equal(k.suggestion.status, 'MATCHED');
  assert.equal(k.suggestion.profileId, PR(1));
  assert.equal(n.suggestion.status, 'MATCHED'); // by name: still only a suggestion
  assert.ok(p.matches[0].players.every((x) => x.linkedProfileId === null), 'nothing linked by default');
  let out = await applyMatchImport(db.client, { ...SEL, files: [upload(doc)], expectedHashes: { 'sonuc.json': p.planHash } });
  assert.equal(out.ok, true);
  assert.ok(db.rpcCalls[0].args.p_files[0].matches[0].players.every((x) => x.player_id === null));
  assert.equal(db.rpcCalls[0].args.p_files[0].matches[0].players[0].extra_stats.suggested_profile_id, PR(1));
  assert.equal(db.rpcCalls[0].args.p_files[0].matches[0].players[0].extra_stats.linked_by_admin, false);

  // explicit admin acceptance links exactly that player, with roster validation
  db = makeDb({
    profiles: [{ id: PR(1), username: 'zz_anahtar', full_name: null, current_ea_player_id: key }],
    team_memberships: [{ id: U(700), player_id: PR(1), team_id: T[1], season_id: S, left_at: null }],
  });
  const link = [{ eaMatchId: doc.matches[0].eaMatchId, eaPlayerId: key, profileId: PR(1) }];
  p = first(await preview(db, [upload(doc)], { acceptedLinks: link }));
  assert.equal(p.status, 'READY');
  assert.equal(p.matches[0].players[0].linkedProfileId, PR(1));
  assert.equal(p.matches[0].players[0].rosterStatus, 'VALID');
  assert.equal(p.rpc.matches[0].players[0].player_id, PR(1));
  assert.equal(p.rpc.matches[0].players.filter((x) => x.player_id).length, 1);
  assert.equal(p.rpc.summary.linked, 1);
  // a linked player of ANOTHER club is flagged by the roster check
  db.team_memberships[0].team_id = T[3];
  assert.equal(first(await preview(db, [upload(doc)], { acceptedLinks: link })).matches[0].players[0].rosterStatus, 'ROSTER_MISMATCH');
  db.team_memberships = [];
  assert.equal(first(await preview(db, [upload(doc)], { acceptedLinks: link })).matches[0].players[0].rosterStatus, 'UNLICENSED');

  // ambiguous: two profiles share the identifier (case variants) -> no suggestion, accepting is invalid
  db = makeDb({ profiles: [{ id: PR(1), username: 'a', full_name: null, current_ea_player_id: key }, { id: PR(2), username: 'b', full_name: null, current_ea_player_id: key.toUpperCase() }] });
  p = first(await preview(db, [upload(doc)]));
  assert.equal(p.matches[0].players[0].suggestion.status, 'AMBIGUOUS');
  assert.equal(p.matches[0].players[0].suggestion.profileId, null);
  p = first(await preview(db, [upload(doc)], { acceptedLinks: link }));
  assert.equal(p.status, 'BLOCKED');
  assert.ok(codes(p).includes('LINK_NOT_VALID'));
  assert.equal(p.rpc, null);

  // id points to one profile, name to another -> ambiguous (existing matcher rule)
  db = makeDb({ profiles: [{ id: PR(1), username: 'a', full_name: null, current_ea_player_id: key }, { id: PR(2), username: 'b', full_name: null, current_ea_player_id: doc.matches[0].players[0].eaPlayerName }] });
  assert.equal(first(await preview(db, [upload(doc)])).matches[0].players[0].suggestion.status, 'AMBIGUOUS');

  // the same profile suggested for two players of one match -> both ambiguous
  db = makeDb({ profiles: [{ id: PR(1), username: 'a', full_name: null, current_ea_player_id: name }] });
  const sameProfile = makeDoc();
  sameProfile.matches[0].players[2].eaPlayerName = name; // two players now carry the same gamertag
  p = first(await preview(db, [upload(sign(sameProfile))]));
  assert.ok(p.matches[0].players.filter((x) => x.suggestion.status === 'AMBIGUOUS').length >= 2);
  assert.ok(p.matches[0].players.every((x) => x.linkedProfileId === null));
}

// ------------------------------------------------------------------ 10. RPC failure leaves nothing behind; stale plan is refused
{
  const doc = makeDoc();
  let db = makeDb({ rpcError: 'STALE_FIXTURE: fixture changed after the plan was made' });
  const pv = await preview(db, [upload(doc)]);
  const out = await applyMatchImport(db.client, { ...SEL, files: [upload(doc)], expectedHashes: { 'sonuc.json': first(pv).planHash } });
  assert.equal(out.ok, false);
  assert.match(out.error, /hiçbir maç yazılmadı/);
  assert.match(out.error, /STALE_FIXTURE/);
  assert.equal(db.matches.length, 0);
  assert.equal(db.match_import_history.filter((h) => h.result === 'APPLIED').length, 0);
  assert.equal(db.match_import_history.length, 1); // the failed attempt is recorded (append-only)
  assert.equal(db.match_import_history[0].result, 'REJECTED');
  assert.match(db.match_import_history[0].error_message, /STALE_FIXTURE/);
  assert.equal(db.match_import_history[0].checksum, doc.checksum);

  // failing to record the attempt must not hide the real error
  db = makeDb({ rpcError: 'boom', historyInsertError: 'yazılamadı' });
  const o2 = await applyMatchImport(db.client, { ...SEL, files: [upload(doc)], expectedHashes: { 'sonuc.json': first(await preview(db, [upload(doc)])).planHash } });
  assert.equal(o2.ok, false);
  assert.match(o2.error, /boom/);
  assert.match(o2.error, /geçmişe yazılamadı/);

  // plan hash mismatch (preview showed something else) never reaches the RPC
  db = makeDb();
  const o3 = await applyMatchImport(db.client, { ...SEL, files: [upload(doc)], expectedHashes: { 'sonuc.json': 'f'.repeat(64) } });
  assert.equal(o3.ok, false);
  assert.match(o3.error, /önizlemeyi yenileyin/);
  assert.equal(db.rpcCalls.length, 0);
  // live data changed between preview and apply -> re-validation blocks it
  db = makeDb();
  const h = first(await preview(db, [upload(doc)])).planHash;
  db.fixtures[0].updated_at = '2026-10-09T00:00:00.000000+00:00';
  const o4 = await applyMatchImport(db.client, { ...SEL, files: [upload(doc)], expectedHashes: { 'sonuc.json': h } });
  assert.equal(o4.ok, false);
  assert.equal(db.rpcCalls.length, 0);
  // linking decision changes the plan hash (the admin must preview what will be written)
  const key = doc.matches[0].players[0].eaPlayerId;
  const withProfile = makeDb({ profiles: [{ id: U(601), username: 'a', full_name: null, current_ea_player_id: key }] });
  const h1 = first(await preview(withProfile, [upload(doc)])).planHash;
  const h2 = first(await preview(withProfile, [upload(doc)], { acceptedLinks: [{ eaMatchId: doc.matches[0].eaMatchId, eaPlayerId: key, profileId: U(601) }] })).planHash;
  assert.notEqual(h1, h2);
}

// ------------------------------------------------------------------ 11. fail closed when the migration is missing
{
  const db = makeDb({ historyReadError: 'relation "match_import_history" does not exist' });
  const p = await preview(db, [upload(makeDoc())]);
  assert.equal(p.canApply, false);
  assert.match(p.batchErrors.join(), /geçmişi okunamadı/);
}

// ------------------------------------------------------------------ 12. pure planner: nothing depends on file-supplied team names or ids beyond what is verified
{
  const doc = makeDoc();
  const live = {
    season: { id: S }, league: { id: L, season_id: S },
    fixtures: makeDb().fixtures, teams: makeDb().teams, matchesByFixture: {}, usedEaMatchIds: {}, history: [], fixtureImports: [], profiles: [], memberships: [],
  };
  const plan = planMatchImport({ fileName: 'x.json', doc, selected: SEL, live });
  assert.equal(plan.status, 'READY');
  assert.ok(plan.warnings.some((w) => /fikstür dosyası bu sistemde uygulanmış/.test(w)), 'unknown source fixtures file is reported');
  live.fixtureImports = [{ result: 'APPLIED', checksum: 'a'.repeat(64), week_number: 1 }];
  assert.equal(planMatchImport({ fileName: 'x.json', doc, selected: SEL, live }).warnings.length, 0);
}

// ------------------------------------------------------------------ 13. JSON transfer screen: week check, per-match send, derived delivery state
{
  const doc2 = makeDoc({ matches: [mkMatch(1), mkMatch(2)] });
  const E1 = doc2.matches[0].eaMatchId;
  const E2 = doc2.matches[1].eaMatchId;

  // selected week must match the file's target week
  let db = makeDb();
  let p = await preview(db, [upload(doc2)], { weekNumber: 2 });
  assert.equal(first(p).status, 'REJECTED');
  assert.match(first(p).rejections.join(), /Dosyadaki hafta \(1\) seçilen haftayla \(2\) uyuşmuyor/);
  assert.equal((await preview(db, [upload(doc2)], { weekNumber: 1 })).canApply, true);

  // every match is a draft with its own send hash; nothing is written by the preview
  p = await preview(db, [upload(doc2)], { weekNumber: 1 });
  assert.deepEqual(first(p).matches.map((m) => m.delivery), ['DRAFT', 'DRAFT']);
  assert.ok(first(p).matches.every((m) => m.sendHash && m.sendHash !== first(p).planHash));
  assert.notEqual(first(p).matches[0].sendHash, first(p).matches[1].sendHash);
  assert.equal(db.rpcCalls.length, 0);

  // send ONLY the second match: one match in the RPC payload, its own (derived) identity, the other stays a draft
  const send = (d, eaId, hash, extra = {}) => applyMatchImport(d.client, { ...SEL, weekNumber: 1, files: [upload(doc2)], onlyEaMatchId: eaId, expectedHashes: { 'sonuc.json': hash }, ...extra });
  const hash2 = first(p).matches[1].sendHash;
  let out = await send(db, E2, hash2);
  assert.equal(out.ok, true, out.error);
  assert.equal(db.rpcCalls.length, 1);
  const sent = db.rpcCalls[0].args.p_files[0];
  assert.equal(sent.matches.length, 1);
  assert.equal(sent.matches[0].ea_match_id, E2);
  assert.notEqual(sent.checksum, doc2.checksum, 'a per-match identity, not the file checksum');
  assert.match(sent.export_id, /^twm_[0-9a-f]{32}$/);
  assert.ok(sent.matches[0].players.every((x) => x.player_id === null), 'still no automatic player link');

  // after the RPC the stored records decide the state (simulate what the RPC writes)
  db.matches.push({ id: U(900), fixture_id: FX[2], ea_match_id: E2, status: 'PENDING_REVIEW' });
  db.match_import_history.push({ result: 'APPLIED', checksum: sent.checksum, file_generated_at: doc2.generatedAt, season_id: S, league_id: L, week_number: 1 });
  p = await preview(db, [upload(doc2)], { weekNumber: 1 });
  assert.deepEqual(first(p).matches.map((m) => m.delivery), ['DRAFT', 'SENT']);
  assert.equal(first(p).matches[1].recordId, U(900));
  // the older whole-file flow cannot re-apply a file that already has a match sent through the JSON flow (and vice versa nothing is duplicated)
  const whole = await preview(db, [upload(doc2)]);
  assert.equal(whole.canApply, false);
  assert.ok(codes(first(whole), 1).includes('EA_MATCH_ALREADY_USED'));
  assert.equal(first(whole).status, 'BLOCKED');
  const wholeApply = await applyMatchImport(db.client, { ...SEL, files: [upload(doc2)], expectedHashes: { 'sonuc.json': first(whole).planHash } });
  assert.equal(wholeApply.ok, false);
  assert.equal(db.rpcCalls.length, 1, 'whole-file flow made no RPC call');
  // re-uploading the same file cannot send it twice
  out = await send(db, E2, hash2);
  assert.equal(out.ok, false);
  assert.match(out.error, /zaten onaya gönderilmiş/);
  assert.equal(db.rpcCalls.length, 1, 'no second RPC call');
  // the other match is still sendable on its own
  out = await send(db, E1, first(p).matches[0].sendHash);
  assert.equal(out.ok, true, out.error);
  assert.equal(db.rpcCalls[1].args.p_files[0].matches[0].ea_match_id, E1);
  assert.notEqual(db.rpcCalls[1].args.p_files[0].checksum, sent.checksum);

  // reviewed states come from the stored match status
  for (const [status, expected] of [['APPROVED', 'APPROVED'], ['REJECTED', 'REJECTED'], ['PENDING_REVIEW', 'SENT']]) {
    const d = makeDb(); d.matches.push({ id: U(901), fixture_id: FX[1], ea_match_id: E1, status });
    assert.equal(first(await preview(d, [upload(doc2)], { weekNumber: 1 })).matches[0].delivery, expected, status);
  }
  // an approved match cannot be re-sent
  const dApproved = makeDb(); dApproved.matches.push({ id: U(902), fixture_id: FX[1], ea_match_id: E1, status: 'APPROVED' });
  const again = await send(dApproved, E1, 'x');
  assert.equal(again.ok, false);
  assert.equal(dApproved.rpcCalls.length, 0);

  // unknown match / stale hash / non-admin never reach the RPC
  db = makeDb();
  assert.equal((await send(db, '999', 'x')).ok, false);
  assert.equal((await send(db, E1, 'f'.repeat(64))).ok, false);
  const nonAdmin = makeDb({ user: { id: PLAYER_USER } });
  assert.equal((await send(nonAdmin, E1, hash2)).ok, false);
  assert.equal(db.rpcCalls.length + nonAdmin.rpcCalls.length, 0);
}

console.log('match-weekly-import tests passed');
