import assert from 'node:assert/strict';
import { attachTeamNames, getScopeNames } from '../lib/admin-scope.ts';

// Explicit lookups replacing unresolved PostgREST embeds: synthetic data, fake client (no network).
function fakeClient(tables, failing = []) {
  const calls = [];
  return {
    calls,
    from(table) {
      const f = [];
      const b = {
        select: () => b,
        eq: (c, v) => (f.push((r) => r[c] === v), b),
        in: (c, vs) => (f.push((r) => vs.includes(r[c])), b),
        maybeSingle: () => b,
        then(res, rej) {
          calls.push(table);
          if (failing.includes(table)) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res, rej);
          const rows = (tables[table] ?? []).filter((r) => f.every((g) => g(r)));
          const single = b._single;
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej);
        },
      };
      const orig = b.maybeSingle;
      b.maybeSingle = () => ((b._single = true), orig());
      return b;
    },
  };
}
const db = { seasons: [{ id: 's1', slug: 'sezon-5' }], leagues: [{ id: 'l1', name: 'Süper Lig' }], teams: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }] };

assert.deepEqual(await getScopeNames(fakeClient(db), { season_id: 's1', league_id: 'l1' }), { seasonSlug: 'sezon-5', leagueName: 'Süper Lig' });
// missing rows / ids / read errors behave like a null embed: undefined, never a throw
assert.deepEqual(await getScopeNames(fakeClient(db), { season_id: 'zz', league_id: null }), { seasonSlug: undefined, leagueName: undefined });
assert.deepEqual(await getScopeNames(fakeClient(db, ['seasons']), { season_id: 's1', league_id: 'l1' }), { seasonSlug: undefined, leagueName: 'Süper Lig' });
const noIds = fakeClient(db);
await getScopeNames(noIds, {});
assert.deepEqual(noIds.calls, [], 'no ids -> no queries');

// one extra query for any number of rows; same shape as the old embed ({ id, name } | null)
const c = fakeClient(db);
const rows = await attachTeamNames(c, [{ id: 1, team_id: 't1' }, { id: 2, team_id: 't2' }, { id: 3, team_id: 't1' }, { id: 4, team_id: null }, { id: 5, team_id: 'zz' }]);
assert.deepEqual(c.calls, ['teams']);
assert.deepEqual(rows.map((r) => r.teams?.name ?? null), ['A', 'B', 'A', null, null]);
assert.equal(rows[0].id, 1, 'original fields are preserved');
const none = fakeClient(db);
assert.deepEqual(await attachTeamNames(none, []), []);
assert.deepEqual(none.calls, []);
console.log('admin-scope tests passed');
