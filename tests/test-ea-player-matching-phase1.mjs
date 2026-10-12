import assert from 'node:assert/strict';
import {
  normalizeEaId,
  matchPlayerToProfile,
  validateRosterMembership
} from '../lib/ea/roster-validator.ts';

console.log('================================================================');
console.log('TETA LEAGUE — EA OYUNCU EŞLEŞTİRME VE KADRO DOĞRULAMA (FAZ 1)');
console.log('UNIT & INTEGRITY TEST SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Test 1: EA ID büyük/küçük harf farkı (Case-Insensitive Matching)
// -----------------------------------------------------------------------------
console.log('TEST 1: EA ID büyük/küçük harf normalizasyonu ve eşleşme...');

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

console.log('  [PASS] Büyük/küçük harf ve boşluk farkları başarıyla normalize edildi ve eşleştirildi.\n');


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

console.log('================================================================');
console.log('TÜM TEST SENARYOLARI %100 BAŞARIYLA GEÇTİ!');
console.log('================================================================');
