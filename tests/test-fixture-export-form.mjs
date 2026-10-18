// Weekly fixture export form validation (download button enabled/disabled).
// Run: node --no-warnings tests/test-fixture-export-form.mjs
import assert from 'node:assert/strict';
import { exportFormError, isValidWeek } from '../lib/fixture-export-form.ts';

// regression: the digit check used /^d+$/ (matches the letter "d"), so every real week number was rejected
assert.equal(isValidWeek('1'), true);
assert.equal(isValidWeek('7'), true);
assert.equal(isValidWeek('13'), true);
assert.equal(isValidWeek('200'), true);
assert.equal(isValidWeek('007'), true);

for (const bad of ['', ' ', '0', '201', '999', '-1', '+1', '1.5', '1e1', '1 ', ' 1', 'a', 'd', 'dd', '1d', '٣', 'NaN', 'Infinity']) {
  assert.equal(isValidWeek(bad), false, JSON.stringify(bad));
}

const base = { leagueCount: 1, mode: 'single', week: '1', weekFrom: '1', weekTo: '10' };
const err = (o) => exportFormError({ ...base, ...o });

// single week: needs at least one league and a valid week
assert.equal(err({}), null);
assert.equal(err({ week: '200' }), null);
assert.equal(err({ leagueCount: 2 }), null);
assert.equal(err({ leagueCount: 0 }), 'En az bir lig seçin.');
assert.equal(err({ leagueCount: 0, week: 'x' }), 'En az bir lig seçin.', 'league message wins');
for (const week of ['', '0', '201', '1.5', '-1', '1e1', 'abc']) {
  assert.equal(err({ week }), 'Hafta 1-200 arasında bir tam sayı olmalı.', JSON.stringify(week));
}
// a bad range value must not disable the single-week form
assert.equal(err({ weekFrom: 'x', weekTo: '' }), null);

// range: both ends valid, from <= to
assert.equal(err({ mode: 'range', weekFrom: '1', weekTo: '3' }), null);
assert.equal(err({ mode: 'range', weekFrom: '3', weekTo: '3' }), null);
assert.equal(err({ mode: 'range', weekFrom: '5', weekTo: '3' }), 'Başlangıç haftası bitiş haftasından büyük olamaz.');
assert.equal(err({ mode: 'range', weekFrom: '', weekTo: '3' }), 'Hafta değerleri 1-200 arasında tam sayı olmalı.');
assert.equal(err({ mode: 'range', weekFrom: '1', weekTo: '201' }), 'Hafta değerleri 1-200 arasında tam sayı olmalı.');
assert.equal(err({ mode: 'range', leagueCount: 0 }), 'En az bir lig seçin.');
// a bad single-week value must not disable the range form
assert.equal(err({ mode: 'range', week: '', weekFrom: '2', weekTo: '4' }), null);

// all weeks: only the league is required
assert.equal(err({ mode: 'all', week: '', weekFrom: '', weekTo: '' }), null);
assert.equal(err({ mode: 'all', leagueCount: 0 }), 'En az bir lig seçin.');

console.log('fixture-export-form tests passed');
