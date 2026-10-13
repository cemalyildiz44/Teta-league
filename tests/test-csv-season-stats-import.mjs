import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  stripUtf8Bom,
  normalizeHeaderName,
  parseStrictNonNegativeInt,
  parseStrictRatingAvg,
  parseSeasonStatsCsv,
  evaluateSeasonStatsCsv,
  isEquivalentSeasonName,
  validateAndPrepareCsvImportBatch
} from '../lib/csv/season-stats-importer.ts';

console.log('================================================================');
console.log('TETA LEAGUE — TAKIM BAZLI SEZON İSTATİSTİKLERİ CSV İÇE AKTARMA');
console.log('UNIT & INTEGRITY TEST SUITE');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

const mockProfiles = [
  { id: '11111111-1111-4111-8111-111111111101', username: 'dorukzinboi', current_ea_player_id: 'dorukzinboi' },
  { id: '11111111-1111-4111-8111-111111111102', username: 'peaksu', current_ea_player_id: 'Peaksu_' },
  { id: '11111111-1111-4111-8111-111111111103', username: 'notfound5181', current_ea_player_id: 'Notfound5181' },
  { id: '11111111-1111-4111-8111-111111111104', username: 'yusuf73', current_ea_player_id: 'Yusuf_73DE' }, // Case difference vs yusuf_73DE
  { id: '11111111-1111-4111-8111-111111111105', username: 'kreasom_user', current_ea_player_id: 'Kreasom' },
  { id: '11111111-1111-4111-8111-111111111106', username: 'manual_target_player', current_ea_player_id: null }
];

const mockTeams = [
  { id: '22222222-2222-4222-8222-222222222201', name: 'Bolton VFC', is_active: true },
  { id: '22222222-2222-4222-8222-222222222202', name: 'Gegi Esport', is_active: true },
  { id: '22222222-2222-4222-8222-222222222203', name: 'Turk Legends', is_active: true },
  { id: '22222222-2222-4222-8222-222222222204', name: 'Falcon Athletic FC', is_active: true },
  { id: '22222222-2222-4222-8222-222222222205', name: 'Real Sosyete', is_active: true },
  { id: '22222222-2222-4222-8222-222222222206', name: 'Diamond FK', is_active: true }
];

// 1. UTF-8 BOM & Header Validation
runTest('1. UTF-8 BOM ve noktalı virgül (;) ayracı güvenli şekilde parse edilir, eksik/hatalı sütun reddedilir', () => {
  const validWithBom = '\uFEFFEA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating\ndorukzinboi;Bolton VFC;TETA League 5. Sezon;Bolton VFC;14;0;4;8.05';
  const parsed = parseSeasonStatsCsv(validWithBom);
  assert.equal(parsed.headerValid, true);
  assert.equal(parsed.detectedDelimiter, ';');
  assert.equal(parsed.rawRows.length, 1);
  assert.equal(parsed.rawRows[0].eaId, 'dorukzinboi');

  // Missing column must be rejected
  const missingCol = 'EA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist\ndorukzinboi;Bolton VFC;TETA League 5. Sezon;Bolton VFC;14;0;4';
  const badParsed1 = parseSeasonStatsCsv(missingCol);
  assert.equal(badParsed1.headerValid, false);
  assert.ok(badParsed1.headerError?.includes('8 sütun bekleniyordu'));

  // Swapped/wrong column name must not be silently mis-mapped
  const wrongColName = 'EA ID;Güncel Takım;Sezon;Takım Adı Yanlış;Maç;Gol;Asist;Ort. Rating\ndorukzinboi;Bolton VFC;TETA League 5. Sezon;Bolton VFC;14;0;4;8.05';
  const badParsed2 = parseSeasonStatsCsv(wrongColName);
  assert.equal(badParsed2.headerValid, false);
  assert.ok(badParsed2.headerError?.includes('4. sütun başlığı hatalı'));
});

// 2. dorukzinboi Multi-Team & Güncel Takım Ignored
runTest('2. dorukzinboi örneği: tek profil, iki ayrı takım kaydı (Bolton VFC ve Gegi Esport), Güncel Takım istatistik takımını ezmez, 8.05 rating 805 olmaz', () => {
  const csv = [
    '\uFEFFEA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating',
    'dorukzinboi;Bolton VFC;TETA League 5. Sezon;Bolton VFC;14;0;4;8.05',
    'dorukzinboi;Bolton VFC;TETA League 5. Sezon;Gegi Esport;3;1;1;8.37'
  ].join('\n');

  const result = evaluateSeasonStatsCsv({
    csvContent: csv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: []
  });

  assert.equal(result.headerValid, true);
  assert.equal(result.totalCsvRows, 2);
  assert.equal(result.includedSeasonRows, 2);
  assert.equal(result.uniqueEaIdsInScope, 1);
  assert.equal(result.matchedPlayersCount, 1);
  assert.equal(result.multiTeamPlayersCount, 1);
  assert.equal(result.teamBasedRecordCount, 2);
  assert.equal(result.readyToImportCount, 2);

  const [boltonRec, gegiRec] = result.readyPayloads;
  // Both point to the exact same single profile
  assert.equal(boltonRec.player_id, '11111111-1111-4111-8111-111111111101');
  assert.equal(gegiRec.player_id, '11111111-1111-4111-8111-111111111101');

  // Bolton VFC stats
  assert.equal(boltonRec.team_id, '22222222-2222-4222-8222-222222222201');
  assert.equal(boltonRec.team_name, 'Bolton VFC');
  assert.equal(boltonRec.matches_played, 14);
  assert.equal(boltonRec.goals, 0);
  assert.equal(boltonRec.assists, 4);
  assert.equal(boltonRec.rating_avg, 8.05);

  // Gegi Esport stats (uses Oynadığı Takım = Gegi Esport, NOT Güncel Takım = Bolton VFC!)
  assert.equal(gegiRec.team_id, '22222222-2222-4222-8222-222222222202');
  assert.equal(gegiRec.team_name, 'Gegi Esport');
  assert.equal(gegiRec.matches_played, 3);
  assert.equal(gegiRec.goals, 1);
  assert.equal(gegiRec.assists, 1);
  assert.equal(gegiRec.rating_avg, 8.37);
});

// 3. 3-Team Player (Notfound5181) & Comma Decimal Rating
runTest('3. Üç farklı takımda oynayan oyuncu (Notfound5181) üç ayrı kayıt oluşturur ve virgüllü rating (7,52) doğru işlenir', () => {
  const csv = [
    'EA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating',
    'Notfound5181;Falcon Athletic FC;TETA League 5. Sezon;Turk Legends;4;0;0;7,52',
    'Notfound5181;Falcon Athletic FC;TETA League 5. Sezon;Falcon Athletic FC;3;0;0;6.77',
    'Notfound5181;Falcon Athletic FC;TETA League 5. Sezon;Gegi Esport;3;0;0;6.63'
  ].join('\n');

  const result = evaluateSeasonStatsCsv({
    csvContent: csv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: []
  });

  assert.equal(result.uniqueEaIdsInScope, 1);
  assert.equal(result.readyToImportCount, 3);
  assert.equal(result.readyPayloads[0].team_name, 'Turk Legends');
  assert.equal(result.readyPayloads[0].rating_avg, 7.52);
  assert.equal(result.readyPayloads[1].team_name, 'Falcon Athletic FC');
  assert.equal(result.readyPayloads[1].rating_avg, 6.77);
  assert.equal(result.readyPayloads[2].team_name, 'Gegi Esport');
  assert.equal(result.readyPayloads[2].rating_avg, 6.63);
});

// 4. Season Filtering
runTest('4. Sezon filtresi: yalnızca "TETA League 5. Sezon" kapsam içi alınır; "-", boş ve diğer sezonlar nedenleriyle kapsam dışı bırakılır', () => {
  const csv = [
    'EA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating',
    'dorukzinboi;Bolton VFC;TETA League 5. Sezon;Bolton VFC;14;0;4;8.05',
    'ghost_player1;-;-;-;0;0;0;',
    'ghost_player2;-;;-;0;0;0;',
    'old_player;Bolton VFC;TETA League 4. Sezon;Bolton VFC;10;2;1;7.50'
  ].join('\n');

  const result = evaluateSeasonStatsCsv({
    csvContent: csv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: []
  });

  assert.equal(result.totalCsvRows, 4);
  assert.equal(result.includedSeasonRows, 1);
  assert.equal(result.excludedSeasonRows, 3);
  assert.equal(result.readyToImportCount, 1);
  assert.equal(result.excludedReasonsBreakdown["Sezon '-' olduğu için kapsam dışı"], 1);
  assert.equal(result.excludedReasonsBreakdown['Sezon alanı boş olduğu için kapsam dışı'], 1);
  assert.equal(result.excludedReasonsBreakdown['Farklı veya tanınmayan sezon ("TETA League 4. Sezon")'], 1);
});

// 5. Case Mismatch & Unmatched EA IDs & Manual Linking
runTest('5. EA ID büyük/küçük harf farkı otomatik tahmin edilmez (AMBIGUOUS), eşleşmeyen EA ID manuel olarak profile bağlanabilir', () => {
  const csv = [
    'EA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating',
    'yusuf_73DE;Gegi Esport;TETA League 5. Sezon;Real Sosyete;3;0;0;6.83',
    'unknown_ea_99;Bolton VFC;TETA League 5. Sezon;Bolton VFC;5;1;0;7.10',
    'unknown_ea_99;Bolton VFC;TETA League 5. Sezon;Gegi Esport;2;0;1;7.40'
  ].join('\n');

  // Without manual override: both yusuf_73DE (case diff vs Yusuf_73DE) and unknown_ea_99 are blocked
  const resBefore = evaluateSeasonStatsCsv({
    csvContent: csv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: []
  });

  assert.equal(resBefore.readyToImportCount, 0);
  assert.equal(resBefore.ambiguousPlayersCount, 1); // yusuf_73DE
  assert.equal(resBefore.unmatchedPlayersCount, 1); // unknown_ea_99

  // With admin manual confirmation/linking:
  const resAfter = evaluateSeasonStatsCsv({
    csvContent: csv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: [],
    manualPlayerOverrides: {
      yusuf_73DE: '11111111-1111-4111-8111-111111111104',
      unknown_ea_99: '11111111-1111-4111-8111-111111111106'
    }
  });

  assert.equal(resAfter.readyToImportCount, 3);
  assert.equal(resAfter.manuallyLinkedPlayersCount, 2);
});

// 6. Duplicate (player + season + team) within CSV & Existing DB Collisions
runTest('6. Aynı oyuncu + sezon + takım için CSV içi mükerrer satırlar ve veritabanı çakışmaları güvenli şekilde engellenir', () => {
  const csv = [
    'EA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating',
    'dorukzinboi;Bolton VFC;TETA League 5. Sezon;Bolton VFC;14;0;4;8.05',
    'dorukzinboi;Bolton VFC;TETA League 5. Sezon;Bolton VFC;14;0;4;8.05', // Duplicate in CSV
    'Peaksu_;Bolton VFC;TETA League 5. Sezon;Bolton VFC;16;2;1;7.44' // Already in DB
  ].join('\n');

  const result = evaluateSeasonStatsCsv({
    csvContent: csv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: [
      {
        id: '99999999-9999-4999-8999-999999999999',
        player_id: '11111111-1111-4111-8111-111111111102', // Peaksu_
        season_name: 'TETA SEASON 5', // Equivalent Season 5 name in DB
        league_name: 'TETA Süper Lig',
        team_id: '22222222-2222-4222-8222-222222222201', // Bolton VFC
        team_name: 'Bolton VFC',
        matches_played: 16,
        goals: 2,
        assists: 1,
        rating_avg: 7.44
      }
    ]
  });

  assert.equal(result.readyToImportCount, 1); // Only first dorukzinboi row
  assert.equal(result.duplicateCsvRowsCount, 1); // Second dorukzinboi row
  assert.equal(result.existingDbCollisionsCount, 1); // Peaksu_ row
  assert.equal(result.rows[1].status, 'DUPLICATE_IN_CSV');
  assert.equal(result.rows[1].duplicateOfLineNumber, 2);
  assert.equal(result.rows[2].status, 'EXISTING_IN_DB');
});

// 7. Missing or Invalid Stats (e.g. Kreasom empty rating)
runTest('7. Eksik, negatif veya aralık dışı istatistik değerleri (örn: Kreasom boş Ort. Rating) INVALID_STATS olarak işaretlenir', () => {
  const csv = [
    'EA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating',
    'Kreasom;-;TETA League 5. Sezon;Diamond FK;2;0;0;',
    'dorukzinboi;Bolton VFC;TETA League 5. Sezon;Bolton VFC;-1;0;4;8.05',
    'Peaksu_;Bolton VFC;TETA League 5. Sezon;Gegi Esport;3;0;0;11.50'
  ].join('\n');

  const result = evaluateSeasonStatsCsv({
    csvContent: csv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: []
  });

  assert.equal(result.invalidStatRowsCount, 3);
  assert.equal(result.readyToImportCount, 0);
  assert.ok(result.rows[0].statusReasons.some(r => r.includes('Ort. Rating')));
  assert.ok(result.rows[1].statusReasons.some(r => r.includes('negatif')));
  assert.ok(result.rows[2].statusReasons.some(r => r.includes('10.00')));
});

// 8. Real CSV File Verification (Read-Only)
runTest('8. Gerçek oyuncu_istatistikleri_takim_sezon.csv veri kaynağı doğrulaması (Salt-Okunur)', () => {
  const candidatePaths = [
    'C:/Users/hp/Desktop/Yeni klasör/oyuncu_istatistikleri_takim_sezon.csv',
    'C:/Users/hp/.gemini/antigravity/brain/3a2a7abd-1fc2-494a-884e-1710697acc1f/.user_uploaded/media_1791853552663_cdc6f1a1.csv'
  ];
  const existingPath = candidatePaths.find(p => fs.existsSync(p));
  if (!existingPath) {
    console.log('    (Gerçek CSV dosyası bu ortamda bulunamadı, adım atlandı)');
    return;
  }

  const rawCsv = fs.readFileSync(existingPath, 'utf8');
  const result = evaluateSeasonStatsCsv({
    csvContent: rawCsv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: []
  });

  assert.equal(result.headerValid, true);
  assert.equal(result.totalCsvRows, 1006);
  assert.equal(result.includedSeasonRows, 678);
  assert.equal(result.excludedSeasonRows, 328);
  assert.equal(result.uniqueEaIdsInScope, 616);
  assert.equal(result.multiTeamPlayersCount, 60);
  assert.equal(result.invalidStatRowsCount, 1); // Kreasom line 568

  // Verify dorukzinboi in real CSV
  const dorukRows = result.rows.filter(r => r.eaId === 'dorukzinboi');
  assert.equal(dorukRows.length, 2);
  assert.equal(dorukRows[0].playedTeam, 'Bolton VFC');
  assert.equal(dorukRows[0].matchesPlayed, 14);
  assert.equal(dorukRows[0].goals, 0);
  assert.equal(dorukRows[0].assists, 4);
  assert.equal(dorukRows[0].ratingAvg, 8.05);
  assert.equal(dorukRows[0].status, 'READY');

  assert.equal(dorukRows[1].playedTeam, 'Gegi Esport');
  assert.equal(dorukRows[1].matchesPlayed, 3);
  assert.equal(dorukRows[1].goals, 1);
  assert.equal(dorukRows[1].assists, 1);
  assert.equal(dorukRows[1].ratingAvg, 8.37);
  assert.equal(dorukRows[1].status, 'READY');
});

// 9. Server Action Security & Isolation Verification
runTest('9. Server Action güvenlik ve izolasyon kontrolü: checkAdmin zorunlu, manuel kayıt akışı korunmuş, üyelik/transfer/profil tablolarına yazma yok', () => {
  const actionsCode = fs.readFileSync('app/admin/players/actions.ts', 'utf8');

  // Existing manual functions preserved
  assert.ok(actionsCode.includes('export async function addPlayerLegacyCareerAction'));
  assert.ok(actionsCode.includes('export async function updatePlayerLegacyCareerAction'));
  assert.ok(actionsCode.includes('export async function deletePlayerLegacyCareerAction'));

  // New bulk CSV action exists and enforces checkAdmin
  const fnStart = actionsCode.indexOf('export async function importPlayerSeasonStatsCsvAction');
  assert.ok(fnStart !== -1, 'importPlayerSeasonStatsCsvAction must exist');
  const fnBody = actionsCode.slice(fnStart);

  assert.ok(fnBody.includes('checkAdmin(supabase, user)'), 'Must enforce checkAdmin');
  assert.ok(fnBody.includes("from('player_legacy_career_stats')"), 'Must target player_legacy_career_stats');
  assert.ok(!fnBody.includes("from('team_memberships')"), 'Must NOT touch team_memberships');
  assert.ok(!fnBody.includes("from('transfers')"), 'Must NOT touch transfers');
  assert.ok(!fnBody.includes("from('profiles').update"), 'Must NOT update profiles');
  assert.ok(!fnBody.includes("from('profiles').insert"), 'Must NOT insert profiles');
});

// 10. Distinct EA IDs linked to the same profile guard
runTest('10. İki farklı EA ID aynı oyuncu profiline bağlanmaya çalışıldığında AMBIGUOUS uyarısı verilir ve içe aktarma engellenir', () => {
  const csv = [
    'EA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating',
    'unmatched_alpha;Bolton VFC;TETA League 5. Sezon;Bolton VFC;5;1;0;7.20',
    'unmatched_beta;Gegi Esport;TETA League 5. Sezon;Gegi Esport;6;2;1;7.50'
  ].join('\n');

  const result = evaluateSeasonStatsCsv({
    csvContent: csv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: [],
    manualPlayerOverrides: {
      unmatched_alpha: '11111111-1111-4111-8111-111111111106',
      unmatched_beta: '11111111-1111-4111-8111-111111111106' // Same profile for different EA ID!
    }
  });

  assert.equal(result.readyToImportCount, 0);
  assert.equal(result.ambiguousPlayersCount, 2);
  assert.ok(result.rows[0].statusReasons[0].includes('birden fazla farklı EA ID'));
});

// 11. Unrecognized Team Resolution & League Name Resolution via targetSeasonId
runTest('11. Tanınmayan takım adı uyarısı, manuel tarihsel/sistem takımı çözümlemesi ve targetSeasonId ile lig adı eşleştirmesi çalışır', () => {
  const csv = [
    'EA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating',
    'dorukzinboi;Bolton VFC;TETA League 5. Sezon;Bolton VFC;14;0;4;8.05',
    'dorukzinboi;Bolton VFC;TETA League 5. Sezon;Eski Efsane SK;5;2;1;7.80'
  ].join('\n');

  const seasonId = '55555555-5555-4555-8555-555555555555';
  const leagueTeams = [
    {
      season_id: seasonId,
      league_id: '66666666-6666-4666-8666-666666666666',
      team_id: '22222222-2222-4222-8222-222222222201', // Bolton VFC
      league_name: 'TETA Pro Lig A'
    }
  ];

  // Before resolving "Eski Efsane SK": only Bolton VFC is ready
  const before = evaluateSeasonStatsCsv({
    csvContent: csv,
    targetSeasonId: seasonId,
    profiles: mockProfiles,
    teams: mockTeams,
    leagueTeams,
    existingLegacyStats: []
  });

  assert.equal(before.unrecognizedTeamsCount, 1);
  assert.equal(before.readyToImportCount, 1);
  assert.equal(before.readyPayloads[0].league_name, 'TETA Pro Lig A');
  assert.equal(before.rows[1].status, 'NEEDS_TEAM_MATCH');

  // After resolving "Eski Efsane SK" as CUSTOM historical team:
  const after = evaluateSeasonStatsCsv({
    csvContent: csv,
    targetSeasonId: seasonId,
    profiles: mockProfiles,
    teams: mockTeams,
    leagueTeams,
    existingLegacyStats: [],
    manualTeamOverrides: {
      'Eski Efsane SK': { mode: 'CUSTOM', customName: 'Eski Efsane SK' }
    }
  });

  assert.equal(after.unrecognizedTeamsCount, 0);
  assert.equal(after.readyToImportCount, 2);
  assert.equal(after.readyPayloads[1].team_id, null);
  assert.equal(after.readyPayloads[1].team_name, 'Eski Efsane SK');
});

// 12. Idempotency on Repeated Import
runTest('12. Tekrarlanan içe aktarma (idempotency): içe aktarılan kayıtlar tekrar yüklendiğinde mükerrer kayıt oluşturmaz, EXISTING_IN_DB olarak atlanır', () => {
  const csv = [
    'EA ID;Güncel Takım;Sezon;Oynadığı Takım;Maç;Gol;Asist;Ort. Rating',
    'dorukzinboi;Bolton VFC;TETA League 5. Sezon;Bolton VFC;14;0;4;8.05',
    'dorukzinboi;Bolton VFC;TETA League 5. Sezon;Gegi Esport;3;1;1;8.37'
  ].join('\n');

  const firstRun = evaluateSeasonStatsCsv({
    csvContent: csv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: []
  });
  assert.equal(firstRun.readyToImportCount, 2);

  // Simulate DB state after first import
  const simulatedDbAfterImport = firstRun.readyPayloads.map((p, idx) => ({
    id: `88888888-8888-4888-8888-88888888880${idx + 1}`,
    player_id: p.player_id,
    season_name: p.season_name,
    league_name: p.league_name,
    team_id: p.team_id,
    team_name: p.team_name,
    matches_played: p.matches_played,
    goals: p.goals,
    assists: p.assists,
    rating_avg: p.rating_avg
  }));

  const secondRun = evaluateSeasonStatsCsv({
    csvContent: csv,
    profiles: mockProfiles,
    teams: mockTeams,
    existingLegacyStats: simulatedDbAfterImport
  });

  assert.equal(secondRun.readyToImportCount, 0);
  assert.equal(secondRun.existingDbCollisionsCount, 2);
});

// 13. Server-side Strict All-or-Nothing Batch Validation: All valid rows prepared
runTest('13. Sunucu doğrulaması (validateAndPrepareCsvImportBatch): tüm satırlar geçerli olduğunda bütün kayıtlar yazılabilecek şekilde hazırlanır ve aynı oyuncunun farklı takım satırları ayrı kalır', () => {
  const batchRes = validateAndPrepareCsvImportBatch({
    seasonName: 'TETA League 5. Sezon',
    defaultLeagueName: 'TETA Süper Lig',
    validProfiles: mockProfiles,
    validTeams: mockTeams,
    existingStats: [],
    actorUserId: '99999999-9999-4999-8999-999999999900',
    records: [
      {
        lineNumber: 16,
        eaId: 'dorukzinboi',
        player_id: '11111111-1111-4111-8111-111111111101',
        team_id: '22222222-2222-4222-8222-222222222201',
        team_name: 'Client Spoofed Name Ignored',
        league_name: 'TETA Süper Lig',
        matches_played: 14,
        goals: 0,
        assists: 4,
        rating_avg: 8.05
      },
      {
        lineNumber: 17,
        eaId: 'dorukzinboi',
        player_id: '11111111-1111-4111-8111-111111111101',
        team_id: '22222222-2222-4222-8222-222222222202',
        team_name: 'Gegi Esport',
        league_name: 'TETA Süper Lig',
        matches_played: 3,
        goals: 1,
        assists: 1,
        rating_avg: 8.37
      }
    ]
  });

  assert.equal(batchRes.abortedDueToValidationError, false);
  assert.equal(batchRes.rowErrors.length, 0);
  assert.equal(batchRes.insertPayloads.length, 2);
  // Server forces canonical team_name from validTeams DB lookup
  assert.equal(batchRes.insertPayloads[0].team_name, 'Bolton VFC');
  assert.equal(batchRes.insertPayloads[1].team_name, 'Gegi Esport');
  assert.equal(batchRes.insertPayloads[0].rating_avg, 8.05);
  assert.equal(batchRes.insertPayloads[1].rating_avg, 8.37);
});

// 14. Server-side Strict All-or-Nothing Batch Validation: Single invalid row aborts entire batch
runTest('14. Katı atomik sunucu doğrulaması (strict all-or-nothing): tek bir satır bile sunucu doğrulamasından geçemezse hiçbir kayıt hazırlanmaz (insertPayloads = []) ve hatalı satır numarası/nedeni döner', () => {
  const batchRes = validateAndPrepareCsvImportBatch({
    seasonName: 'TETA League 5. Sezon',
    defaultLeagueName: 'TETA Süper Lig',
    validProfiles: mockProfiles,
    validTeams: mockTeams,
    existingStats: [],
    actorUserId: '99999999-9999-4999-8999-999999999900',
    records: [
      {
        lineNumber: 16,
        eaId: 'dorukzinboi',
        player_id: '11111111-1111-4111-8111-111111111101',
        team_id: '22222222-2222-4222-8222-222222222201',
        team_name: 'Bolton VFC',
        league_name: 'TETA Süper Lig',
        matches_played: 14,
        goals: 0,
        assists: 4,
        rating_avg: 8.05
      },
      {
        lineNumber: 568,
        eaId: 'Kreasom',
        player_id: '11111111-1111-4111-8111-111111111105',
        team_id: '22222222-2222-4222-8222-222222222206',
        team_name: 'Diamond FK',
        league_name: 'TETA Süper Lig',
        matches_played: 2,
        goals: 0,
        assists: 0,
        rating_avg: 15.0 // Out-of-range rating injected by client
      }
    ]
  });

  assert.equal(batchRes.abortedDueToValidationError, true, 'Batch must abort when any row fails validation');
  assert.equal(batchRes.insertPayloads.length, 0, 'Zero rows must be prepared for insert when any row fails');
  assert.equal(batchRes.rowErrors.length, 1);
  assert.equal(batchRes.rowErrors[0].lineNumber, 568);
  assert.equal(batchRes.rowErrors[0].eaId, 'Kreasom');
  assert.ok(batchRes.rowErrors[0].reason.includes('Ort. Rating'));
});

// 15. Server-side Existing DB Collision Protection: Never overwrites existing records
runTest('15. Sunucu doğrulaması mevcut kayıtların üzerine yazmaz; mevcut kayıtları skippedRows olarak ayırır ve yalnızca yeni kayıtları hazırlar', () => {
  const batchRes = validateAndPrepareCsvImportBatch({
    seasonName: 'TETA League 5. Sezon',
    defaultLeagueName: 'TETA Süper Lig',
    validProfiles: mockProfiles,
    validTeams: mockTeams,
    existingStats: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        player_id: '11111111-1111-4111-8111-111111111101',
        season_name: 'TETA SEASON 5',
        team_id: '22222222-2222-4222-8222-222222222201',
        team_name: 'Bolton VFC'
      }
    ],
    actorUserId: '99999999-9999-4999-8999-999999999900',
    records: [
      {
        lineNumber: 16,
        eaId: 'dorukzinboi',
        player_id: '11111111-1111-4111-8111-111111111101',
        team_id: '22222222-2222-4222-8222-222222222201',
        team_name: 'Bolton VFC',
        league_name: 'TETA Süper Lig',
        matches_played: 14,
        goals: 0,
        assists: 4,
        rating_avg: 8.05
      },
      {
        lineNumber: 17,
        eaId: 'dorukzinboi',
        player_id: '11111111-1111-4111-8111-111111111101',
        team_id: '22222222-2222-4222-8222-222222222202',
        team_name: 'Gegi Esport',
        league_name: 'TETA Süper Lig',
        matches_played: 3,
        goals: 1,
        assists: 1,
        rating_avg: 8.37
      }
    ]
  });

  assert.equal(batchRes.abortedDueToValidationError, false);
  assert.equal(batchRes.rowErrors.length, 0);
  assert.equal(batchRes.skippedRows.length, 1);
  assert.equal(batchRes.skippedRows[0].lineNumber, 16);
  assert.equal(batchRes.insertPayloads.length, 1);
  assert.equal(batchRes.insertPayloads[0].team_name, 'Gegi Esport');
});

console.log(`\n================================================================`);
console.log(`TOPLAM TEST: ${passed + failed} | BAŞARILI: ${passed} | BAŞARISIZ: ${failed}`);
console.log(`================================================================`);

if (failed > 0) {
  process.exit(1);
}
