import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  MONDAY_SESSIONS_CONFIG,
  getMondaySessionDetails,
  getMidSeasonBreakInfo,
  calculateWeekScheduledAt,
} from '../lib/fixture-generator.ts';

console.log('================================================================');
console.log('TETA LEAGUE — FİKSTÜR ERTELEME & TAKVİM DOĞRULAMA TEST SUITE');
console.log('================================================================\n');

// 1. Fixture Generator Configuration Tests
console.log('[TEST 1] lib/fixture-generator.ts Takvim ve Oturum Konfigürasyonu:');

assert.equal(MONDAY_SESSIONS_CONFIG[1].offsetWeeks, 0, 'Hafta 1: offsetWeeks 0 olmalı (19.10.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[2].offsetWeeks, 0, 'Hafta 2: offsetWeeks 0 olmalı (19.10.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[3].offsetWeeks, 0, 'Hafta 3: offsetWeeks 0 olmalı (19.10.2026)');

// Postponed sessions
assert.equal(MONDAY_SESSIONS_CONFIG[4].offsetWeeks, 2, 'Hafta 4: offsetWeeks 2 olmalı (02.11.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[5].offsetWeeks, 2, 'Hafta 5: offsetWeeks 2 olmalı (02.11.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[6].offsetWeeks, 2, 'Hafta 6: offsetWeeks 2 olmalı (02.11.2026)');

assert.equal(MONDAY_SESSIONS_CONFIG[7].offsetWeeks, 3, 'Hafta 7: offsetWeeks 3 olmalı (09.11.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[8].offsetWeeks, 3, 'Hafta 8: offsetWeeks 3 olmalı (09.11.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[9].offsetWeeks, 3, 'Hafta 9: offsetWeeks 3 olmalı (09.11.2026)');

assert.equal(MONDAY_SESSIONS_CONFIG[10].offsetWeeks, 4, 'Hafta 10: offsetWeeks 4 olmalı (16.11.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[11].offsetWeeks, 4, 'Hafta 11: offsetWeeks 4 olmalı (16.11.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[12].offsetWeeks, 4, 'Hafta 12: offsetWeeks 4 olmalı (16.11.2026)');

// Devre Arası (Mid-season break)
const breakInfo = getMidSeasonBreakInfo('2026-10-19');
assert.equal(breakInfo.breakMondayDate, '2026-11-23', 'Devre arası 23.11.2026 tarihine ötelenmeli');

assert.equal(MONDAY_SESSIONS_CONFIG[13].offsetWeeks, 6, 'Hafta 13: offsetWeeks 6 olmalı (30.11.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[14].offsetWeeks, 6, 'Hafta 14: offsetWeeks 6 olmalı (30.11.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[15].offsetWeeks, 6, 'Hafta 15: offsetWeeks 6 olmalı (30.11.2026)');

assert.equal(MONDAY_SESSIONS_CONFIG[16].offsetWeeks, 7, 'Hafta 16: offsetWeeks 7 olmalı (07.12.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[17].offsetWeeks, 7, 'Hafta 17: offsetWeeks 7 olmalı (07.12.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[18].offsetWeeks, 7, 'Hafta 18: offsetWeeks 7 olmalı (07.12.2026)');

assert.equal(MONDAY_SESSIONS_CONFIG[19].offsetWeeks, 8, 'Hafta 19: offsetWeeks 8 olmalı (14.12.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[20].offsetWeeks, 8, 'Hafta 20: offsetWeeks 8 olmalı (14.12.2026)');

assert.equal(MONDAY_SESSIONS_CONFIG[21].offsetWeeks, 9, 'Hafta 21: offsetWeeks 9 olmalı (21.12.2026)');
assert.equal(MONDAY_SESSIONS_CONFIG[22].offsetWeeks, 9, 'Hafta 22: offsetWeeks 9 olmalı (21.12.2026)');

console.log('  [PASS] Tüm hafta oturumları, devre arası ve offset değerleri yeni ertelenen takvime %100 uyumlu.');

// 2. Database Live Fixtures Verification
console.log('\n[TEST 2] Supabase Canlı Veritabanı Fikstür ve Saat Doğrulaması:');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, key);

const [{ data: leagues }, { data: fixtures, error: fixErr }, { data: transferWindows }] = await Promise.all([
  supabase.from('leagues').select('id, name'),
  supabase.from('fixtures').select('id, league_id, week_number, scheduled_at, status'),
  supabase.from('transfer_windows').select('*').eq('is_open', true)
]);

assert.ifError(fixErr);
assert.equal(fixtures.length, 264, 'Toplam 264 fikstür bulunmalıdır');

const expectedWeeksMap = {
  // Tamamlanan 1-3. haftalar (19.10.2026)
  1: { date: '2026-10-19', status: 'COMPLETED' },
  2: { date: '2026-10-19', status: 'COMPLETED' },
  3: { date: '2026-10-19', status: 'COMPLETED' },

  // 1 Hafta ertelenen 4-6. haftalar (26.10.2026 -> 02.11.2026)
  4: { date: '2026-11-02', status: 'SCHEDULED' },
  5: { date: '2026-11-02', status: 'SCHEDULED' },
  6: { date: '2026-11-02', status: 'SCHEDULED' },

  // 1 Hafta ertelenen 7-9. haftalar (02.11.2026 -> 09.11.2026)
  7: { date: '2026-11-09', status: 'SCHEDULED' },
  8: { date: '2026-11-09', status: 'SCHEDULED' },
  9: { date: '2026-11-09', status: 'SCHEDULED' },

  // 1 Hafta ertelenen 10-12. haftalar (09.11.2026 -> 16.11.2026)
  10: { date: '2026-11-16', status: 'SCHEDULED' },
  11: { date: '2026-11-16', status: 'SCHEDULED' },
  12: { date: '2026-11-16', status: 'SCHEDULED' },

  // 1 Hafta ertelenen 13-15. haftalar (23.11.2026 -> 30.11.2026)
  13: { date: '2026-11-30', status: 'SCHEDULED' },
  14: { date: '2026-11-30', status: 'SCHEDULED' },
  15: { date: '2026-11-30', status: 'SCHEDULED' },

  // 1 Hafta ertelenen 16-18. haftalar (30.11.2026 -> 07.12.2026)
  16: { date: '2026-12-07', status: 'SCHEDULED' },
  17: { date: '2026-12-07', status: 'SCHEDULED' },
  18: { date: '2026-12-07', status: 'SCHEDULED' },

  // 1 Hafta ertelenen 19-20. haftalar (07.12.2026 -> 14.12.2026)
  19: { date: '2026-12-14', status: 'SCHEDULED' },
  20: { date: '2026-12-14', status: 'SCHEDULED' },

  // 1 Hafta ertelenen 21-22. haftalar (14.12.2026 -> 21.12.2026)
  21: { date: '2026-12-21', status: 'SCHEDULED' },
  22: { date: '2026-12-21', status: 'SCHEDULED' },
};

const leagueMap = new Map(leagues.map(l => [l.id, l.name]));

for (const [leagueId, leagueName] of leagueMap.entries()) {
  const lFixtures = fixtures.filter(f => f.league_id === leagueId);
  assert.equal(lFixtures.length, 132, `${leagueName} liginde tam 132 fikstür olmalı`);

  for (let w = 1; w <= 22; w++) {
    const wFixtures = lFixtures.filter(f => f.week_number === w);
    assert.equal(wFixtures.length, 6, `${leagueName} Hafta ${w} içinde tam 6 maç olmalı`);

    const exp = expectedWeeksMap[w];
    for (const f of wFixtures) {
      assert.equal(f.status, exp.status, `Fikstür ${f.id} durumu ${exp.status} olmalı`);
      const dateStr = f.scheduled_at.split('T')[0];
      assert.equal(dateStr, exp.date, `Fikstür ${f.id} (${leagueName} Hafta ${w}) tarihi ${exp.date} olmalı, bulunan: ${dateStr}`);
    }
  }
  console.log(`  [PASS] ${leagueName}: 22 hafta, 132 maçın tüm tarih ve durumları başarıyla doğrulandı.`);
}

// 3. Kick-off Times Preservation Test
console.log('\n[TEST 3] Başlama Saatlerinin Korunduğu Doğrulaması:');
const slot1Weeks = [1, 4, 7, 10, 13, 16, 19, 21];
const slot2Weeks = [2, 5, 8, 11, 14, 17, 20, 22];
const slot3Weeks = [3, 6, 9, 12, 15, 18];

for (const f of fixtures) {
  const timeUtc = f.scheduled_at.split('T')[1].slice(0, 5);
  if (slot1Weeks.includes(f.week_number)) {
    assert.equal(timeUtc, '19:30', `Hafta ${f.week_number} için başlama saati 19:30 UTC (22:30 TRT) olmalı`);
  } else if (slot2Weeks.includes(f.week_number)) {
    assert.equal(timeUtc, '20:00', `Hafta ${f.week_number} için başlama saati 20:00 UTC (23:00 TRT) olmalı`);
  } else if (slot3Weeks.includes(f.week_number)) {
    assert.equal(timeUtc, '20:30', `Hafta ${f.week_number} için başlama saati 20:30 UTC (23:30 TRT) olmalı`);
  }
}
console.log('  [PASS] Tüm 264 maçın başlama saatleri (22:30, 23:00, 23:30 TRT) eksiksiz korundu.');

// 4. Transfer Window Extension Test
console.log('\n[TEST 4] Transfer Penceresi Bitiş Tarihi Doğrulaması:');
assert.ok(transferWindows && transferWindows.length > 0, 'Aktif transfer penceresi bulunmalı');
const activeWindow = transferWindows[0];
assert.equal(activeWindow.end_date, '2026-11-01T23:59:00+00:00', 'Transfer penceresi 01.11.2026 23:59:00 UTC tarihine kadar uzatılmış olmalı');
assert.equal(activeWindow.is_open, true, 'Transfer penceresi açık (is_open: true) olmalı');
console.log('  [PASS] Transfer penceresi ertelenen 4. hafta öncesine (01.11.2026 23:59 UTC) kadar başarıyla uzatıldı.');

console.log('\n================================================================');
console.log('TÜM TESTLER BAŞARIYLA TAMAMLANDI! (4/4 TEST PASS)');
console.log('================================================================');
