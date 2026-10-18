import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDefenderPosition, isGoalkeeperPosition } from '../app/utils/positions.ts';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

console.log('================================================================');
console.log('TETA LEAGUE — TÜM SAYFALARDA İSTATİSTİK TUTARLILIĞI DOĞRULAMA');
console.log('UNIT, STATIC & INTEGRITY TEST SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Test Grubu A: Statik Kod Doğrulamaları
// -----------------------------------------------------------------------------
console.log('A. Statik Kod Analizi');

// 1. app/oyuncular/[username]/page.tsx
const playerDetailPagePath = path.resolve('app/oyuncular/[username]/page.tsx');
const playerDetailPageContent = fs.readFileSync(playerDetailPagePath, 'utf8');

const hasOldBlockGuard = /if\s*\(\s*profile\.current_ea_player_id\s*\)\s*\{\s*const\s*\{\s*data:\s*statsWithMatches\s*\}/.test(playerDetailPageContent);
assert.equal(hasOldBlockGuard, false, 'HATA: app/oyuncular/[username]/page.tsx içinde profile.current_ea_player_id koşullu sarmalayıcısı kaldırılmış olmalıdır.');

const hasPlayerIdFilter = /\.from\(\s*["']match_player_stats["']\s*\)[\s\S]*?\.eq\(\s*["']player_id["']\s*,\s*profile\.id\s*\)/.test(playerDetailPageContent);
assert.equal(hasPlayerIdFilter, true, 'HATA: app/oyuncular/[username]/page.tsx içinde match_player_stats sorgusu .eq("player_id", profile.id) ile filtrelenmelidir.');

const hasOldEaFilter = /\.eq\(\s*["']ea_player_id["']\s*,\s*profile\.current_ea_player_id\s*\)/.test(playerDetailPageContent);
assert.equal(hasOldEaFilter, false, 'HATA: app/oyuncular/[username]/page.tsx içinde ea_player_id ile yapılan eski filtre tamamen temizlenmiş olmalıdır.');

const hasApprovedFilter = /\.eq\(\s*["']matches\.status["']\s*,\s*["']APPROVED["']\s*\)/.test(playerDetailPageContent);
assert.equal(hasApprovedFilter, true, 'HATA: app/oyuncular/[username]/page.tsx içinde matches.status = APPROVED filtresi korunmalıdır.');
console.log('  [PASS] app/oyuncular/[username]/page.tsx: player_id geçişi ve korumalar doğrulandı.');

// 2. app/takim/[slug]/page.tsx
const teamDetailPagePath = path.resolve('app/takim/[slug]/page.tsx');
const teamDetailPageContent = fs.readFileSync(teamDetailPagePath, 'utf8');

const hasTeamRosterPlayerIdQuery = /\.from\(\s*['"]match_player_stats['"]\s*\)[\s\S]*?\.select\(\s*['"]player_id,\s*goals,\s*assists,\s*rating['"]\s*\)[\s\S]*?\.in\(\s*['"]player_id['"]\s*,\s*profileIds\s*\)/.test(teamDetailPageContent);
assert.equal(hasTeamRosterPlayerIdQuery, true, 'HATA: app/takim/[slug]/page.tsx içinde kadro istatistikleri sorgusu player_id üzerinden profileIds ile filtrelenmelidir.');

const hasTeamRosterMapping = teamDetailPageContent.includes('const myStats = pStats.filter((s: any) => s.player_id === r.id);');
assert.equal(hasTeamRosterMapping, true, 'HATA: app/takim/[slug]/page.tsx içinde kadro oyuncu eşleştirmesi s.player_id === r.id ile yapılmalıdır.');

const hasTeamBulkStatsPlayerIdQuery = /\.from\(\s*['"]match_player_stats['"]\s*\)[\s\S]*?\.select\(\s*['"]player_id,\s*team_id[\s\S]*?\.in\(\s*['"]player_id['"]\s*,\s*profileIds\s*\)/.test(teamDetailPageContent);
assert.equal(hasTeamBulkStatsPlayerIdQuery, true, 'HATA: app/takim/[slug]/page.tsx içinde toplu piyasa değeri sorgusu player_id üzerinden profileIds ile filtrelenmelidir.');

const hasTeamStatsByPlayerId = teamDetailPageContent.includes('statsByPlayerId') && teamDetailPageContent.includes('if (s.player_id)') && teamDetailPageContent.includes('statsByPlayerId.get(r.id)');
assert.equal(hasTeamStatsByPlayerId, true, 'HATA: app/takim/[slug]/page.tsx içinde piyasa değeri istatistikleri statsByPlayerId ile r.id üzerinden haritalanmalıdır.');
console.log('  [PASS] app/takim/[slug]/page.tsx: kadro ve piyasa değeri için player_id eşleştirmesi doğrulandı.');

// 3. app/oyuncular/page.tsx
const playersPagePath = path.resolve('app/oyuncular/page.tsx');
const playersPageContent = fs.readFileSync(playersPagePath, 'utf8');

const hasPlayersBulkStatsPlayerIdQuery = /\.from\(\s*['"]match_player_stats['"]\s*\)[\s\S]*?\.select\(\s*['"]player_id,\s*team_id[\s\S]*?\.in\(\s*['"]player_id['"]\s*,\s*profileIds\s*\)/.test(playersPageContent);
assert.equal(hasPlayersBulkStatsPlayerIdQuery, true, 'HATA: app/oyuncular/page.tsx içinde toplu istatistik sorgusu player_id üzerinden profileIds ile filtrelenmelidir.');

const hasPlayersStatsByPlayerId = playersPageContent.includes('statsByPlayerId') && playersPageContent.includes('if (s.player_id)') && playersPageContent.includes('statsByPlayerId.get(p.id)');
assert.equal(hasPlayersStatsByPlayerId, true, 'HATA: app/oyuncular/page.tsx içinde sıralama ve istatistikler statsByPlayerId ile p.id üzerinden eşleştirilmelidir.');
console.log('  [PASS] app/oyuncular/page.tsx: toplu sorgu ve sıralama için player_id eşleştirmesi doğrulandı.');

// 4. app/admin/matches/actions.ts
const adminActionsPath = path.resolve('app/admin/matches/actions.ts');
const adminActionsContent = fs.readFileSync(adminActionsPath, 'utf8');

const hasTeamRevalidate = adminActionsContent.includes('revalidatePath(`/takim/${tm.slug}`);');
assert.equal(hasTeamRevalidate, true, 'HATA: reviewMatchAction içinde ilgili takım sayfaları revalidatePath ile yenilenmelidir.');

const hasPlayerRevalidate = adminActionsContent.includes('revalidatePath(`/oyuncular/${encodeURIComponent(prof.username)}`);');
assert.equal(hasPlayerRevalidate, true, 'HATA: reviewMatchAction içinde maça katılan oyuncu profilleri revalidatePath ile yenilenmelidir.');

const hasExplicitFkSelect = adminActionsContent.includes(".select('profiles!match_player_stats_player_id_fkey(username)')");
assert.equal(hasExplicitFkSelect, true, 'HATA: reviewMatchAction içinde açık foreign key kısıt adı match_player_stats_player_id_fkey kullanılmalıdır.');

const hasPublicPlayersRevalidate = adminActionsContent.includes("revalidatePath('/oyuncular');");
assert.equal(hasPublicPlayersRevalidate, true, 'HATA: reviewMatchAction içinde genel oyuncular listesi revalidatePath ile yenilenmelidir.');
console.log('  [PASS] app/admin/matches/actions.ts: maç onayı sonrası takım ve oyuncu profili revalidatePath akışları ve açık FK seçimi doğrulandı.');

// 5. app/lig/[seasonSlug]/[leagueSlug]/istatistikler/page.tsx
const leagueStatsPagePath = path.resolve('app/lig/[seasonSlug]/[leagueSlug]/istatistikler/page.tsx');
const leagueStatsPageContent = fs.readFileSync(leagueStatsPagePath, 'utf8');

const hasPositionHelpersImport = leagueStatsPageContent.includes('isGoalkeeperPosition') && leagueStatsPageContent.includes('isDefenderPosition') && leagueStatsPageContent.includes('@/app/utils/positions');
assert.equal(hasPositionHelpersImport, true, 'HATA: Lig istatistikleri sayfası isGoalkeeperPosition ve isDefenderPosition yardımcılarını @/app/utils/positions modülünden içe aktarmalıdır.');

const usesGoalkeeperHelper = leagueStatsPageContent.includes('isGoalkeeperPosition(p.position)');
assert.equal(usesGoalkeeperHelper, true, 'HATA: Lig istatistikleri sayfası kaleci listesini isGoalkeeperPosition(p.position) ile filtrelemelidir.');

const usesDefenderHelper = leagueStatsPageContent.includes('isDefenderPosition(p.position)');
assert.equal(usesDefenderHelper, true, 'HATA: Lig istatistikleri sayfası defans listesini isDefenderPosition(p.position) ile filtrelemelidir.');
console.log('  [PASS] app/lig/[seasonSlug]/[leagueSlug]/istatistikler/page.tsx: kaleci ve defans yardımcı fonksiyon kullanımı doğrulandı.');

// 6. Kaleci ve Defans Pozisyon Sınıflandırma Birim Testleri
console.log('\nA2. Kaleci ve Defans Pozisyon Filtreleri Birim Testleri (app/utils/positions.ts)');

const validGoalkeeperPositions = [
  'goalkeeper',
  'Goalkeeper',
  'GOALKEEPER',
  '  goalkeeper  ',
  'GK',
  'gk',
  'KL',
  'kl',
  'Kaleci',
  'kaleci',
  'KALECİ',
  'KALECI',
  'KL (Kaleci)',
];

for (const pos of validGoalkeeperPositions) {
  assert.equal(isGoalkeeperPosition(pos), true, `HATA: "${pos}" kaleci olarak sınıflandırılmalıdır.`);
  assert.equal(isDefenderPosition(pos), false, `HATA: "${pos}" defans olarak sınıflandırılmamalıdır.`);
}
console.log(`  [PASS] Kaleci pozisyon değerleri (${validGoalkeeperPositions.length} varyasyon: EA normalizer + Türkçe adlar + kodlar) doğrulandı.`);

const validDefenderPositions = [
  'defender',
  'Defender',
  'DEFENDER',
  '  defender  ',
  'CB',
  'cb',
  'LB',
  'lb',
  'RB',
  'rb',
  'LWB',
  'lwb',
  'RWB',
  'rwb',
  'STP',
  'stp',
  'SĞB',
  'sğb',
  'SGB',
  'sgb',
  'SLB',
  'slb',
  'Stoper',
  'STOPER',
  'stoper',
  'Defans',
  'DEFANS',
  'defans',
  'DEF',
  'Sağ Bek',
  'SAĞ BEK',
  'Sag Bek',
  'Sol Bek',
  'SOL BEK',
  'STP (Stoper)',
  'SĞB (Sağ Bek)',
  'SLB (Sol Bek)',
];

for (const pos of validDefenderPositions) {
  assert.equal(isDefenderPosition(pos), true, `HATA: "${pos}" defans olarak sınıflandırılmalıdır.`);
  assert.equal(isGoalkeeperPosition(pos), false, `HATA: "${pos}" kaleci olarak sınıflandırılmamalıdır.`);
}
console.log(`  [PASS] Defans pozisyon değerleri (${validDefenderPositions.length} varyasyon: EA normalizer + Türkçe adlar + kodlar) doğrulandı.`);

const nonGkNonDefPositions = [
  'midfielder',
  'Midfielder',
  'MIDFIELDER',
  'forward',
  'Forward',
  'FORWARD',
  'Unknown',
  'any',
  'Bilinmiyor',
  'Belirtilmedi',
  'MDO',
  'CDM',
  'DM',
  'MO',
  'CM',
  'OOS',
  'CAM',
  'AM',
  'SĞO',
  'SGO',
  'RM',
  'SLO',
  'LM',
  'SĞK',
  'SGK',
  'RW',
  'SLK',
  'LW',
  'ST',
  'CF',
  'Santrfor',
  'Forvet',
  '',
  '   ',
  null,
  undefined,
];

for (const pos of nonGkNonDefPositions) {
  assert.equal(isGoalkeeperPosition(pos), false, `HATA: "${String(pos)}" kaleci olarak kabul edilmemelidir.`);
  assert.equal(isDefenderPosition(pos), false, `HATA: "${String(pos)}" defans olarak kabul edilmemelidir.`);
}
console.log(`  [PASS] Kaleci/defans dışı pozisyonların (${nonGkNonDefPositions.length} varyasyon: orta saha, forvet, boş/bilinmeyen) dışlandığı doğrulandı.`);


// -----------------------------------------------------------------------------
// Test Grubu B: Yerel PostgreSQL Motoru ile Kritik Senaryoların İzole Doğrulanması
// -----------------------------------------------------------------------------
console.log('\nB. Gerçek PostgreSQL Motoru ile İzole Entegrasyon Testi (127.0.0.1:44322)');

const client = new Client({
  host: '127.0.0.1',
  port: 44322,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
});

async function runDatabaseTests() {
  await client.connect();

  try {
    await client.query('BEGIN;');
    // SuperAdmin yetkisi
    await client.query("SELECT set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000000', true);");

    const IDS = {
      season: 'f0000001-0000-0000-0000-000000000001',
      league: 'f0000002-0000-0000-0000-000000000001',
      team1: 'f0000003-0000-0000-0000-000000000001',
      team2: 'f0000003-0000-0000-0000-000000000002',
      prof1: 'f0000004-0000-0000-0000-000000000001', // current_ea_player_id is NULL
      prof2: 'f0000004-0000-0000-0000-000000000002', // current_ea_player_id is 'canovic1905' (lowercase)
      prof3: 'f0000004-0000-0000-0000-000000000003', // Manual match player
      prof4: 'f0000004-0000-0000-0000-000000000004', // Guest candidate profile (current_ea_player_id = 'GuestPro99')
      match1: 'f0000006-0000-0000-0000-000000000001',
      match2: 'f0000006-0000-0000-0000-000000000002',
      match3: 'f0000006-0000-0000-0000-000000000003',
      match4: 'f0000006-0000-0000-0000-000000000004',
      fixture1: 'f0000005-0000-0000-0000-000000000001',
      fixture2: 'f0000005-0000-0000-0000-000000000002',
      fixture3: 'f0000005-0000-0000-0000-000000000003',
      fixture4: 'f0000005-0000-0000-0000-000000000004',
    };

    // 1. Sezon ve Lig
    await client.query(`
      INSERT INTO seasons (id, name, slug, status, win_points, draw_points, loss_points, roster_min, roster_max, tiebreaker_rules)
      VALUES ($1, 'Test Query Season', 'test-query-season', 'ACTIVE', 3, 1, 0, 5, 25, '[]'::jsonb);
    `, [IDS.season]);

    await client.query(`
      INSERT INTO leagues (id, season_id, name, level, status)
      VALUES ($1, $2, 'Test Query League', 1, 'ACTIVE');
    `, [IDS.league, IDS.season]);

    // 2. Takımlar
    await client.query(`
      INSERT INTO teams (id, name, slug, ea_club_id, is_active)
      VALUES
        ($1, 'Test Takim A', 'test-takim-a', 998801, true),
        ($2, 'Test Takim B', 'test-takim-b', 998802, true);
    `, [IDS.team1, IDS.team2]);

    await client.query(`
      INSERT INTO league_teams (league_id, season_id, team_id, is_active, joined_at)
      VALUES
        ($1, $2, $3, true, now()),
        ($1, $2, $4, true, now());
    `, [IDS.league, IDS.season, IDS.team1, IDS.team2]);

    // 3. Kullanıcılar ve Profiller
    await client.query(`
      INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
      VALUES
        ($1, 'authenticated', 'authenticated', 't_user1@test.local', '{"username": "t_user1"}'::jsonb),
        ($2, 'authenticated', 'authenticated', 't_user2@test.local', '{"username": "t_user2"}'::jsonb),
        ($3, 'authenticated', 'authenticated', 't_user3@test.local', '{"username": "t_user3"}'::jsonb),
        ($4, 'authenticated', 'authenticated', 't_user4@test.local', '{"username": "t_user4"}'::jsonb);
    `, [IDS.prof1, IDS.prof2, IDS.prof3, IDS.prof4]);

    // Profilleri senaryolara göre güncelle
    // Prof1: current_ea_player_id = NULL
    await client.query(`
      UPDATE profiles
      SET username = 'NoEaIdPlayer', current_ea_player_id = NULL
      WHERE id = $1;
    `, [IDS.prof1]);

    // Prof2: current_ea_player_id = 'canovic1905' (küçük harfli)
    await client.query(`
      UPDATE profiles
      SET username = 'canovic1905', current_ea_player_id = 'canovic1905'
      WHERE id = $1;
    `, [IDS.prof2]);

    // Prof3: current_ea_player_id = NULL (Manuel maç oyuncusu)
    await client.query(`
      UPDATE profiles
      SET username = 'ManuelPlayer', current_ea_player_id = NULL
      WHERE id = $1;
    `, [IDS.prof3]);

    // Prof4: Guest ile aynı EA ID'ye sahip olsa bile eşleştirilmemiş aday profil
    await client.query(`
      UPDATE profiles
      SET username = 'GuestUserCandidate', current_ea_player_id = 'GuestPro99'
      WHERE id = $1;
    `, [IDS.prof4]);

    // Team 1 için Kadro Üyelikleri (Prof 1, Prof 2, Prof 3)
    await client.query(`
      INSERT INTO team_memberships (player_id, team_id, league_id, season_id, joined_at)
      VALUES
        ($1, $4, $5, $6, now()),
        ($2, $4, $5, $6, now()),
        ($3, $4, $5, $6, now());
    `, [IDS.prof1, IDS.prof2, IDS.prof3, IDS.team1, IDS.league, IDS.season]);

    // 4. Fikstürler
    await client.query(`
      INSERT INTO fixtures (id, season_id, league_id, week_number, home_team_id, away_team_id, scheduled_at, status)
      VALUES
        ($1, $5, $6, 1, $7, $8, now(), 'COMPLETED'),
        ($2, $5, $6, 2, $7, $8, now(), 'COMPLETED'),
        ($3, $5, $6, 3, $7, $8, now(), 'COMPLETED'),
        ($4, $5, $6, 4, $7, $8, now(), 'COMPLETED');
    `, [IDS.fixture1, IDS.fixture2, IDS.fixture3, IDS.fixture4, IDS.season, IDS.league, IDS.team1, IDS.team2]);

    // 5. Onaylı Maçlar
    await client.query(`
      INSERT INTO matches (id, fixture_id, season_id, league_id, home_team_id, away_team_id, home_score, away_score, source, status, played_at)
      VALUES
        ($1, $5, $6, $7, $8, $9, 2, 0, 'AUTO', 'APPROVED', now() - interval '3 days'),
        ($2, $10, $6, $7, $8, $9, 3, 1, 'AUTO', 'APPROVED', now() - interval '2 days'),
        ($3, $11, $6, $7, $8, $9, 1, 0, 'MANUAL', 'APPROVED', now() - interval '1 days'),
        ($4, $12, $6, $7, $8, $9, 4, 2, 'AUTO', 'APPROVED', now());
    `, [
      IDS.match1, IDS.match2, IDS.match3, IDS.match4,
      IDS.fixture1, IDS.season, IDS.league, IDS.team1, IDS.team2,
      IDS.fixture2, IDS.fixture3, IDS.fixture4
    ]);

    // 6. Maç Oyuncu İstatistikleri (match_player_stats):
    // Match 1: Prof1 oynadı (player_id = Prof1, ea_player_id = 'EA_P1', 2 gol, 1 asist, rating 8.5)
    // Match 2: Prof2 oynadı (player_id = Prof2, ea_player_id = 'CANOVIC1905' [BÜYÜK HARFLİ], 3 gol, 0 asist, rating 9.2)
    // Match 3: Prof3 oynadı (player_id = Prof3, ea_player_id = NULL [MANUEL MAÇ], 1 gol, 1 asist, rating 7.8)
    // Match 4: Misafir oynadı (player_id = NULL, ea_player_id = 'GuestPro99', 4 gol, 0 asist, rating 9.9)
    await client.query(`
      INSERT INTO match_player_stats (match_id, team_id, player_id, ea_player_id, ea_player_name, position, goals, assists, rating)
      VALUES
        ($1, $5, $6, 'EA_P1', 'EA P1', 'ST', 2, 1, 8.5),
        ($2, $5, $7, 'CANOVIC1905', 'CANOVIC1905', 'ST', 3, 0, 9.2),
        ($3, $5, $8, NULL, 'Manuel Player', 'CM', 1, 1, 7.8),
        ($4, $5, NULL, 'GuestPro99', 'GuestPro99', 'CAM', 4, 0, 9.9);
    `, [IDS.match1, IDS.match2, IDS.match3, IDS.match4, IDS.team1, IDS.prof1, IDS.prof2, IDS.prof3]);

    // ---------------------------------------------------------------------------
    // Senaryo 1: ea_player_id boş olan oyuncu (current_ea_player_id IS NULL)
    // ---------------------------------------------------------------------------
    // Oyuncu detay sayfası sorgusu
    const s1PlayerPage = await client.query(`
      SELECT mps.id, mps.goals, mps.rating, m.status
      FROM match_player_stats mps
      JOIN matches m ON m.id = mps.match_id
      WHERE mps.player_id = $1 AND m.status = 'APPROVED';
    `, [IDS.prof1]);
    assert.equal(s1PlayerPage.rows.length, 1, 'Senaryo 1 (Oyuncu Sayfası): Prof1 maçı bulunmalıdır.');
    assert.equal(s1PlayerPage.rows[0].goals, 2, 'Senaryo 1 (Oyuncu Sayfası): Prof1 gol sayısı 2 olmalıdır.');

    // Takım sayfası kadro istatistikleri sorgusu
    const s1TeamRoster = await client.query(`
      SELECT mps.player_id, mps.goals, mps.assists, mps.rating
      FROM match_player_stats mps
      WHERE mps.match_id = ANY($1::uuid[]) AND mps.player_id = ANY($2::uuid[]);
    `, [[IDS.match1, IDS.match2, IDS.match3, IDS.match4], [IDS.prof1, IDS.prof2, IDS.prof3]]);
    const prof1TeamStats = s1TeamRoster.rows.filter(r => r.player_id === IDS.prof1);
    assert.equal(prof1TeamStats.length, 1, 'Senaryo 1 (Takım Sayfası Kadro): Prof1 takım kadrosunda 1 maçla görünmelidir.');
    assert.equal(prof1TeamStats[0].goals, 2, 'Senaryo 1 (Takım Sayfası Kadro): Prof1 golü 2 olmalıdır.');

    // Oyuncular sayfası toplu istatistik sorgusu
    const s1PlayersList = await client.query(`
      SELECT mps.player_id, mps.goals, mps.assists, mps.rating
      FROM match_player_stats mps
      JOIN matches m ON m.id = mps.match_id
      WHERE mps.player_id = ANY($1::uuid[]) AND m.status = 'APPROVED';
    `, [[IDS.prof1, IDS.prof2, IDS.prof3, IDS.prof4]]);
    const prof1ListStats = s1PlayersList.rows.filter(r => r.player_id === IDS.prof1);
    assert.equal(prof1ListStats.length, 1, 'Senaryo 1 (Oyuncular Listesi): Prof1 listede 1 onaylı maç istatistiğiyle yer almalıdır.');
    console.log('  [PASS] Senaryo 1: current_ea_player_id NULL olan oyuncunun istatistikleri tüm sayfalarda (oyuncu, takım kadrosu, oyuncular listesi) eksiksiz geldi.');

    // ---------------------------------------------------------------------------
    // Senaryo 2: Büyük/küçük harf farkı olan oyuncu (canovic1905 vs CANOVIC1905)
    // ---------------------------------------------------------------------------
    const s2PlayerPage = await client.query(`
      SELECT mps.id, mps.goals, mps.rating, mps.ea_player_id, m.status
      FROM match_player_stats mps
      JOIN matches m ON m.id = mps.match_id
      WHERE mps.player_id = $1 AND m.status = 'APPROVED';
    `, [IDS.prof2]);
    assert.equal(s2PlayerPage.rows.length, 1, 'Senaryo 2: Prof2 maçı bulunmalıdır.');
    assert.equal(s2PlayerPage.rows[0].goals, 3, 'Senaryo 2: Prof2 gol sayısı 3 olmalıdır.');

    const prof2TeamStats = s1TeamRoster.rows.filter(r => r.player_id === IDS.prof2);
    assert.equal(prof2TeamStats.length, 1, 'Senaryo 2 (Takım): Prof2 takım sayfasında harf farkına takılmadan yer almalıdır.');
    assert.equal(prof2TeamStats[0].goals, 3, 'Senaryo 2 (Takım): Prof2 3 golüyle hesaplanmalıdır.');
    console.log('  [PASS] Senaryo 2: EA ID harf büyüklüğü farkı (canovic1905 vs CANOVIC1905) tüm sayfalarda player_id sayesinde tamamen aşıldı.');

    // ---------------------------------------------------------------------------
    // Senaryo 3: Manuel maç (ea_player_id = NULL)
    // ---------------------------------------------------------------------------
    const s3PlayerPage = await client.query(`
      SELECT mps.id, mps.goals, mps.ea_player_id, m.source
      FROM match_player_stats mps
      JOIN matches m ON m.id = mps.match_id
      WHERE mps.player_id = $1 AND m.status = 'APPROVED';
    `, [IDS.prof3]);
    assert.equal(s3PlayerPage.rows.length, 1, 'Senaryo 3: Manuel maç bulunmalıdır.');
    assert.equal(s3PlayerPage.rows[0].goals, 1, 'Senaryo 3: Manuel maç golü 1 olmalıdır.');
    assert.equal(s3PlayerPage.rows[0].ea_player_id, null, 'Senaryo 3: ea_player_id NULL olmalıdır.');

    const prof3TeamStats = s1TeamRoster.rows.filter(r => r.player_id === IDS.prof3);
    assert.equal(prof3TeamStats.length, 1, 'Senaryo 3 (Takım): Manuel maç takım sayfasında yer almalıdır.');
    assert.equal(prof3TeamStats[0].goals, 1, 'Senaryo 3 (Takım): Manuel maç golü takıma yansımalıdır.');
    console.log('  [PASS] Senaryo 3: ea_player_id NULL olan manuel maçlar oyuncu ve takım sayfalarında başarıyla görüntülendi.');

    // ---------------------------------------------------------------------------
    // Senaryo 4: Eşleşmemiş oyuncunun (player_id IS NULL) istatistiklerinin sızmaması
    // Prof4 aday profildir ('GuestPro99' EA ID'sine sahip). Ancak match_player_stats.player_id NULL!
    // ---------------------------------------------------------------------------
    const s4PlayerPage = await client.query(`
      SELECT mps.id, mps.goals
      FROM match_player_stats mps
      JOIN matches m ON m.id = mps.match_id
      WHERE mps.player_id = $1 AND m.status = 'APPROVED';
    `, [IDS.prof4]);
    assert.equal(s4PlayerPage.rows.length, 0, 'Senaryo 4: player_id NULL olan satır asla adayın profiline bağlanmamalıdır.');

    const prof4ListStats = s1PlayersList.rows.filter(r => r.player_id === IDS.prof4);
    assert.equal(prof4ListStats.length, 0, 'Senaryo 4 (Oyuncular Listesi): Eşleşmemiş satır listeye sızmamalıdır.');
    console.log('  [PASS] Senaryo 4: player_id IS NULL olan misafir istatistiklerinin hiçbir profile veya takım kadrosuna sızmadığı doğrulandı.');

    // ---------------------------------------------------------------------------
    // Senaryo 5: Tek maçın iki kez sayılmaması (Deduplication & Unique Index)
    // ---------------------------------------------------------------------------
    let duplicateRejected = false;
    await client.query('SAVEPOINT duplicate_test;');
    try {
      await client.query(`
        INSERT INTO match_player_stats (match_id, team_id, player_id, ea_player_id, goals)
        VALUES ($1, $2, $3, 'EA_P1_DUP', 5);
      `, [IDS.match1, IDS.team1, IDS.prof1]);
    } catch (err) {
      if (err.message.includes('uq_match_player')) {
        duplicateRejected = true;
      }
      await client.query('ROLLBACK TO SAVEPOINT duplicate_test;');
    }
    assert.equal(duplicateRejected, true, 'Senaryo 5: Aynı (match_id, player_id) ikinci kez eklenemez, uq_match_player ihlal edilmelidir.');
    console.log('  [PASS] Senaryo 5: uq_match_player benzersizlik kısıtı sayesinde tek bir maçta oyuncu için mükerrer istatistik eklenemediği doğrulandı.');

    // ---------------------------------------------------------------------------
    // Senaryo 6: Maç onayı sonrası takım ve oyuncu profili revalidatePath hedefleri
    // ---------------------------------------------------------------------------
    // reviewMatchAction içinde home_team_id ve away_team_id üzerinden takım slug'larının sorgulanması
    const matchTeamsRes = await client.query(`
      SELECT slug FROM teams WHERE id = ANY($1::uuid[]);
    `, [[IDS.team1, IDS.team2]]);
    const teamSlugs = matchTeamsRes.rows.map(r => r.slug);
    assert.equal(teamSlugs.includes('test-takim-a'), true, 'Senaryo 6: Ev sahibi takım slug revalidatePath için alınabilmelidir.');
    assert.equal(teamSlugs.includes('test-takim-b'), true, 'Senaryo 6: Deplasman takım slug revalidatePath için alınabilmelidir.');

    // reviewMatchAction içinde maçta oynayan ve player_id'si olan oyuncuların username'lerinin sorgulanması
    const matchPlayersRes = await client.query(`
      SELECT p.username
      FROM match_player_stats mps
      JOIN profiles p ON p.id = mps.player_id
      WHERE mps.match_id = $1 AND mps.player_id IS NOT NULL;
    `, [IDS.match1]);
    const usernames = matchPlayersRes.rows.map(r => r.username);
    assert.equal(usernames.includes('NoEaIdPlayer'), true, 'Senaryo 6: Maçta oynayan eşleşmiş oyuncunun username revalidatePath için alınabilmelidir.');

    // Match 4'te sadece misafir vardı (player_id IS NULL), hiçbir profil dönmemelidir
    const match4PlayersRes = await client.query(`
      SELECT p.username
      FROM match_player_stats mps
      JOIN profiles p ON p.id = mps.player_id
      WHERE mps.match_id = $1 AND mps.player_id IS NOT NULL;
    `, [IDS.match4]);
    assert.equal(match4PlayersRes.rows.length, 0, 'Senaryo 6: Eşleşmemiş maçta revalidatePath için hayalet profil üretilmemelidir.');
    console.log('  [PASS] Senaryo 6: Maç onayı sonrasında doğru takım slugları ve oyuncu kullanıcı adlarının revalidatePath için tespit edildiği doğrulandı.');

    // ---------------------------------------------------------------------------
    // Senaryo 7: Lig İstatistikleri Kaleci ve Defans Pozisyon Filtresi (EA + Legacy)
    // ---------------------------------------------------------------------------
    await client.query(`
      INSERT INTO match_player_stats (match_id, team_id, player_id, ea_player_id, ea_player_name, position, goals, assists, rating, cleansheets_gk)
      VALUES
        ($1, $4, $5, 'EA_GK_1', 'EA Kaleci', 'goalkeeper', 0, 0, 8.4, 1),
        ($2, $4, $6, 'EA_DEF_1', 'EA Defans', 'defender', 0, 1, 8.7, 0),
        ($3, $4, $5, 'EA_MID_1', 'EA OrtaSaha', 'midfielder', 1, 1, 7.9, 0),
        ($3, $4, $6, 'EA_FWD_1', 'EA Forvet', 'forward', 2, 0, 8.5, 0);
    `, [IDS.match2, IDS.match3, IDS.match4, IDS.team2, IDS.prof1, IDS.prof2]);

    const s7StatsRes = await client.query(`
      SELECT mps.player_id, mps.position, mps.rating, mps.cleansheets_gk, p.username
      FROM match_player_stats mps
      JOIN matches m ON m.id = mps.match_id
      LEFT JOIN profiles p ON p.id = mps.player_id
      WHERE m.league_id = $1 AND m.status = 'APPROVED' AND mps.player_id IS NOT NULL;
    `, [IDS.league]);

    const gkRows = s7StatsRes.rows.filter(r => isGoalkeeperPosition(r.position));
    const defRows = s7StatsRes.rows.filter(r => isDefenderPosition(r.position));

    assert.equal(s7StatsRes.rows.length, 7, 'Senaryo 7: Toplam 7 onaylı eşleşmiş oyuncu satırı (ST, ST, CM, goalkeeper, defender, midfielder, forward) bulunmalıdır.');
    assert.equal(gkRows.length, 1, 'Senaryo 7: Yalnızca EA "goalkeeper" pozisyonlu kayıt kaleci listesine girmelidir; orta saha ve forvetler girmemelidir.');
    assert.equal(gkRows[0].player_id, IDS.prof1, 'Senaryo 7: Kaleci kaydı doğru oyuncuya ait olmalıdır.');
    assert.equal(gkRows[0].position, 'goalkeeper', 'Senaryo 7: Kaleci pozisyon değeri goalkeeper olmalıdır.');
    assert.equal(defRows.length, 1, 'Senaryo 7: Yalnızca EA "defender" pozisyonlu kayıt defans listesine girmelidir; orta saha ve forvetler girmemelidir.');
    assert.equal(defRows[0].player_id, IDS.prof2, 'Senaryo 7: Defans kaydı doğru oyuncuya ait olmalıdır.');
    assert.equal(defRows[0].position, 'defender', 'Senaryo 7: Defans pozisyon değeri defender olmalıdır.');
    console.log('  [PASS] Senaryo 7: Onaylı maçlardaki EA "goalkeeper"/"defender" kayıtlarının dahil edildiği, "midfielder"/"forward"/"CM"/"ST" kayıtlarının dışlandığı doğrulandı.');

  } finally {
    // İzole temizlik
    await client.query('ROLLBACK;');
    await client.end();
  }
}

await runDatabaseTests();

console.log('\n================================================================');
console.log('TÜM TESTLER BAŞARIYLA TAMAMLANDI! (7/7 Senaryo PASS)');
console.log('================================================================');
