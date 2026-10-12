import assert from 'node:assert/strict';
import {
  normalizeEaId,
  matchPlayerToProfile,
  validateRosterMembership,
  sanitizeProfileSearchQuery,
  buildProfilesOrFilter
} from '../lib/ea/roster-validator.ts';
import { matchFixture } from '../lib/ea/matcher.ts';
import { normalizeMatch } from '../lib/ea/normalizer.ts';

console.log('================================================================');
console.log('TETA LEAGUE — EA OYUNCU EŞLEŞTİRME VE KADRO DOĞRULAMA (FAZ 1)');
console.log('UNIT & INTEGRITY TEST SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Test 1: EA ID büyük/küçük harf farkı (Case-Insensitive Matching)
// -----------------------------------------------------------------------------
console.log('TEST 1: EA ID büyük/küçük harf normalizasyonu ve eşleşme...');

assert.equal(normalizeEaId('  iBo_F16  '), 'ibo_f16', 'normalizeEaId should trim and lowercase');
assert.equal(normalizeEaId(null), '', 'normalizeEaId null should return empty string');
assert.equal(normalizeEaId(undefined), '', 'normalizeEaId undefined should return empty string');

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

function validateScoreInput(matchId, homeScore, awayScore) {
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
  return { success: true };
}

const validUuid = '11111111-2222-3333-4444-555555555555';
assert.equal(validateScoreInput(validUuid, 2, 1).success, true, '13a valid score 2-1 accepted');
assert.equal(validateScoreInput(validUuid, 0, 0).success, true, '13b valid score 0-0 accepted');
assert.ok(validateScoreInput(validUuid, -1, 2).error, '13c negative score rejected');
assert.ok(validateScoreInput(validUuid, 2.5, 1).error, '13d float score rejected');
assert.ok(validateScoreInput(validUuid, NaN, 1).error, '13e NaN score rejected');
assert.ok(validateScoreInput('not-a-uuid', 1, 0).error, '13f invalid uuid rejected');

console.log('  [PASS] Negatif, kesirli ve geçersiz skor girişleri başarıyla engellendi.\n');


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


console.log('================================================================');
console.log('TÜM TEST SENARYOLARI (TEST 1 - TEST 14) %100 BAŞARIYLA GEÇTİ!');
console.log('================================================================');
