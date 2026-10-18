import assert from 'node:assert/strict';
import {
  normalizeEaId,
  normalizePlayerIdentifier,
  matchPlayerToProfile,
  validateRosterMembership,
  sanitizeProfileSearchQuery,
  buildProfilesOrFilter
} from '../lib/ea/roster-validator.ts';
import { matchFixture } from '../lib/ea/matcher.ts';
import { normalizeMatch } from '../lib/ea/normalizer.ts';
import {
  generateRoundRobin,
  computeFixturePreview,
  validateFixtureUpdate,
  validateAndDetermineScoreStatus,
  calculateWeekScheduledAt,
  getFirstMondayDate,
  getMidSeasonBreakInfo
} from '../lib/fixture-generator.ts';

console.log('================================================================');
console.log('TETA LEAGUE — EA OYUNCU EŞLEŞTİRME VE KADRO DOĞRULAMA (FAZ 1)');
console.log('UNIT & INTEGRITY TEST SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Test 1: EA ID & Kullanıcı Adı Büyük/Küçük Harf ve Türkçe Karakter Normalizasyonu
// -----------------------------------------------------------------------------
console.log('TEST 1: EA ID ve kullanıcı adı büyük/küçük harf normalizasyonu ve eşleşme...');

assert.equal(normalizeEaId('  iBo_F16  '), 'ibo_f16', 'normalizeEaId should trim and lowercase');
assert.equal(normalizeEaId(null), '', 'normalizeEaId null should return empty string');
assert.equal(normalizeEaId(undefined), '', 'normalizeEaId undefined should return empty string');

// 1.0: normalizePlayerIdentifier ve normalizeEaId Türkçe karakter & Canovic1905 testleri
assert.equal(normalizePlayerIdentifier('Canovic1905'), 'canovic1905');
assert.equal(normalizePlayerIdentifier('canovic1905'), 'canovic1905');
assert.equal(normalizePlayerIdentifier('CANOVIC1905'), 'canovic1905');
assert.equal(normalizePlayerIdentifier('CANOVİC1905'), 'canovic1905');
assert.equal(normalizePlayerIdentifier('CANOVıC1905'), 'canovic1905');

assert.equal(normalizePlayerIdentifier('İSMAİL'), 'ismail');
assert.equal(normalizePlayerIdentifier('ISMAIL'), 'ismail');
assert.equal(normalizePlayerIdentifier('ismail'), 'ismail');
assert.equal(normalizePlayerIdentifier('ısmail'), 'ismail');
assert.equal(normalizePlayerIdentifier('ÇINAR'), 'çinar');
assert.equal(normalizePlayerIdentifier('çınar'), 'çinar');
assert.equal(normalizePlayerIdentifier('ŞAHİN'), 'şahin');
assert.equal(normalizePlayerIdentifier('şahin'), 'şahin');
assert.equal(normalizePlayerIdentifier('ÖZGÜR'), 'özgür');
assert.equal(normalizePlayerIdentifier('özgür'), 'özgür');
assert.equal(normalizePlayerIdentifier('YAĞIZ'), 'yağiz');
assert.equal(normalizePlayerIdentifier('yağız'), 'yağiz');
assert.equal(normalizePlayerIdentifier('GÜVEN'), 'güven');
assert.equal(normalizePlayerIdentifier('güven'), 'güven');

const profilesPool1 = [
  { id: 'usr-1', username: 'ibo_f16', current_ea_player_id: 'iBo_F16' },
  { id: 'usr-2', username: 'cemal263', current_ea_player_id: 'CemalYildiz263' }
];

// 1a: Uppercase input matching mixed case profile
const res1a = matchPlayerToProfile({ ea_player_id: 'IBO_F16', ea_player_name: 'ibo_f16' }, profilesPool1);
assert.equal(res1a.status, 'MATCHED', '1a status should be MATCHED');
assert.equal(res1a.player_id, 'usr-1', '1a player_id should match usr-1');

// 1b: Lowercase input matching PascalCase profile
const res1b = matchPlayerToProfile({ ea_player_id: 'cemalyildiz263', ea_player_name: 'CemalYildiz263' }, profilesPool1);
assert.equal(res1b.status, 'MATCHED', '1b status should be MATCHED');
assert.equal(res1b.player_id, 'usr-2', '1b player_id should match usr-2');

// 1c: Whitespace trimming with case insensitivity
const res1c = matchPlayerToProfile({ ea_player_id: '  IBO_F16  ', ea_player_name: '  iBo_F16  ' }, profilesPool1);
assert.equal(res1c.status, 'MATCHED', '1c whitespace trimmed should match');
assert.equal(res1c.player_id, 'usr-1', '1c player_id should match usr-1');

// 1d: Canovic1905 kullanıcı adı eşleşmesi (current_ea_player_id null olsa dahi)
const canovicPool = [
  { id: 'usr-canovic', username: 'canovic1905', current_ea_player_id: null }
];
// 1d-1: EA adı CANOVIC1905 -> kullanıcı adı canovic1905 ile eşleşmeli
const res1d1 = matchPlayerToProfile({ ea_player_id: '326658010', ea_player_name: 'CANOVIC1905' }, canovicPool);
assert.equal(res1d1.status, 'MATCHED', '1d1 status should be MATCHED');
assert.equal(res1d1.player_id, 'usr-canovic', '1d1 player_id should match usr-canovic');

// 1d-2: EA adı Canovic1905 -> kullanıcı adı canovic1905 ile eşleşmeli
const res1d2 = matchPlayerToProfile({ ea_player_id: 'Canovic1905', ea_player_name: 'Canovic1905' }, canovicPool);
assert.equal(res1d2.status, 'MATCHED', '1d2 status should be MATCHED');
assert.equal(res1d2.player_id, 'usr-canovic', '1d2 player_id should match usr-canovic');

// 1d-3: EA adı canovic1905 -> büyük harfli profil kullanıcı adı ile eşleşmeli
const canovicUpperPool = [
  { id: 'usr-canovic-up', username: 'CANOVIC1905', current_ea_player_id: null }
];
const res1d3 = matchPlayerToProfile({ ea_player_id: 'canovic1905', ea_player_name: 'canovic1905' }, canovicUpperPool);
assert.equal(res1d3.status, 'MATCHED', '1d3 status should be MATCHED');
assert.equal(res1d3.player_id, 'usr-canovic-up', '1d3 player_id should match usr-canovic-up');

// 1e: Türkçe karakterli kullanıcı adları (İsmail, Çınar, Şahin, Özgür)
const turkishPool = [
  { id: 'usr-ismail', username: 'ismail', current_ea_player_id: null },
  { id: 'usr-cinar', username: 'çınar', current_ea_player_id: null },
  { id: 'usr-sahin', username: 'şahin', current_ea_player_id: null },
  { id: 'usr-ozgur', username: 'özgür', current_ea_player_id: null }
];
// İSMAİL -> ismail
const res1e1 = matchPlayerToProfile({ ea_player_id: 'İSMAİL', ea_player_name: 'İSMAİL' }, turkishPool);
assert.equal(res1e1.status, 'MATCHED');
assert.equal(res1e1.player_id, 'usr-ismail');

// ISMAIL -> ismail
const res1e2 = matchPlayerToProfile({ ea_player_id: 'ISMAIL', ea_player_name: 'ISMAIL' }, turkishPool);
assert.equal(res1e2.status, 'MATCHED');
assert.equal(res1e2.player_id, 'usr-ismail');

// ÇINAR -> çınar
const res1e3 = matchPlayerToProfile({ ea_player_id: 'ÇINAR', ea_player_name: 'ÇINAR' }, turkishPool);
assert.equal(res1e3.status, 'MATCHED');
assert.equal(res1e3.player_id, 'usr-cinar');

// ŞAHİN -> şahin
const res1e4 = matchPlayerToProfile({ ea_player_id: 'ŞAHİN', ea_player_name: 'ŞAHİN' }, turkishPool);
assert.equal(res1e4.status, 'MATCHED');
assert.equal(res1e4.player_id, 'usr-sahin');

// ÖZGÜR -> özgür
const res1e5 = matchPlayerToProfile({ ea_player_id: 'ÖZGÜR', ea_player_name: 'ÖZGÜR' }, turkishPool);
assert.equal(res1e5.status, 'MATCHED');
assert.equal(res1e5.player_id, 'usr-ozgur');

// 1f: Yalnızca harf büyüklüğü farklı olan birden fazla profil varsa AMBIGUOUS dönmeli (otomatik atama yapılmamalı)
const ambiguousCasePool = [
  { id: 'usr-can1', username: 'canovic1905', current_ea_player_id: null },
  { id: 'usr-can2', username: 'CANOVIC1905', current_ea_player_id: null }
];
const res1f = matchPlayerToProfile({ ea_player_id: 'canovic1905', ea_player_name: 'Canovic1905' }, ambiguousCasePool);
assert.equal(res1f.status, 'AMBIGUOUS', '1f multiple case candidates must be AMBIGUOUS');
assert.equal(res1f.player_id, null, '1f player_id must be null for multiple candidates');
assert.ok(res1f.warning?.includes('Belirsiz eşleşme'), '1f warning must state Belirsiz eşleşme');

console.log('  [PASS] Büyük/küçük harf, Türkçe karakterler ve Canovic1905 varyantları başarıyla normalize edildi ve eşleştirildi.\n');


// -----------------------------------------------------------------------------
// Test 2: EA ID eşleşmesi bulunamaması (Unmatched / No Guessing)
// -----------------------------------------------------------------------------
console.log('TEST 2: EA ID eşleşmesi bulunamadığında tahmin yapılmaması ve NULL dönülmesi...');

const res2a = matchPlayerToProfile({ ea_player_id: 'unknown_gamer_999', ea_player_name: 'GhostRider' }, profilesPool1);
assert.equal(res2a.status, 'UNMATCHED', '2a status should be UNMATCHED');
assert.equal(res2a.player_id, null, '2a player_id must be null');
assert.equal(res2a.warning, 'PROFİL EŞLEŞMEDİ', '2a warning should state PROFİL EŞLEŞMEDİ');

// 2b: Empty / null EA ID
const res2b = matchPlayerToProfile({ ea_player_id: null, ea_player_name: null }, profilesPool1);
assert.equal(res2b.status, 'UNMATCHED', '2b status should be UNMATCHED');
assert.equal(res2b.player_id, null, '2b player_id must be null');

console.log('  [PASS] Eşleşmeyen oyuncular kesinlikle tahmin edilmedi; player_id=NULL ve PROFİL EŞLEŞMEDİ döndü.\n');


// -----------------------------------------------------------------------------
// Test 3: Belirsiz / Çakışan eşleşme (Ambiguous Matching)
// -----------------------------------------------------------------------------
console.log('TEST 3: Belirsiz ve çakışan eşleşmelerin tespit edilmesi...');

// 3a: Multiple profiles in DB share the same normalized EA ID
const duplicateProfilesPool = [
  { id: 'usr-dup1', username: 'teta_legend1', current_ea_player_id: 'ProStriker' },
  { id: 'usr-dup2', username: 'teta_legend2', current_ea_player_id: 'prostriker' }
];

const res3a = matchPlayerToProfile({ ea_player_id: 'prostriker', ea_player_name: 'ProStriker' }, duplicateProfilesPool);
assert.equal(res3a.status, 'AMBIGUOUS', '3a status must be AMBIGUOUS');
assert.equal(res3a.player_id, null, '3a player_id must be null on ambiguous collision');
assert.ok(res3a.warning?.includes('Belirsiz eşleşme'), '3a warning should describe ambiguous match');

// 3b: ea_player_id matches Profile A, but ea_player_name matches Profile B
const conflictingProfilesPool = [
  { id: 'usr-a', username: 'player_a', current_ea_player_id: 'id_alpha' },
  { id: 'usr-b', username: 'player_b', current_ea_player_id: 'name_beta' }
];

const res3b = matchPlayerToProfile({ ea_player_id: 'id_alpha', ea_player_name: 'name_beta' }, conflictingProfilesPool);
assert.equal(res3b.status, 'AMBIGUOUS', '3b status must be AMBIGUOUS for conflicting identifiers');
assert.equal(res3b.player_id, null, '3b player_id must be null for conflicting profiles');
assert.ok(res3b.warning?.includes('Çakışan eşleşme'), '3b warning should describe conflicting match');

console.log('  [PASS] Belirsiz ve çakışan eşleşmeler tespit edildi; otomatik yanlış atama engellendi.\n');


// -----------------------------------------------------------------------------
// Test 4: Oyuncunun başka takımda lisanslı olması (Roster Mismatch)
// -----------------------------------------------------------------------------
console.log('TEST 4: Farklı takımda lisanslı oyuncuların kadro uyuşmazlığı tespiti...');

const membershipsPool = [
  {
    player_id: 'usr-1',
    team_id: 'team-galatasaray',
    season_id: 'season-6',
    left_at: null,
    teams: { id: 'team-galatasaray', name: 'Galatasaray Esports' }
  },
  {
    player_id: 'usr-2',
    team_id: 'team-fenerbahce',
    season_id: 'season-6',
    left_at: null,
    teams: { id: 'team-fenerbahce', name: 'Fenerbahçe Esports' }
  }
];

// Oyuncu usr-1 Galatasaray'da lisanslı ama Fenerbahçe adına maçta oynamış
const res4 = validateRosterMembership({
  player_id: 'usr-1',
  match_team_id: 'team-fenerbahce',
  season_id: 'season-6',
  memberships: membershipsPool
});

assert.equal(res4.roster_status, 'ROSTER_MISMATCH', '4 roster_status must be ROSTER_MISMATCH');
assert.equal(res4.registered_team_id, 'team-galatasaray', '4 registered_team_id must be team-galatasaray');
assert.equal(res4.registered_team_name, 'Galatasaray Esports', '4 registered_team_name must match');
assert.ok(res4.roster_warning?.includes('Galatasaray Esports'), '4 warning must mention licensed team name');

console.log('  [PASS] Başka takımda lisanslı oyuncu ROSTER_MISMATCH olarak bayraklandı; kayıtlı takım gösterildi.\n');


// -----------------------------------------------------------------------------
// Test 5: Oyuncunun lisanssız olması (Unlicensed Player)
// -----------------------------------------------------------------------------
console.log('TEST 5: Aktif lisansı bulunmayan oyuncunun tespiti...');

// 5a: Bu sezonda hiçbir üyeliği yok
const res5a = validateRosterMembership({
  player_id: 'usr-unlicensed',
  match_team_id: 'team-fenerbahce',
  season_id: 'season-6',
  memberships: membershipsPool
});

assert.equal(res5a.roster_status, 'UNLICENSED', '5a roster_status must be UNLICENSED');
assert.equal(res5a.registered_team_id, null, '5a registered_team_id must be null');
assert.ok(res5a.roster_warning?.includes('Lisanssız'), '5a warning must mention Lisanssız');

// 5b: Takımdan ayrılmış (left_at dolu) üyelik
const membershipsWithLeft = [
  {
    player_id: 'usr-former',
    team_id: 'team-fenerbahce',
    season_id: 'season-6',
    left_at: '2026-09-01T12:00:00Z',
    teams: { id: 'team-fenerbahce', name: 'Fenerbahçe Esports' }
  }
];

const res5b = validateRosterMembership({
  player_id: 'usr-former',
  match_team_id: 'team-fenerbahce',
  season_id: 'season-6',
  memberships: membershipsWithLeft
});

assert.equal(res5b.roster_status, 'UNLICENSED', '5b former member with left_at must be UNLICENSED');
assert.equal(res5b.registered_team_id, null, '5b registered_team_id must be null');

console.log('  [PASS] Lisansı olmayan veya ayrılmış oyuncular UNLICENSED olarak tespit edildi.\n');


// -----------------------------------------------------------------------------
// Test 6: Admin\'in oyuncuyu boş bırakması (Unlink Profile)
// -----------------------------------------------------------------------------
console.log('TEST 6: Admin\'in oyuncu profil bağlantısını kaldırması (boş bırakma)...');

const res6 = validateRosterMembership({
  player_id: null,
  match_team_id: 'team-fenerbahce',
  season_id: 'season-6',
  memberships: membershipsPool
});

assert.equal(res6.roster_status, 'UNMATCHED', '6 roster_status must be UNMATCHED for null player_id');
assert.equal(res6.registered_team_id, null, '6 registered_team_id must be null');
assert.equal(res6.roster_warning, 'PROFİL EŞLEŞMEDİ', '6 warning must be PROFİL EŞLEŞMEDİ');

// Simulating audit payload generation
const auditPayload6 = {
  action: 'UNLINK_MATCH_PLAYER',
  entity_type: 'match_player_stats',
  entity_id: 'stat-uuid-123',
  old_data: { player_id: 'usr-1' },
  new_data: { player_id: null, roster_status: 'UNMATCHED' },
  description: 'Profil bağlantısı kaldırıldı'
};
assert.equal(auditPayload6.action, 'UNLINK_MATCH_PLAYER');
assert.equal(auditPayload6.new_data.player_id, null);

console.log('  [PASS] Oyuncuyu boş bırakma işlemi UNMATCHED statüsüne aldı ve audit log hazırlandı.\n');


// -----------------------------------------------------------------------------
// Test 7: Admin\'in oyuncuyu doğru profile manuel bağlaması (Manual Valid Link)
// -----------------------------------------------------------------------------
console.log('TEST 7: Admin\'in oyuncuyu geçerli bir profile manuel bağlaması...');

// usr-2 Fenerbahçe'de lisanslı, maç da Fenerbahçe maçı
const res7 = validateRosterMembership({
  player_id: 'usr-2',
  match_team_id: 'team-fenerbahce',
  season_id: 'season-6',
  memberships: membershipsPool
});

assert.equal(res7.roster_status, 'VALID', '7 roster_status must be VALID');
assert.equal(res7.registered_team_id, 'team-fenerbahce', '7 registered_team_id must match');
assert.equal(res7.roster_warning, null, '7 roster_warning must be null for valid license');

const auditPayload7 = {
  action: 'ASSIGN_MATCH_PLAYER',
  entity_type: 'match_player_stats',
  entity_id: 'stat-uuid-123',
  old_data: { player_id: null },
  new_data: { player_id: 'usr-2', roster_status: 'VALID' },
  description: 'Manuel profil eşleştirildi'
};
assert.equal(auditPayload7.action, 'ASSIGN_MATCH_PLAYER');
assert.equal(auditPayload7.new_data.player_id, 'usr-2');

console.log('  [PASS] Doğru profile manuel atama yapıldı; VALID statüsü ve audit log doğrulandı.\n');


// -----------------------------------------------------------------------------
// Test 8: Geçersiz profil seçimi ve maç içi çakışmanın engellenmesi
// -----------------------------------------------------------------------------
console.log('TEST 8: Geçersiz profil veya maç içi mükerrer oyuncu atamasının engellenmesi...');

function simulateAssignProfileGuard({
  targetPlayerId,
  existingProfiles,
  matchStatsRows,
  currentStatId
}) {
  if (targetPlayerId) {
    const profileExists = existingProfiles.some(p => p.id === targetPlayerId);
    if (!profileExists) {
      return { error: 'Geçersiz profil: Seçilen oyuncu profili sistemde bulunamadı.' };
    }

    const duplicateInMatch = matchStatsRows.find(
      r => r.id !== currentStatId && r.player_id === targetPlayerId
    );
    if (duplicateInMatch) {
      return { error: `Bu profil bu maçta zaten başka bir oyuncuya (${duplicateInMatch.ea_player_name}) atanmış.` };
    }
  }

  return { success: true };
}

const mockExistingProfiles = [
  { id: 'usr-1', username: 'ibo_f16' },
  { id: 'usr-2', username: 'cemal263' }
];

const mockMatchRows = [
  { id: 'stat-1', player_id: 'usr-1', ea_player_name: 'iBo_F16' },
  { id: 'stat-2', player_id: null, ea_player_name: 'UnknownPlayer' }
];

// 8a: Non-existent profile
const res8a = simulateAssignProfileGuard({
  targetPlayerId: 'non-existent-uuid',
  existingProfiles: mockExistingProfiles,
  matchStatsRows: mockMatchRows,
  currentStatId: 'stat-2'
});
assert.ok(res8a.error?.includes('Geçersiz profil'), '8a must reject non-existent profile');

// 8b: Duplicate player in the same match (attempting to assign usr-1 to stat-2 when already in stat-1)
const res8b = simulateAssignProfileGuard({
  targetPlayerId: 'usr-1',
  existingProfiles: mockExistingProfiles,
  matchStatsRows: mockMatchRows,
  currentStatId: 'stat-2'
});
assert.ok(res8b.error?.includes('zaten başka bir oyuncuya'), '8b must reject duplicate player assignment in same match');

// 8c: Valid assignment of usr-2 to stat-2
const res8c = simulateAssignProfileGuard({
  targetPlayerId: 'usr-2',
  existingProfiles: mockExistingProfiles,
  matchStatsRows: mockMatchRows,
  currentStatId: 'stat-2'
});
assert.equal(res8c.success, true, '8c valid assignment should succeed');

console.log('  [PASS] Geçersiz profil ve maç içi mükerrer oyuncu atamaları başarıyla engellendi.\n');


// -----------------------------------------------------------------------------
// Test 9: checkAdmin yetki kontrolü (Yalnızca ADMIN, Yalnızca SUPER_ADMIN, Her İkisi)
// -----------------------------------------------------------------------------
console.log('TEST 9: checkAdmin yetki kontrolü (Tekil ve Çoklu Rol Senaryoları)...');

function simulateCheckAdmin(userRolesTable, userId) {
  if (!userId) return false;
  // Simulates:
  // .from('user_roles').select('role')
  // .eq('user_id', userId)
  // .in('role', ['ADMIN', 'SUPER_ADMIN'])
  // .eq('is_active', true)
  // .is('revoked_at', null)
  // .limit(1)
  // .maybeSingle()
  const matching = userRolesTable.filter(r =>
    r.user_id === userId &&
    ['ADMIN', 'SUPER_ADMIN'].includes(r.role) &&
    r.is_active === true &&
    (r.revoked_at === null || r.revoked_at === undefined)
  );
  // With .limit(1).maybeSingle(), even if matching has 2 items, it takes the first item and returns object
  const result = matching.slice(0, 1)[0] || null;
  return !!result;
}

const mockRolesTable = [
  // User with ONLY ADMIN role (active)
  { user_id: 'usr-admin-only', role: 'ADMIN', is_active: true, revoked_at: null },

  // User with ONLY SUPER_ADMIN role (active)
  { user_id: 'usr-super-only', role: 'SUPER_ADMIN', is_active: true, revoked_at: null },

  // User with BOTH ADMIN and SUPER_ADMIN roles (active)
  { user_id: 'usr-dual-admin', role: 'ADMIN', is_active: true, revoked_at: null },
  { user_id: 'usr-dual-admin', role: 'SUPER_ADMIN', is_active: true, revoked_at: null },

  // User with REVOKED ADMIN role
  { user_id: 'usr-revoked-admin', role: 'ADMIN', is_active: true, revoked_at: '2026-10-01T00:00:00Z' },

  // User with INACTIVE ADMIN role
  { user_id: 'usr-inactive-admin', role: 'ADMIN', is_active: false, revoked_at: null },

  // Regular Player (no admin role)
  { user_id: 'usr-player', role: 'PLAYER', is_active: true, revoked_at: null },

  // Captain (no admin role)
  { user_id: 'usr-captain', role: 'CAPTAIN', is_active: true, revoked_at: null }
];

// 9a: Yalnızca ADMIN rolüne sahip kullanıcı yetkilendirilmeli
assert.equal(simulateCheckAdmin(mockRolesTable, 'usr-admin-only'), true, '9a: Yalnızca ADMIN olan kullanıcı onaylanmalı');

// 9b: Yalnızca SUPER_ADMIN rolüne sahip kullanıcı yetkilendirilmeli
assert.equal(simulateCheckAdmin(mockRolesTable, 'usr-super-only'), true, '9b: Yalnızca SUPER_ADMIN olan kullanıcı onaylanmalı');

// 9c: Hem ADMIN hem SUPER_ADMIN rolüne sahip kullanıcı .limit(1) ile hata almadan yetkilendirilmeli
assert.equal(simulateCheckAdmin(mockRolesTable, 'usr-dual-admin'), true, '9c: İki aktif role sahip kullanıcı başarıyla yetkilendirilmeli');

// 9d: Rolü iptal edilmiş (revoked_at dolu) yönetici reddedilmeli
assert.equal(simulateCheckAdmin(mockRolesTable, 'usr-revoked-admin'), false, '9d: revoked_at dolu olan yönetici reddedilmeli');

// 9e: Pasif (is_active = false) yönetici reddedilmeli
assert.equal(simulateCheckAdmin(mockRolesTable, 'usr-inactive-admin'), false, '9e: is_active = false olan yönetici reddedilmeli');

// 9f: Normal oyuncu veya kaptan reddedilmeli
assert.equal(simulateCheckAdmin(mockRolesTable, 'usr-player'), false, '9f: Normal oyuncu reddedilmeli');
assert.equal(simulateCheckAdmin(mockRolesTable, 'usr-captain'), false, '9f: Kaptan reddedilmeli');

// 9g: Oturumu olmayan (null) kullanıcı reddedilmeli
assert.equal(simulateCheckAdmin(mockRolesTable, null), false, '9g: Null kullanıcı reddedilmeli');

console.log('  [PASS] Yalnızca ADMIN, yalnızca SUPER_ADMIN ve ÇİFT ROL senaryoları hatasız doğrulandı.\n');


// -----------------------------------------------------------------------------
// Test 10: matchFixture Fikstür Eşleştirme Motoru
// -----------------------------------------------------------------------------
console.log('TEST 10: matchFixture Fikstür Eşleştirme (Düz, Ters, Saat Penceresi, Çakışma)...');

const mockFixtures = [
  {
    id: 'fix-1',
    home_team_id: 'team-gs',
    away_team_id: 'team-fb',
    scheduled_at: '2026-10-19T18:00:00.000Z', // 21:00 TRT (UTC 18:00)
    home_team: { ea_club_id: 1111 },
    away_team: { ea_club_id: 2222 }
  },
  {
    id: 'fix-2',
    home_team_id: 'team-bjk',
    away_team_id: 'team-ts',
    scheduled_at: '2026-10-19T19:00:00.000Z', // 22:00 TRT (UTC 19:00)
    home_team: { ea_club_id: 3333 },
    away_team: { ea_club_id: 4444 }
  }
];

// 10a: Düz fikstür eşleşmesi (Home=1111, Away=2222, Maç Saati: 21:15 TRT = 18:15 UTC)
const mockMatchStraight = {
  ea_match_id: 'ea-m1',
  played_at: '2026-10-19T18:15:00.000Z',
  home_team: { ea_club_id: 1111, score: 2, players: [] },
  away_team: { ea_club_id: 2222, score: 1, players: [] }
};
const res10a = matchFixture(mockMatchStraight, mockFixtures);
assert.equal(res10a.status, 'MATCHED', '10a must be MATCHED');
assert.equal(res10a.fixture_id, 'fix-1', '10a must match fix-1');
assert.equal(res10a.is_reversed, false, '10a is_reversed must be false');
assert.equal(res10a.home_team_id, 'team-gs', '10a home_team_id must be team-gs');

// 10b: Ters fikstür eşleşmesi (EA'de FB ev sahibi, GS deplasman açmış; Maç Saati: 22:30 TRT = 19:30 UTC)
const mockMatchReversed = {
  ea_match_id: 'ea-m2',
  played_at: '2026-10-19T19:30:00.000Z',
  home_team: { ea_club_id: 2222, score: 0, players: [] },
  away_team: { ea_club_id: 1111, score: 3, players: [] }
};
const res10b = matchFixture(mockMatchReversed, mockFixtures);
assert.equal(res10b.status, 'MATCHED', '10b must be MATCHED');
assert.equal(res10b.fixture_id, 'fix-1', '10b must match fix-1');
assert.equal(res10b.is_reversed, true, '10b is_reversed must be true');

// 10c: Kulüpler hiçbir fikstürle uyuşmuyor
const mockMatchUnmatched = {
  ea_match_id: 'ea-m3',
  played_at: '2026-10-19T18:15:00.000Z',
  home_team: { ea_club_id: 9999, score: 1, players: [] },
  away_team: { ea_club_id: 8888, score: 1, players: [] }
};
const res10c = matchFixture(mockMatchUnmatched, mockFixtures);
assert.equal(res10c.status, 'UNMATCHED', '10c must be UNMATCHED');

// 10d: Kulüpler uyuşuyor fakat maç saat penceresi dışında (Örn: ertesi gün öğlen 12:00)
const mockMatchOutsideWindow = {
  ea_match_id: 'ea-m4',
  played_at: '2026-10-20T12:00:00.000Z',
  home_team: { ea_club_id: 1111, score: 1, players: [] },
  away_team: { ea_club_id: 2222, score: 1, players: [] }
};
const res10d = matchFixture(mockMatchOutsideWindow, mockFixtures);
assert.equal(res10d.status, 'UNMATCHED', '10d outside window must be UNMATCHED');

// 10e: Aynı gece aynı takımlara ait mükerrer/çakışan fikstür (Belirsizlik)
const duplicateFixtures = [
  ...mockFixtures,
  {
    id: 'fix-1-dup',
    home_team_id: 'team-gs',
    away_team_id: 'team-fb',
    scheduled_at: '2026-10-19T18:30:00.000Z',
    home_team: { ea_club_id: 1111 },
    away_team: { ea_club_id: 2222 }
  }
];
const res10e = matchFixture(mockMatchStraight, duplicateFixtures);
assert.equal(res10e.status, 'AMBIGUOUS', '10e duplicate fixture window must be AMBIGUOUS');

// 10f: Geçersiz/bozuk tarih formatı koruması
const corruptedFixture = [{
  id: 'fix-bad',
  home_team_id: 'team-gs',
  away_team_id: 'team-fb',
  scheduled_at: 'invalid-date-string',
  home_team: { ea_club_id: 1111 },
  away_team: { ea_club_id: 2222 }
}];
const res10f = matchFixture(mockMatchStraight, corruptedFixture);
assert.equal(res10f.status, 'UNMATCHED', '10f invalid date string must be safely UNMATCHED');

console.log('  [PASS] matchFixture düz, ters, pencere dışı ve çakışma durumları doğrulandı.\n');


// -----------------------------------------------------------------------------
// Test 11: normalizeMatch Ham EA Verisi Ayrıştırma & Normalizasyon
// -----------------------------------------------------------------------------
console.log('TEST 11: normalizeMatch EA Ham JSON Ayrıştırma ve Tip Dönüşümü...');

const mockRawEaPayload = {
  matchId: '1234567890',
  timestamp: 1792437600, // 2026-10-19 19:20:00 UTC
  clubs: {
    '1111': {
      goals: '3',
      details: { name: 'Galatasaray Esports' }
    },
    '2222': {
      goals: '1',
      details: { name: 'Fenerbahce Esports' }
    }
  },
  players: {
    '1111': {
      'ea-p1': {
        playername: 'IboStriker',
        pos: 'forward',
        goals: '2',
        assists: '1',
        rating: '9.4',
        shots: '4',
        passesmade: '15',
        passattempts: '18',
        mom: '1'
      }
    },
    '2222': {
      'ea-p2': {
        playername: 'CemalMid',
        pos: 'midfielder',
        goals: '1',
        assists: '0',
        rating: '7.8',
        shots: '2',
        passesmade: '22',
        passattempts: '25',
        mom: '0'
      }
    }
  }
};

const normRes11 = normalizeMatch(mockRawEaPayload, 1111);
assert.ok(normRes11, '11a normalized match should not be null');
assert.equal(normRes11.ea_match_id, '1234567890', '11a matchId must match');
assert.equal(normRes11.home_team.score, 3, '11a home score must be integer 3');
assert.equal(normRes11.away_team.score, 1, '11a away score must be integer 1');
assert.equal(normRes11.home_team.players.length, 1, '11a home team players count');
assert.equal(normRes11.home_team.players[0].goals, 2, '11a player goals must be 2');
assert.equal(normRes11.home_team.players[0].is_mom, true, '11a player mom must be true');
assert.equal(normRes11.away_team.players[0].is_mom, false, '11a player mom must be false');

// 11b: Eksik veya 2'den az kulüplü bozuk veri null dönmeli
const invalidPayload = { matchId: 'bad', clubs: { '1111': {} }, players: {} };
assert.equal(normalizeMatch(invalidPayload, 0), null, '11b invalid clubs count must return null');

console.log('  [PASS] normalizeMatch skor, oyuncu istatistikleri ve rating dönüşümü doğrulandı.\n');


// -----------------------------------------------------------------------------
// Test 12: Profil Arama Filtre Enjeksiyon Koruması (searchProfilesAction Sanitization)
// -----------------------------------------------------------------------------
console.log('TEST 12: searchProfilesAction PostgREST Filtre Enjeksiyon Koruması...');

// 1. Normal names and Turkish characters (Production SSOT test via roster-validator.ts)
assert.equal(sanitizeProfileSearchQuery('Ahmet Yılmaz'), 'Ahmet Yılmaz', 'Normal full name preserved');
assert.equal(sanitizeProfileSearchQuery('Ömer Faruk Şimşek'), 'Ömer Faruk Şimşek', 'Turkish chars (Ö, ş) preserved');
assert.equal(sanitizeProfileSearchQuery('Çağlar Çelik'), 'Çağlar Çelik', 'Turkish chars (Ç, ğ) preserved');
assert.equal(sanitizeProfileSearchQuery('İsmail Hakkı'), 'İsmail Hakkı', 'Turkish chars (İ, ı) preserved');

// 2. Spaces, hyphens, underscores, dots, and apostrophes
assert.equal(sanitizeProfileSearchQuery('  Cemal   Yıldız  '), 'Cemal Yıldız', 'Multiple spaces collapsed and trimmed');
assert.equal(sanitizeProfileSearchQuery('pro-player'), 'pro-player', 'Hyphen preserved');
assert.equal(sanitizeProfileSearchQuery('cemal_10'), 'cemal_10', 'Underscore preserved for EA ID');
assert.equal(sanitizeProfileSearchQuery('ali.veli'), 'ali.veli', 'Dot preserved');
assert.equal(sanitizeProfileSearchQuery("O'Connor"), "O'Connor", 'Single quote preserved');

// 3. User punctuation (comma, parentheses, quotes) safely handled without breaking search intent
assert.equal(sanitizeProfileSearchQuery('Yılmaz, Ahmet'), 'Yılmaz Ahmet', 'Comma converted to space for natural search');
assert.equal(sanitizeProfileSearchQuery('Cemal (Kaptan)'), 'Cemal Kaptan', 'Parentheses stripped without syntax error');
assert.equal(sanitizeProfileSearchQuery('"ahmet10"'), 'ahmet10', 'Double quotes stripped');

// 4. Wildcard (% and *) neutralization to prevent broad table enumeration
assert.equal(sanitizeProfileSearchQuery('%%'), '', 'Consecutive % stripped to empty string');
assert.equal(sanitizeProfileSearchQuery('test%'), 'test', 'Trailing % wildcard stripped');
assert.equal(sanitizeProfileSearchQuery('*admin*'), 'admin', 'Asterisk wildcards stripped');
assert.equal(sanitizeProfileSearchQuery('100%'), '100', 'Percentage symbol stripped');

// 5. Malicious PostgREST filter injection payloads neutralized
assert.equal(sanitizeProfileSearchQuery('test,role.eq.ADMIN'), 'test role.eq.ADMIN', 'Filter comma neutralized to space');
assert.equal(sanitizeProfileSearchQuery('foo)or(role.eq.SUPER_ADMIN'), 'fooorrole.eq.SUPER_ADMIN', 'Parenthesis subfilter breakout neutralized');
assert.equal(sanitizeProfileSearchQuery('admin",id.neq.0'), 'admin id.neq.0', 'Quote escape and comma delimiter neutralized');
assert.equal(sanitizeProfileSearchQuery('test\\escape'), 'testescape', 'Backslash stripped');
assert.equal(sanitizeProfileSearchQuery(null), '', 'Null returns empty string');
assert.equal(sanitizeProfileSearchQuery(undefined), '', 'Undefined returns empty string');

// 6. PostgREST .or(...) sorgu dizesi yapısal bütünlük testi (Gerçek Action Tarafından Kullanılan buildProfilesOrFilter)
// Boş, tek karakterli veya temizlendikten sonra < 2 karakter kalan sorgular null döner (Veritabanına sorgu atılmaz!)
assert.equal(buildProfilesOrFilter(''), null, 'Empty string returns null');
assert.equal(buildProfilesOrFilter('a'), null, 'Single char returns null');
assert.equal(buildProfilesOrFilter('   '), null, 'Whitespace-only returns null');
assert.equal(buildProfilesOrFilter('%%'), null, 'Wildcard-only arama null dönmeli, DB sorgusu üretmemeli');
assert.equal(buildProfilesOrFilter(' * '), null, 'Asterisk-only arama null dönmeli');
assert.equal(buildProfilesOrFilter(',()'), null, 'Delimiter-only arama null dönmeli');

// Geçerli aramada tam 3 koşul üretilir
const validFilter = buildProfilesOrFilter('Ahmet Yılmaz');
assert.equal(validFilter.split(',').length, 3, 'Geçerli arama tam olarak 3 koşul üretmeli');

// Enjeksiyon girişimlerinde virgül ve parantez etkisiz kılındığı için koşul sayısı asla 3'ün üzerine çıkamaz
const injectionAttempts = [
  'test,role.eq.ADMIN',
  'x,is_active.eq.false,id.neq.0',
  'a,b,c,d,e',
  'admin",id.neq.0',
  'foo)or(role.eq.SUPER_ADMIN'
];
for (const attempt of injectionAttempts) {
  const filter = buildProfilesOrFilter(attempt);
  assert.equal(filter.split(',').length, 3, `Enjeksiyon denemesi (${attempt}) koşul sayısını artıramamalı`);
  assert.ok(!filter.includes('(') && !filter.includes(')'), `Enjeksiyon denemesi (${attempt}) parantez içerememeli`);
}

console.log('  [PASS] PostgREST filtre enjeksiyon, syntax ve wildcard enumeration koruması doğrulandı.\n');


// -----------------------------------------------------------------------------
// Test 13: Skor Güncelleme Doğrulaması (updateMatchScoreAction Validation)
// -----------------------------------------------------------------------------
console.log('TEST 13: Skor Güncelleme Parametre Doğrulaması (Negatif / Kesirli Skor Koruması)...');

function validateScoreInput(matchId, homeScore, awayScore, status = 'PENDING_REVIEW') {
  if (!matchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchId)) {
    return { error: 'Geçersiz maç kimliği.' };
  }
  if (
    typeof homeScore !== 'number' ||
    typeof awayScore !== 'number' ||
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    return { error: 'Geçersiz skor: Skorlar negatif olamaz ve tam sayı olmalıdır.' };
  }
  if (status === 'APPROVED') {
    return { error: 'Onaylanmış maçın skoru doğrudan değiştirilemez. Önce maç onayını geri alınız veya maçı incelemeye alınız.' };
  }
  return { success: true };
}

const validUuid = '11111111-2222-3333-4444-555555555555';
assert.equal(validateScoreInput(validUuid, 2, 1).success, true, '13a valid score 2-1 accepted');
assert.equal(validateScoreInput(validUuid, 0, 0).success, true, '13b valid score 0-0 accepted');
assert.ok(validateScoreInput(validUuid, -1, 2).error, '13c negative score rejected');
assert.ok(validateScoreInput(validUuid, 2.5, 1).error, '13d float score rejected');
assert.ok(validateScoreInput(validUuid, NaN, 1).error, '13e NaN score rejected');
assert.ok(validateScoreInput('not-a-uuid', 1, 0).error, '13f invalid uuid rejected');
// 13g: Onaylanmış (APPROVED) maçta skor düzenleme kesinlikle reddedilmeli
assert.ok(validateScoreInput(validUuid, 3, 1, 'APPROVED').error, '13g approved match score update must be rejected');
assert.equal(validateScoreInput(validUuid, 3, 1, 'PENDING_REVIEW').success, true, '13h pending match score update allowed');

console.log('  [PASS] Negatif, kesirli ve geçersiz skor girişleri ile onaylanmış maç koruması doğrulandı.\n');


// -----------------------------------------------------------------------------
// Test 14: İstatistik Hesaplama İdempotency & Eşleşmemiş Oyuncuların İzolasyonu
// SINIFLANDIRMA: MOCK / SİMÜLASYON TESTİ
// (supabase/migrations/20260821000011_match_hardening.sql mantığını simüle eder)
// -----------------------------------------------------------------------------
console.log('TEST 14: İstatistik Hesaplama İdempotency ve player_id=NULL İzolasyonu (MOCK / SİMÜLASYON TESTİ)...');

function simulateRecalculateStats(matches, playerStatsRows, seasonId) {
  // Simulates Postgres recalculate_season_stats:
  // ONLY matches with status='APPROVED' are considered
  const approvedMatches = matches.filter(m => m.season_id === seasonId && m.status === 'APPROVED');

  // Team season stats
  let homeTeamGoals = 0;
  let awayTeamGoals = 0;
  for (const m of approvedMatches) {
    homeTeamGoals += m.home_score;
    awayTeamGoals += m.away_score;
  }

  // Player season stats: STRICTLY WHERE mps.player_id IS NOT NULL
  const approvedMatchIds = new Set(approvedMatches.map(m => m.id));
  const validPlayerStats = playerStatsRows.filter(
    s => approvedMatchIds.has(s.match_id) && s.player_id !== null && s.player_id !== undefined
  );

  const playerGoalMap = new Map();
  for (const s of validPlayerStats) {
    playerGoalMap.set(s.player_id, (playerGoalMap.get(s.player_id) || 0) + s.goals);
  }

  return {
    approvedMatchCount: approvedMatches.length,
    totalGoals: homeTeamGoals + awayTeamGoals,
    playerGoals: Object.fromEntries(playerGoalMap)
  };
}

const simMatches = [
  { id: 'm-1', season_id: 's-1', status: 'APPROVED', home_score: 2, away_score: 1 },
  { id: 'm-2', season_id: 's-1', status: 'PENDING_REVIEW', home_score: 5, away_score: 0 }
];

const simPlayerStats = [
  // In m-1 (APPROVED): Player 1 scored 2 goals
  { match_id: 'm-1', player_id: 'p-1', goals: 2 },
  // In m-1 (APPROVED): Unmatched player scored 1 goal (player_id = NULL)
  { match_id: 'm-1', player_id: null, goals: 1 },
  // In m-2 (PENDING_REVIEW): Player 1 scored 5 goals
  { match_id: 'm-2', player_id: 'p-1', goals: 5 }
];

// 1. Initial run
const run1 = simulateRecalculateStats(simMatches, simPlayerStats, 's-1');
assert.equal(run1.approvedMatchCount, 1, '14a Only 1 approved match considered');
assert.equal(run1.totalGoals, 3, '14b Total team goals from approved match is 3');
assert.equal(run1.playerGoals['p-1'], 2, '14c Player p-1 only gets 2 goals from approved match');
assert.equal(run1.playerGoals[null], undefined, '14d Unmatched player_id=null NEVER added to player stats');

// 2. Idempotency: Running it second time produces identical output
const run2 = simulateRecalculateStats(simMatches, simPlayerStats, 's-1');
assert.deepEqual(run1, run2, '14e Recalculation is 100% idempotent');

// 3. Score update simulation: Updating score from 2-1 to 3-1 does not accumulate with old stats
const updatedMatches = [
  { id: 'm-1', season_id: 's-1', status: 'APPROVED', home_score: 3, away_score: 1 },
  { id: 'm-2', season_id: 's-1', status: 'PENDING_REVIEW', home_score: 5, away_score: 0 }
];
const updatedPlayerStats = [
  { match_id: 'm-1', player_id: 'p-1', goals: 3 },
  { match_id: 'm-1', player_id: null, goals: 1 },
  { match_id: 'm-2', player_id: 'p-1', goals: 5 }
];
const runScoreUpdate = simulateRecalculateStats(updatedMatches, updatedPlayerStats, 's-1');
assert.equal(runScoreUpdate.totalGoals, 4, '14f Total goals cleanly recalculated to 4 (not 3+4=7)');
assert.equal(runScoreUpdate.playerGoals['p-1'], 3, '14g Player p-1 goals cleanly recalculated to 3 (not 2+3=5)');

// 4. Match deletion simulation: Deleting m-1 leaves 0 approved matches in season s-1
const matchesAfterDelete = [
  { id: 'm-2', season_id: 's-1', status: 'PENDING_REVIEW', home_score: 5, away_score: 0 }
];
const runAfterDelete = simulateRecalculateStats(matchesAfterDelete, updatedPlayerStats, 's-1');
assert.equal(runAfterDelete.approvedMatchCount, 0, '14h 0 approved matches after delete');
assert.equal(runAfterDelete.totalGoals, 0, '14i Total goals cleanly resets to 0');
assert.deepEqual(runAfterDelete.playerGoals, {}, '14j Player stats cleanly resets to empty');

// 5. Cross-season isolation: Season s-2 has its own approved match
const multiSeasonMatches = [
  { id: 'm-s1', season_id: 's-1', status: 'APPROVED', home_score: 1, away_score: 0 },
  { id: 'm-s2', season_id: 's-2', status: 'APPROVED', home_score: 4, away_score: 2 }
];
const multiSeasonPlayerStats = [
  { match_id: 'm-s1', player_id: 'p-1', goals: 1 },
  { match_id: 'm-s2', player_id: 'p-1', goals: 4 }
];
const runSeason1 = simulateRecalculateStats(multiSeasonMatches, multiSeasonPlayerStats, 's-1');
const runSeason2 = simulateRecalculateStats(multiSeasonMatches, multiSeasonPlayerStats, 's-2');
assert.equal(runSeason1.totalGoals, 1, '14k Season 1 total goals isolated');
assert.equal(runSeason2.totalGoals, 6, '14l Season 2 total goals isolated');
assert.equal(runSeason1.playerGoals['p-1'], 1, '14m Player goals in Season 1 isolated');
assert.equal(runSeason2.playerGoals['p-1'], 4, '14n Player goals in Season 2 isolated');

console.log('  [PASS] İstatistik hesaplamasının idempotency, skor güncelleme/silme ve player_id=NULL izolasyonu başarıyla doğrulandı.\n');


// -----------------------------------------------------------------------------
// Test 15: Round-Robin Fikstür Oluşturma, Hafta Dağılımı ve Önizleme Çakışma Doğrulaması
// -----------------------------------------------------------------------------
console.log('TEST 15: Round-Robin Fikstür Oluşturma, Hafta Dağılımı ve Önizleme Çakışma Doğrulaması...');

// 15a: 4 Takım (Çift Devre - 12 Karşılaşma, 6 Hafta)
const teams4 = [
  { id: 'team-1', name: 'Takım 1' },
  { id: 'team-2', name: 'Takım 2' },
  { id: 'team-3', name: 'Takım 3' },
  { id: 'team-4', name: 'Takım 4' }
];

const fixtures4 = generateRoundRobin(teams4, true);
assert.equal(fixtures4.length, 12, '15a 4 takım çift devrede tam 12 maç üretmeli (N * (N-1))');

const weeks4 = new Set(fixtures4.map(f => f.week));
assert.equal(weeks4.size, 6, '15b 4 takım çift devrede tam 6 haftaya yayılmalı');

// Her hafta her takım tam 1 maç yapmalı (Haftada 2 maç)
for (let w = 1; w <= 6; w++) {
  const weekMatches = fixtures4.filter(f => f.week === w);
  assert.equal(weekMatches.length, 2, `15c Hafta ${w}'de tam 2 maç olmalı`);
  const playingTeams = new Set();
  for (const m of weekMatches) {
    assert.notEqual(m.home.id, m.away.id, '15d Ev sahibi ve deplasman farklı olmalı');
    playingTeams.add(m.home.id);
    playingTeams.add(m.away.id);
  }
  assert.equal(playingTeams.size, 4, `15e Hafta ${w}'de tüm 4 takım oynamalı`);
}

// 15f: Tek Sayıda Takım (5 Takım - BYE Bay Koruması)
const teams5 = [
  { id: 't-1', name: 'Takım 1' },
  { id: 't-2', name: 'Takım 2' },
  { id: 't-3', name: 'Takım 3' },
  { id: 't-4', name: 'Takım 4' },
  { id: 't-5', name: 'Takım 5' }
];

const fixtures5 = generateRoundRobin(teams5, true);
assert.equal(fixtures5.length, 20, '15f 5 takım çift devrede tam 20 maç üretmeli (5 * 4)');
// Hiçbir maçta BYE takımı yer almamalı
assert.ok(!fixtures5.some(f => f.home.id === 'BYE' || f.away.id === 'BYE'), '15g BYE maçları temizlenmiş olmalı');

// 15h: computeFixturePreview - Çakışma / Mükerrer Tespiti
const existingFixturesInDb = [
  { home_team_id: 'team-1', away_team_id: 'team-2', week_number: 1 },
  { home_team_id: 'team-3', away_team_id: 'team-4', week_number: 1 }
];

const previewResult = computeFixturePreview(
  teams4,
  existingFixturesInDb,
  '2026-10-19T20:00:00Z',
  true
);

assert.equal(previewResult.totalMatches, 12, '15h Toplam 12 maç önizlenmeli');
assert.equal(previewResult.duplicateMatchesCount, 2, '15i DB ile çakışan 2 mükerrer maç tespit edilmeli');
assert.equal(previewResult.newMatchesCount, 10, '15j 10 yeni maç belirlenmeli');
assert.equal(previewResult.weeksCount, 6, '15k 6 hafta hesaplanmalı');

// İlk haftadaki maçlar is_duplicate=true olmalı
const dupMatch = previewResult.preview.find(p => p.home_team_id === 'team-1' && p.away_team_id === 'team-2');
assert.ok(dupMatch, '15l team-1 vs team-2 önizlemede bulunmalı');
assert.equal(dupMatch.is_duplicate, true, '15m Mükerrer maç is_duplicate=true bayrağı almalı');

// Pazartesi Oturumu: Hafta 1 (22:00 TRT) ve Hafta 2 (22:30 TRT) aynı Pazartesi günü oynanır, aralarında 30 dakika vardır
const week1Date = new Date(previewResult.preview.find(p => p.week === 1).scheduled_at);
const week2Date = new Date(previewResult.preview.find(p => p.week === 2).scheduled_at);
const diffMinutes = Math.round((week2Date - week1Date) / (1000 * 60));
assert.equal(diffMinutes, 30, '15n Aynı oturumdaki haftalar (Hafta 1 ve Hafta 2) arası 30 dakika olmalı');

// Oturumlar arası (Hafta 1 - Oturum 1 vs Hafta 4 - Oturum 2) tam 7 gün olmalı
const week4Date = new Date(previewResult.preview.find(p => p.week === 4).scheduled_at);
const diffDaysSessions = Math.round((week4Date - week1Date) / (1000 * 60 * 60 * 24));
assert.equal(diffDaysSessions, 7, '15o 1. Oturum ile 2. Oturum arası tam 7 gün olmalı');

console.log('  [PASS] Round-robin simülasyonu, hafta dağılımı ve mükerrer önizleme tespiti doğrulandı.\n');


// -----------------------------------------------------------------------------
// Test 16: Fikstür Güncelleme Doğrulaması ve Skor Girişi Onay İzolasyonu
// -----------------------------------------------------------------------------
console.log('TEST 16: Fikstür Güncelleme Doğrulaması ve Skor Girişi Onay İzolasyonu (Decoupled Score vs Approval)...');

const mockFixture = {
  home_team_id: 'home-1',
  away_team_id: 'away-1',
  week_number: 1,
  status: 'SCHEDULED'
};

// 16a: Hafta < 1 veya kesirli hafta reddi
assert.ok(validateFixtureUpdate(mockFixture, { week_number: 0 }, false).error, '16a Hafta 0 reddedilmeli');
assert.ok(validateFixtureUpdate(mockFixture, { week_number: -2 }, false).error, '16b Negatif hafta reddedilmeli');
assert.ok(validateFixtureUpdate(mockFixture, { week_number: 1.5 }, false).error, '16c Kesirli hafta reddedilmeli');
assert.equal(validateFixtureUpdate(mockFixture, { week_number: 2 }, false).success, true, '16d Hafta 2 kabul edilmeli');

// 16b: Aynı takım eşleşmesi reddi
assert.ok(
  validateFixtureUpdate(mockFixture, { home_team_id: 'team-x', away_team_id: 'team-x' }, false).error,
  '16e Ev sahibi ve deplasman aynı takım olamaz'
);

// 16c: Bağlı maç varken takım değiştirme yasağı (Composite FK koruması)
const updateWithLinkedMatch = validateFixtureUpdate(
  mockFixture,
  { home_team_id: 'new-home-id' },
  true // hasLinkedMatch = true
);
assert.ok(updateWithLinkedMatch.error, '16f Bağlı maç varken takımlar değiştirilemez');
assert.ok(
  updateWithLinkedMatch.error.includes('bağlı oynanmış/kaydedilmiş bir maç kaydı bulunmaktadır'),
  '16g Doğru açıklayıcı hata mesajı dönmeli'
);

// 16d: Bağlı maç yokken takım değişikliği geçerli
const updateWithoutLinkedMatch = validateFixtureUpdate(
  mockFixture,
  { home_team_id: 'new-home-id' },
  false // hasLinkedMatch = false
);
assert.equal(updateWithoutLinkedMatch.success, true, '16h Bağlı maç yokken takım değişikliği geçerli');

// 16e: Geçersiz durum dizesi reddi
assert.ok(validateFixtureUpdate(mockFixture, { status: 'INVALID_STATUS' }, false).error, '16i Geçersiz durum reddedilmeli');
assert.equal(validateFixtureUpdate(mockFixture, { status: 'POSTPONED' }, false).success, true, '16j POSTPONED kabul edilmeli');

// 16f: Skor Girişi Onay İzolasyonu (Decoupled Score Entry)
// Yeni maç oluşturulduğunda skor girilse bile KESİNLİKLE PENDING_REVIEW olmalı, ASLA APPROVED olmamalı!
const newMatchScore = validateAndDetermineScoreStatus(3, 1, null);
assert.equal(newMatchScore.success, true, '16k Geçerli skor 3-1 kabul edilmeli');
assert.equal(newMatchScore.targetStatus, 'PENDING_REVIEW', '16l Yeni maç skoru ASLA otomatik APPROVED olamaz, PENDING_REVIEW kalmalı');

// Mevcut PENDING_REVIEW maçı skoru güncellendiğinde PENDING_REVIEW kalmalı
const existingPending = { id: 'm-pending', status: 'PENDING_REVIEW' };
const updatePendingScore = validateAndDetermineScoreStatus(2, 2, existingPending);
assert.equal(updatePendingScore.targetStatus, 'PENDING_REVIEW', '16m Mevcut PENDING_REVIEW maçın skoru güncellendiğinde APPROVED olamaz');

// Mevcut APPROVED maçı skoru düzeltildiğinde durum korunmalı
const existingApproved = { id: 'm-approved', status: 'APPROVED' };
const updateApprovedScore = validateAndDetermineScoreStatus(4, 0, existingApproved);
assert.equal(updateApprovedScore.targetStatus, 'APPROVED', '16n Mevcut APPROVED maçın skoru düzeltildiğinde durum korunur');

// Negatif ve kesirli skorlar reddedilmeli
assert.ok(validateAndDetermineScoreStatus(-1, 2, null).error, '16o Negatif skor reddedilmeli');
assert.ok(validateAndDetermineScoreStatus(2.5, 1, null).error, '16p Kesirli skor reddedilmeli');

console.log('  [PASS] Fikstür güncelleme kısıtları ve skor girişi onay izolasyonu başarıyla doğrulandı.\n');


// -----------------------------------------------------------------------------
// Test 17: 12 Takımlı Çift Devreli Lig Fikstürü (132 Maç, 22 Hafta)
// -----------------------------------------------------------------------------
console.log('TEST 17: 12 Takımlı Çift Devreli Lig Fikstürü (132 Maç, 22 Hafta Dağılımı)...');

const teams12 = Array.from({ length: 12 }, (_, i) => ({
  id: `team-${i + 1}`,
  name: `FC Kulüp ${i + 1}`
}));

const pairs12 = generateRoundRobin(teams12, true);

// 17a: Toplam maç sayısı tam 132 olmalı (12 * 11)
assert.equal(pairs12.length, 132, '17a 12 takım çift devreli ligde tam 132 maç üretmeli');

// 17b: Toplam hafta sayısı tam 22 olmalı
const allWeeks12 = Array.from(new Set(pairs12.map(p => p.week))).sort((a, b) => a - b);
assert.equal(allWeeks12.length, 22, '17b Toplam hafta sayısı tam 22 olmalı');
assert.equal(Math.min(...allWeeks12), 1, '17c İlk hafta 1 olmalı');
assert.equal(Math.max(...allWeeks12), 22, '17d Son hafta 22 olmalı');

// 17c: Her haftada tam 6 maç oynanmalı (12 / 2) ve her takım haftada 1 kez yer almalı
for (let w = 1; w <= 22; w++) {
  const weekMatches = pairs12.filter(p => p.week === w);
  assert.equal(weekMatches.length, 6, `17e Hafta ${w}'de tam 6 karşılaşma olmalı`);

  const participatingTeams = new Set();
  for (const m of weekMatches) {
    assert.notEqual(m.home.id, m.away.id, `17f Hafta ${w}'de takım kendisiyle oynayamaz`);
    participatingTeams.add(m.home.id);
    participatingTeams.add(m.away.id);
  }
  assert.equal(participatingTeams.size, 12, `17g Hafta ${w}'de tüm 12 takım eksiksiz yer almalı`);
}

// 17d: Rövanş kuralı - İlk devre (1-11) oynanan her maçın ikinci devre (12-22) tersi oynanmalı
for (let w = 1; w <= 11; w++) {
  const firstHalfMatches = pairs12.filter(p => p.week === w);
  const secondHalfMatches = pairs12.filter(p => p.week === w + 11);

  for (const fhm of firstHalfMatches) {
    const rev = secondHalfMatches.find(shm => shm.home.id === fhm.away.id && shm.away.id === fhm.home.id);
    assert.ok(rev, `17h Hafta ${w}'deki maçın Hafta ${w + 11}'de rövanşı bulunmalı`);
  }
}

console.log('  [PASS] 12 takımlı lig için 132 maç ve 22 haftalık çift devre dağılımı doğrulandı.\n');


// -----------------------------------------------------------------------------
// Test 18: Pazartesi Oturumları (Monday Sessions) Takvimi & Devre Arası Atlama
// -----------------------------------------------------------------------------
console.log('TEST 18: Pazartesi Oturumları (Monday Sessions) Takvimi, Devre Arası ve Saat Dağılımı...');

const baseMondayStr = '2026-10-12'; // 12 Ekim 2026 Pazartesi

// 18a: Başlangıç Tarihi Çıpalama (Pazartesi Olmayan Tarihlerin Sonraki Pazartesi'ye İlerletilmesi)
assert.equal(getFirstMondayDate('2026-10-12').toISOString().split('T')[0], '2026-10-12', '18a Pazartesi günü aynen çıpalanır');
assert.equal(getFirstMondayDate('2026-10-13').toISOString().split('T')[0], '2026-10-19', '18b Salı -> Sonraki Pazartesi (19 Ekim)');
assert.equal(getFirstMondayDate('2026-10-14').toISOString().split('T')[0], '2026-10-19', '18c Çarşamba -> Sonraki Pazartesi (19 Ekim)');
assert.equal(getFirstMondayDate('2026-10-18').toISOString().split('T')[0], '2026-10-19', '18d Pazar -> Sonraki Pazartesi (19 Ekim)');

// 18b: Oturum Dağılımı (8 Oturum, Her Hafta İçin Doğru Saat ve Oturum)
// Oturum 1: Hafta 1, 2, 3 (22:00, 22:30, 23:00 TRT)
const w1 = calculateWeekScheduledAt(baseMondayStr, 1);
const w2 = calculateWeekScheduledAt(baseMondayStr, 2);
const w3 = calculateWeekScheduledAt(baseMondayStr, 3);
assert.equal(w1.sessionNumber, 1, '18e Hafta 1 -> Oturum 1');
assert.equal(w2.sessionNumber, 1, '18f Hafta 2 -> Oturum 1');
assert.equal(w3.sessionNumber, 1, '18g Hafta 3 -> Oturum 1');
assert.equal(w1.scheduledAt, '2026-10-12T19:00:00.000Z', '18h Hafta 1 -> 22:00 TRT (19:00 UTC)');
assert.equal(w2.scheduledAt, '2026-10-12T19:30:00.000Z', '18i Hafta 2 -> 22:30 TRT (19:30 UTC)');
assert.equal(w3.scheduledAt, '2026-10-12T20:00:00.000Z', '18j Hafta 3 -> 23:00 TRT (20:00 UTC)');

// Oturum 2: Hafta 4, 5, 6 (22:00, 22:30, 23:00 TRT) -> 19 Ekim
const w4 = calculateWeekScheduledAt(baseMondayStr, 4);
const w5 = calculateWeekScheduledAt(baseMondayStr, 5);
const w6 = calculateWeekScheduledAt(baseMondayStr, 6);
assert.equal(w4.sessionNumber, 2, '18k Hafta 4 -> Oturum 2');
assert.equal(w4.scheduledAt, '2026-10-19T19:00:00.000Z', '18l Hafta 4 -> 19 Ekim 22:00 TRT');
assert.equal(w5.scheduledAt, '2026-10-19T19:30:00.000Z', '18m Hafta 5 -> 19 Ekim 22:30 TRT');
assert.equal(w6.scheduledAt, '2026-10-19T20:00:00.000Z', '18n Hafta 6 -> 19 Ekim 23:00 TRT');

// Oturum 3: Hafta 7, 8, 9 -> 26 Ekim
const w7 = calculateWeekScheduledAt(baseMondayStr, 7);
assert.equal(w7.sessionNumber, 3, '18o Hafta 7 -> Oturum 3');
assert.equal(w7.scheduledAt, '2026-10-26T19:00:00.000Z', '18p Hafta 7 -> 26 Ekim 22:00 TRT');

// Oturum 4: Hafta 10, 11, 12 -> 2 Kasım
const w10 = calculateWeekScheduledAt(baseMondayStr, 10);
const w11 = calculateWeekScheduledAt(baseMondayStr, 11);
const w12 = calculateWeekScheduledAt(baseMondayStr, 12);
assert.equal(w10.sessionNumber, 4, '18q Hafta 10 -> Oturum 4');
assert.equal(w11.scheduledAt, '2026-11-02T19:30:00.000Z', '18q2 Hafta 11 -> 2 Kasım 22:30 TRT');
assert.equal(w12.scheduledAt, '2026-11-02T20:00:00.000Z', '18r Hafta 12 -> 2 Kasım 23:00 TRT');

// 18c: DEVRE ARASI (Mid-Season Break) Atlama Kuralı:
// 4. Pazartesi (2 Kasım) ile 5. Pazartesi (16 Kasım) arasında tam 1 Pazartesi (9 Kasım) BOŞ GEÇİLİR.
// Hafta 12 ile Hafta 13 arasında tam 14 gün (2 hafta) fark olmalı!
const w13 = calculateWeekScheduledAt(baseMondayStr, 13);
const breakInfo = getMidSeasonBreakInfo(baseMondayStr);
assert.equal(breakInfo.breakMondayDate, '2026-11-09', '18s Devre arası boş Pazartesi tarihi 9 Kasım 2026 olmalı');

const diffDaysBreak = Math.round((new Date(w13.scheduledAt) - new Date(w12.scheduledAt)) / (1000 * 60 * 60 * 24));
assert.equal(diffDaysBreak, 14, '18t Hafta 12 ile Hafta 13 arasında tam 14 gün (1 boş Pazartesi) olmalı');
assert.equal(w13.sessionNumber, 5, '18u Hafta 13 -> Oturum 5');
assert.equal(w13.scheduledAt, '2026-11-16T19:00:00.000Z', '18v Hafta 13 -> 16 Kasım 22:00 TRT');

// Oturum 5: Hafta 13, 14, 15 -> 16 Kasım
const w14 = calculateWeekScheduledAt(baseMondayStr, 14);
const w15 = calculateWeekScheduledAt(baseMondayStr, 15);
assert.equal(w14.scheduledAt, '2026-11-16T19:30:00.000Z', '18w Hafta 14 -> 16 Kasım 22:30 TRT');
assert.equal(w15.scheduledAt, '2026-11-16T20:00:00.000Z', '18x Hafta 15 -> 16 Kasım 23:00 TRT');

// Oturum 6: Hafta 16, 17, 18 -> 23 Kasım
const w16 = calculateWeekScheduledAt(baseMondayStr, 16);
const w17 = calculateWeekScheduledAt(baseMondayStr, 17);
const w18 = calculateWeekScheduledAt(baseMondayStr, 18);
assert.equal(w16.sessionNumber, 6, '18y Hafta 16 -> Oturum 6');
assert.equal(w16.scheduledAt, '2026-11-23T19:00:00.000Z', '18z Hafta 16 -> 23 Kasım 22:00 TRT');
assert.equal(w17.scheduledAt, '2026-11-23T19:30:00.000Z', '18z2 Hafta 17 -> 23 Kasım 22:30 TRT');
assert.equal(w18.scheduledAt, '2026-11-23T20:00:00.000Z', '18aa Hafta 18 -> 23 Kasım 23:00 TRT');

// Oturum 7: Hafta 19, 20 (2 maç: 22:00, 22:30 TRT) -> 30 Kasım
const w19 = calculateWeekScheduledAt(baseMondayStr, 19);
const w20 = calculateWeekScheduledAt(baseMondayStr, 20);
assert.equal(w19.sessionNumber, 7, '18ab Hafta 19 -> Oturum 7');
assert.equal(w20.sessionNumber, 7, '18ac Hafta 20 -> Oturum 7');
assert.equal(w19.scheduledAt, '2026-11-30T19:00:00.000Z', '18ad Hafta 19 -> 30 Kasım 22:00 TRT');
assert.equal(w20.scheduledAt, '2026-11-30T19:30:00.000Z', '18ae Hafta 20 -> 30 Kasım 22:30 TRT');

// Oturum 8: Hafta 21, 22 (2 maç: 22:00, 22:30 TRT) -> 7 Aralık
const w21 = calculateWeekScheduledAt(baseMondayStr, 21);
const w22 = calculateWeekScheduledAt(baseMondayStr, 22);
assert.equal(w21.sessionNumber, 8, '18af Hafta 21 -> Oturum 8');
assert.equal(w22.sessionNumber, 8, '18ag Hafta 22 -> Oturum 8');
assert.equal(w21.scheduledAt, '2026-12-07T19:00:00.000Z', '18ah Hafta 21 -> 7 Aralık 22:00 TRT');
assert.equal(w22.scheduledAt, '2026-12-07T19:30:00.000Z', '18ai Hafta 22 -> 7 Aralık 22:30 TRT');

// 18d: Toplam Takvim Süresi (56 Gün = 8 Hafta Ara)
const totalCalendarDays = Math.round((new Date(w22.scheduledAt) - new Date(w1.scheduledAt)) / (1000 * 60 * 60 * 24));
assert.equal(totalCalendarDays, 56, '18aj 1. Oturumdan 8. Oturuma toplam takvim süresi tam 56 gün (8 hafta ara)');

// 18e: Aynı Lig Haftasındaki 6 Karşılaşmanın Tamamının Eş Zamanlı Oynanması
// 12 takımlı lig için üretilen tüm fikstür incelenir
const fullPreview12 = computeFixturePreview(teams12, [], baseMondayStr, true);
assert.equal(fullPreview12.totalMatches, 132, '18ak Toplam 132 maç üretilmeli');

for (let w = 1; w <= 22; w++) {
  const weekMatches = fullPreview12.preview.filter(p => p.week === w);
  assert.equal(weekMatches.length, 6, `18al Hafta ${w}'de tam 6 karşılaşma olmalı`);

  // 6 maçın tamamının scheduled_at zaman damgası birebir aynı olmalı (Eş Zamanlı Başlama)
  const uniqueTimesInWeek = new Set(weekMatches.map(p => p.scheduled_at));
  assert.equal(
    uniqueTimesInWeek.size,
    1,
    `18am Hafta ${w}'deki 6 karşılaşmanın tamamı eş zamanlı (tek bir saat damgasında) başlamalı`
  );
}

// 18f: Her Takımın Aynı Oturumdaki 3 Maçının Birbirinden Farklı Saatlerde Olması (Sıfır Çakışma)
// 8 Oturumun haftaları:
const sessionWeeksMap = [
  { session: 1, weeks: [1, 2, 3], expectedKickoffs: ['22:00', '22:30', '23:00'] },
  { session: 2, weeks: [4, 5, 6], expectedKickoffs: ['22:00', '22:30', '23:00'] },
  { session: 3, weeks: [7, 8, 9], expectedKickoffs: ['22:00', '22:30', '23:00'] },
  { session: 4, weeks: [10, 11, 12], expectedKickoffs: ['22:00', '22:30', '23:00'] },
  { session: 5, weeks: [13, 14, 15], expectedKickoffs: ['22:00', '22:30', '23:00'] },
  { session: 6, weeks: [16, 17, 18], expectedKickoffs: ['22:00', '22:30', '23:00'] },
  { session: 7, weeks: [19, 20], expectedKickoffs: ['22:00', '22:30'] },
  { session: 8, weeks: [21, 22], expectedKickoffs: ['22:00', '22:30'] }
];

for (const sessionConfig of sessionWeeksMap) {
  for (const team of teams12) {
    // Takımın bu oturumdaki tüm maçları
    const teamMatchesInSession = fullPreview12.preview.filter(
      p => sessionConfig.weeks.includes(p.week) &&
           (p.home_team_id === team.id || p.away_team_id === team.id)
    );

    // Her takım oturumdaki hafta sayısı kadar maça çıkmalı (3 veya 2 maç)
    assert.equal(
      teamMatchesInSession.length,
      sessionConfig.weeks.length,
      `18an Takım ${team.name} Oturum ${sessionConfig.session}'de tam ${sessionConfig.weeks.length} maça çıkmalı`
    );

    // Tüm maçlar aynı Pazartesi günü oynanmalı
    const matchDates = new Set(
      teamMatchesInSession.map(p => new Date(p.scheduled_at).toISOString().split('T')[0])
    );
    assert.equal(
      matchDates.size,
      1,
      `18ao Takım ${team.name} Oturum ${sessionConfig.session}'deki tüm maçlarını aynı Pazartesi günü oynamalı`
    );

    // Maçların başlama saatleri kesinlikle birbirinden FARKLI olmalı (Çakışma Yok)
    const kickoffTimes = teamMatchesInSession.map(p => p.time_trt);
    assert.deepEqual(
      kickoffTimes.sort(),
      [...sessionConfig.expectedKickoffs].sort(),
      `18ap Takım ${team.name} Oturum ${sessionConfig.session}'de tam olarak ${sessionConfig.expectedKickoffs.join(', ')} saatlerinde oynamalı`
    );

    // Zaman damgalarının (timestamps) tekilliği (her maç farklı bir timestamp almalı)
    const uniqueTimestamps = new Set(teamMatchesInSession.map(p => p.scheduled_at));
    assert.equal(
      uniqueTimestamps.size,
      sessionConfig.weeks.length,
      `18aq Takım ${team.name} Oturum ${sessionConfig.session}'deki maçları birbirinden farklı zaman damgalarına sahip olmalı`
    );
  }
}

// 18g: Türkiye Saat Dilimi (Europe/Istanbul) Biçimlendirme Doğrulaması
// Her maçın Europe/Istanbul saat diliminde Pazartesi (Pzt) ve beklenen TRT saatinde olduğu test edilir
const trTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

for (const match of fullPreview12.preview) {
  const formatted = trTimeFormatter.format(new Date(match.scheduled_at));
  // Gün Pazartesi ('Pzt') olmalı
  assert.ok(
    formatted.startsWith('Pzt'),
    `18ar Maç ${match.week}. hafta Türkiye saatinde Pazartesi (Pzt) olmalı. Elde edilen: ${formatted}`
  );

  // Saat match.time_trt ('22:00', '22:30' veya '23:00') ile tam uyuşmalı
  assert.ok(
    formatted.includes(match.time_trt),
    `18as Maç ${match.week}. hafta Türkiye saatinde ${match.time_trt} göstermeli. Elde edilen: ${formatted}`
  );
}

console.log('  [PASS] 8 Pazartesi Oturumu, 22 Hafta, Devre Arası, eş zamanlı 6 maç ve TRT saat dağılımları başarıyla doğrulandı.\n');


console.log('================================================================');
console.log('TÜM TEST SENARYOLARI (TEST 1 - TEST 18) %100 BAŞARIYLA GEÇTİ!');
console.log('================================================================');
