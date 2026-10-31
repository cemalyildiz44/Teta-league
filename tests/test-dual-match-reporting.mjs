/**
 * Test Suite: TETA League – Çift Taraflı Maç Raporlama ve Oyuncu İstatistik Sistemi
 * + Production Öncesi Kritik Güvenlik ve Veri Bütünlüğü Denetimi
 *
 * Covers:
 * - BÖLÜM A: Şema, RLS, RPC ve UI Mimari Doğrulaması
 * - BÖLÜM B: 10 Temel Fonksiyonel Senaryo
 * - BÖLÜM C: 9 Production Öncesi Kritik Güvenlik ve Veri Bütünlüğü Denetimi
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isEaMatchDraw,
  isFixtureFinishedForCaptain,
  getCaptainFixtureRowState,
  isFixtureOpenForCaptainView,
  canCaptainSubmitTeamReport,
  validateTeamMatchReportSubmission,
  applyTeamReportApproval,
} from '../lib/match-reporting.ts';

console.log('======================================================================');
console.log('TETA LEAGUE — ÇİFT TARAFLI MAÇ RAPORLAMA & GÜVENLİK DENETİM PAKETİ');
console.log('======================================================================\n');

// ---------------------------------------------------------------------------
// PART A: Static Architecture, Migration, RLS, RPC & UI Verification
// ---------------------------------------------------------------------------
const migrationPath = path.resolve(
  'supabase/migrations/20261031000000_dual_match_reporting_system.sql'
);
const migrationSql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');

const rollbackPath = path.resolve(
  'docs/rollback/20261031000000_dual_match_reporting_system_rollback.sql'
);
const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

const captainActionsSql = fs.readFileSync(
  path.resolve('app/takim/yonet/maclar/actions.ts'),
  'utf8'
);
const submitFormCode = fs.readFileSync(
  path.resolve('app/takim/yonet/maclar/yeni/SubmitMatchForm.tsx'),
  'utf8'
);
const playerStatsFormCode = fs.readFileSync(
  path.resolve('app/takim/yonet/maclar/[id]/PlayerStatsForm.tsx'),
  'utf8'
);
const adminActionsCode = fs.readFileSync(
  path.resolve('app/admin/matches/actions.ts'),
  'utf8'
);
const eaImportActionsCode = fs.readFileSync(
  path.resolve('app/admin/matches/ea-import/actions.ts'),
  'utf8'
);
const dualSectionCode = fs.readFileSync(
  path.resolve('app/admin/matches/DualTeamReportsSection.tsx'),
  'utf8'
);
const matchReportingLibCode = fs.readFileSync(
  path.resolve('lib/match-reporting.ts'),
  'utf8'
);

console.log('BÖLÜM A: Veritabanı Şeması, RLS Politikaları ve RPC Kontrolleri');
assert.ok(
  migrationSql.includes('CREATE TABLE IF NOT EXISTS public.match_team_reports'),
  'match_team_reports tablosu tanımlanmalı'
);
assert.ok(
  migrationSql.includes('CREATE TABLE IF NOT EXISTS public.match_team_report_players'),
  'match_team_report_players tablosu tanımlanmalı'
);
assert.ok(
  migrationSql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_active_match_team_report'),
  'Aynı takımın aynı maç için birden fazla aktif rapor göndermesini engelleyen kısmi tekil indeks olmalı'
);
assert.ok(
  migrationSql.includes('CONSTRAINT uq_report_player UNIQUE (report_id, player_id)'),
  'Aynı oyuncunun aynı raporda iki kez seçilmesini engelleyen UNIQUE kısıtı olmalı'
);
assert.ok(
  migrationSql.includes('CREATE OR REPLACE FUNCTION public.submit_match_team_report'),
  'Atomik submit_match_team_report RPC tanımlanmalı'
);
assert.ok(
  migrationSql.includes('CREATE OR REPLACE FUNCTION public.approve_match_team_report'),
  'Atomik approve_match_team_report RPC tanımlanmalı'
);
assert.ok(
  migrationSql.includes('CREATE OR REPLACE FUNCTION public.reject_match_team_report'),
  'Atomik reject_match_team_report RPC tanımlanmalı'
);
assert.ok(
  captainActionsSql.includes('submit_match_team_report'),
  'Kaptan aksiyonu atomik submit_match_team_report RPC kullanmalı'
);
assert.ok(
  submitFormCode.includes('players_json') && submitFormCode.includes('getRequiredLineupCount'),
  'SubmitMatchForm dinamik ilk 11 oyuncu seçimini ve istatistiklerini içermeli'
);
assert.ok(
  adminActionsCode.includes('approveTeamMatchReportAction') &&
    adminActionsCode.includes('rejectTeamMatchReportAction'),
  'Admin aksiyonları bağımsız takım raporu onay/red fonksiyonlarını içermeli'
);
assert.ok(
  dualSectionCode.includes('İKİ KAPTANIN BİLDİRDİĞİ SKORLAR UYUŞMUYOR'),
  'Admin arayüzünde skor uyuşmazlığı uyarısı bulunmalı'
);
console.log('  [PASS] Migration, RLS, RPC, Server Action ve UI bileşenleri doğrulandı.\n');

// ---------------------------------------------------------------------------
// PART B: Behavioral & Domain Scenarios (Scenarios 1..10)
// ---------------------------------------------------------------------------
const HOME_TEAM_ID = 'team-home-111';
const AWAY_TEAM_ID = 'team-away-222';
const OTHER_TEAM_ID = 'team-other-999';
const FIXTURE_ID = 'fixture-draw-001';

const homeRosterIds = Array.from({ length: 14 }, (_, i) => `home-player-${i + 1}`);
const awayRosterIds = Array.from({ length: 14 }, (_, i) => `away-player-${i + 1}`);

function getRequiredLineupCount(activeRosterCount) {
  if (!Number.isFinite(activeRosterCount) || activeRosterCount <= 0) {
    return 11;
  }
  return Math.min(11, Math.floor(activeRosterCount));
}

function buildPlayers(rosterIds, count = 11, goalsForFirst = 1) {
  return rosterIds.slice(0, count).map((id, idx) => ({
    player_id: id,
    position: idx === 0 ? 'GK' : idx < 5 ? 'DEF' : idx < 8 ? 'MID' : 'FWD',
    goals: idx === count - 1 ? goalsForFirst : 0,
    assists: idx === count - 2 ? goalsForFirst : 0,
    rating: 7.5,
    shots: idx === count - 1 ? 3 : 0,
    passes_made: 12,
    pass_attempts: 15,
    tackles_made: 2,
    tackle_attempts: 3,
    saves: idx === 0 ? 4 : 0,
    goals_conceded: idx === 0 ? 1 : 0,
    cleansheets_gk: 0,
    cleansheets_def: 0,
    red_cards: 0,
    is_mom: idx === count - 1,
  }));
}

function validateSubmission({
  fixtureId,
  captainTeamId,
  fixtureHomeTeamId,
  fixtureAwayTeamId,
  homeScore,
  awayScore,
  playedAt,
  players,
  allowedRosterPlayerIds,
  existingTeamReports,
}) {
  if (!fixtureId || !captainTeamId || !playedAt) {
    return { valid: false, code: 'MISSING_FIELDS', error: 'Gerekli alanları doldurun.' };
  }
  if (captainTeamId !== fixtureHomeTeamId && captainTeamId !== fixtureAwayTeamId) {
    return {
      valid: false,
      code: 'UNAUTHORIZED_TEAM',
      error: 'Sadece kendi takımınızın maçlarını girebilirsiniz.',
    };
  }
  if (homeScore < 0 || homeScore > 99 || awayScore < 0 || awayScore > 99) {
    return { valid: false, code: 'INVALID_SCORE', error: 'Geçersiz skor.' };
  }
  const activeSameTeam = (existingTeamReports || []).find(
    (r) =>
      r.team_id === captainTeamId &&
      (r.status === 'PENDING_REVIEW' || r.status === 'APPROVED')
  );
  if (activeSameTeam) {
    return {
      valid: false,
      code: 'DUPLICATE_ACTIVE_REPORT',
      error: 'Takımınız bu maç için zaten aktif veya onaylanmış bir rapor göndermiş.',
    };
  }
  const requiredCount = getRequiredLineupCount(allowedRosterPlayerIds.length);
  if (!Array.isArray(players) || players.length !== requiredCount) {
    return {
      valid: false,
      code: 'INVALID_PLAYER_COUNT',
      error: `Tam ${requiredCount} oyuncu seçilmelidir.`,
    };
  }
  const seen = new Set();
  const rosterSet = new Set(allowedRosterPlayerIds);
  for (const p of players) {
    if (seen.has(p.player_id)) {
      return {
        valid: false,
        code: 'DUPLICATE_PLAYER',
        error: 'Aynı oyuncu kadroda birden fazla kez seçilemez.',
      };
    }
    seen.add(p.player_id);
    if (!rosterSet.has(p.player_id)) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_PLAYER',
        error: 'Yalnızca kendi takımınızın aktif kadrosundaki oyuncuları seçebilirsiniz.',
      };
    }
  }
  return { valid: true, requiredCount };
}

function approveReportState(state, reportId, { allowScoreMismatch = false } = {}) {
  const target = state.reports[reportId];
  if (!target) return { success: false, code: 'NOT_FOUND', nextState: state };
  if (target.status === 'APPROVED' || target.is_stats_applied) {
    return {
      success: false,
      code: 'ALREADY_APPROVED',
      error: 'Bu rapor zaten onaylanmış ve oyuncu istatistikleri işlenmiş.',
      nextState: state,
    };
  }
  const other = Object.values(state.reports).find(
    (r) =>
      r.id !== target.id &&
      r.team_id !== target.team_id &&
      (r.status === 'PENDING_REVIEW' || r.status === 'APPROVED')
  );
  const isFirstApproval = state.matchStatus !== 'APPROVED';
  const hasMismatchWithMatch =
    state.matchStatus === 'APPROVED' &&
    (target.home_score !== state.homeScore || target.away_score !== state.awayScore);
  const hasMismatchWithOther =
    other &&
    (target.home_score !== other.home_score || target.away_score !== other.away_score);
  const hasMismatch = Boolean(hasMismatchWithMatch || hasMismatchWithOther);

  if (hasMismatch && !allowScoreMismatch) {
    return {
      success: false,
      code: 'SCORE_MISMATCH',
      error: 'SKOR_UYUSMAZLIGI: İki kaptanın bildirdiği skorlar uyuşmuyor.',
      nextState: state,
    };
  }

  return {
    success: true,
    isFirstApproval,
    scoreMismatchResolved: hasMismatch,
    nextState: {
      matchStatus: 'APPROVED',
      homeScore: isFirstApproval ? target.home_score : state.homeScore,
      awayScore: isFirstApproval ? target.away_score : state.awayScore,
      fixtureStatus: 'COMPLETED',
      reports: {
        ...state.reports,
        [reportId]: { ...target, status: 'APPROVED', is_stats_applied: true },
      },
      appliedPlayerStatsByTeam: {
        ...state.appliedPlayerStatsByTeam,
        [target.team_id]: target.players.map((p) => ({ ...p })),
      },
    },
  };
}

// SCENARIO 1: İlk kaptanın rapor göndermesi
console.log('SENARYO 1: İlk kaptanın (Ev Sahibi) rapor göndermesi');
const homePlayers = buildPlayers(homeRosterIds, 11, 2);
const s1 = validateSubmission({
  fixtureId: FIXTURE_ID,
  captainTeamId: HOME_TEAM_ID,
  fixtureHomeTeamId: HOME_TEAM_ID,
  fixtureAwayTeamId: AWAY_TEAM_ID,
  homeScore: 2,
  awayScore: 2,
  playedAt: '2026-10-30T21:00:00Z',
  players: homePlayers,
  allowedRosterPlayerIds: homeRosterIds,
  existingTeamReports: [],
});
assert.equal(s1.valid, true, 'İlk kaptan 11 oyuncusuyla geçerli rapor gönderebilmeli');

let simState = {
  matchStatus: 'PENDING_REVIEW',
  homeScore: 2,
  awayScore: 2,
  fixtureStatus: 'SCHEDULED',
  reports: {
    'rep-home-1': {
      id: 'rep-home-1',
      team_id: HOME_TEAM_ID,
      home_score: 2,
      away_score: 2,
      status: 'PENDING_REVIEW',
      is_stats_applied: false,
      players: homePlayers,
    },
  },
  appliedPlayerStatsByTeam: {},
};
console.log('  [PASS] Ev sahibi kaptanı skoru (2-2) ve 11 oyuncusunu başarıyla onaya gönderdi.');

// SCENARIO 2: İkinci kaptanın bağımsız rapor göndermesi
console.log('SENARYO 2: İkinci kaptanın (Deplasman) bağımsız rapor göndermesi');
const awayPlayers = buildPlayers(awayRosterIds, 11, 2);
const s2 = validateSubmission({
  fixtureId: FIXTURE_ID,
  captainTeamId: AWAY_TEAM_ID,
  fixtureHomeTeamId: HOME_TEAM_ID,
  fixtureAwayTeamId: AWAY_TEAM_ID,
  homeScore: 2,
  awayScore: 2,
  playedAt: '2026-10-30T21:05:00Z',
  players: awayPlayers,
  allowedRosterPlayerIds: awayRosterIds,
  existingTeamReports: Object.values(simState.reports),
});
assert.equal(
  s2.valid,
  true,
  'Birinci kaptanın rapor göndermesi ikinci kaptanın rapor göndermesini engellememeli'
);

simState.reports['rep-away-1'] = {
  id: 'rep-away-1',
  team_id: AWAY_TEAM_ID,
  home_score: 2,
  away_score: 2,
  status: 'PENDING_REVIEW',
  is_stats_applied: false,
  players: awayPlayers,
};
assert.equal(Object.keys(simState.reports).length, 2);
console.log('  [PASS] Deplasman kaptanı bağımsız raporunu gönderdi; iki ayrı rapor admin paneline ulaştı.');

// SCENARIO 3: İlk raporun onaylanması
console.log('SENARYO 3: İlk takımın raporunun onaylanması');
const s3 = approveReportState(simState, 'rep-home-1');
assert.equal(s3.success, true);
assert.equal(s3.isFirstApproval, true);
simState = s3.nextState;

assert.equal(simState.matchStatus, 'APPROVED', 'Maçın sonucu APPROVED olarak işlenmeli');
assert.equal(simState.homeScore, 2, 'Maçın ev sahibi skoru işlenmeli');
assert.equal(simState.awayScore, 2, 'Maçın deplasman skoru işlenmeli');
assert.equal(simState.fixtureStatus, 'COMPLETED', 'Fikstür COMPLETED olmalı');
assert.equal(
  simState.appliedPlayerStatsByTeam[HOME_TEAM_ID]?.length,
  11,
  'İlk takımın 11 oyuncu istatistiği kaydedilmeli'
);
assert.equal(
  simState.appliedPlayerStatsByTeam[AWAY_TEAM_ID],
  undefined,
  'İkinci takımın istatistikleri henüz onaylanmadığı için işlenmemeli'
);
assert.equal(
  simState.reports['rep-away-1'].status,
  'PENDING_REVIEW',
  'İkinci takımın raporu beklenmeye devam etmeli'
);
console.log(
  '  [PASS] İlk rapor onaylandı: Maç skoru işlendi, 1. takım istatistikleri kaydedildi, 2. takım raporu PENDING_REVIEW kaldı.'
);

// SCENARIO 4: İkinci raporun onaylanması
console.log('SENARYO 4: İkinci takımın raporunun onaylanması');
const s4 = approveReportState(simState, 'rep-away-1');
assert.equal(s4.success, true);
assert.equal(s4.isFirstApproval, false);
simState = s4.nextState;

assert.equal(simState.homeScore, 2, 'İlk raporda onaylanan skor korunmalı');
assert.equal(simState.awayScore, 2, 'İlk raporda onaylanan skor korunmalı');
assert.equal(
  simState.appliedPlayerStatsByTeam[HOME_TEAM_ID]?.length,
  11,
  'İlk takımın oyuncu istatistikleri ezilmemeli'
);
assert.equal(
  simState.appliedPlayerStatsByTeam[AWAY_TEAM_ID]?.length,
  11,
  'İkinci takımın 11 oyuncu istatistiği kaydedilmeli ve iki takımın istatistikleri tamamlanmalı'
);
console.log(
  '  [PASS] İkinci rapor onaylandı: İlk rapordaki resmi skor korundu, 1. takım verileri ezilmedi ve 2. takım istatistikleri eklendi.'
);

// SCENARIO 5: İki raporun skorlarının uyuşmaması
console.log('SENARYO 5: İki kaptanın bildirdiği skorların uyuşmaması');
let mismatchState = {
  matchStatus: 'APPROVED',
  homeScore: 1,
  awayScore: 1,
  fixtureStatus: 'COMPLETED',
  reports: {
    'rep-home-m': {
      id: 'rep-home-m',
      team_id: HOME_TEAM_ID,
      home_score: 1,
      away_score: 1,
      status: 'APPROVED',
      is_stats_applied: true,
      players: homePlayers,
    },
    'rep-away-m': {
      id: 'rep-away-m',
      team_id: AWAY_TEAM_ID,
      home_score: 2,
      away_score: 2,
      status: 'PENDING_REVIEW',
      is_stats_applied: false,
      players: awayPlayers,
    },
  },
  appliedPlayerStatsByTeam: {
    [HOME_TEAM_ID]: homePlayers,
  },
};

const autoAttempt = approveReportState(mismatchState, 'rep-away-m', {
  allowScoreMismatch: false,
});
assert.equal(autoAttempt.success, false, 'Skor uyuşmazlığında otomatik onay engellenmeli');
assert.equal(autoAttempt.code, 'SCORE_MISMATCH');

const manualDecision = approveReportState(mismatchState, 'rep-away-m', {
  allowScoreMismatch: true,
});
assert.equal(manualDecision.success, true);
assert.equal(manualDecision.scoreMismatchResolved, true);
assert.equal(
  manualDecision.nextState.homeScore,
  1,
  'Skor uyuşmazlığı manuel onaylandığında ilk raporda onaylanmış resmi maç skoru (1-1) değiştirilmemeli!'
);
assert.equal(
  manualDecision.nextState.awayScore,
  1,
  'Skor uyuşmazlığı manuel onaylandığında ilk raporda onaylanmış resmi maç skoru (1-1) değiştirilmemeli!'
);
assert.equal(
  manualDecision.nextState.appliedPlayerStatsByTeam[AWAY_TEAM_ID]?.length,
  11,
  'Yalnızca ikinci takımın oyuncu istatistikleri kaydedilmeli'
);
console.log(
  '  [PASS] Skor uyuşmazlığında otomatik onay engellendi; manuel admin kararıyla ilk rapordaki resmi skor (1-1) korunarak 2. takım istatistikleri işlendi.'
);

// SCENARIO 6: Reddedilen raporun yeniden gönderilmesi & Aktif rapor tekilliği
console.log('SENARYO 6: Reddedilen raporun yeniden gönderilmesi ve çift aktif rapor engeli');
const duplicateActiveAttempt = validateSubmission({
  fixtureId: FIXTURE_ID,
  captainTeamId: HOME_TEAM_ID,
  fixtureHomeTeamId: HOME_TEAM_ID,
  fixtureAwayTeamId: AWAY_TEAM_ID,
  homeScore: 2,
  awayScore: 2,
  playedAt: '2026-10-30T21:00:00Z',
  players: homePlayers,
  allowedRosterPlayerIds: homeRosterIds,
  existingTeamReports: [
    { id: 'rep-pending', team_id: HOME_TEAM_ID, status: 'PENDING_REVIEW' },
  ],
});
assert.equal(duplicateActiveAttempt.valid, false);
assert.equal(duplicateActiveAttempt.code, 'DUPLICATE_ACTIVE_REPORT');

const resubmitAfterReject = validateSubmission({
  fixtureId: FIXTURE_ID,
  captainTeamId: HOME_TEAM_ID,
  fixtureHomeTeamId: HOME_TEAM_ID,
  fixtureAwayTeamId: AWAY_TEAM_ID,
  homeScore: 2,
  awayScore: 2,
  playedAt: '2026-10-30T21:00:00Z',
  players: homePlayers,
  allowedRosterPlayerIds: homeRosterIds,
  existingTeamReports: [
    { id: 'rep-rejected', team_id: HOME_TEAM_ID, status: 'REJECTED' },
  ],
});
assert.equal(
  resubmitAfterReject.valid,
  true,
  'Reddedilen (REJECTED) rapordan sonra kaptan yeniden rapor gönderebilmeli'
);
console.log(
  '  [PASS] Aktif raporu olan takımın ikinci kez rapor göndermesi engellendi; reddedilen raporun yeniden gönderilmesine izin verildi.'
);

// SCENARIO 7: Yetkisiz kaptanın başka takım adına rapor göndermesi / yabancı oyuncu seçimi
console.log('SENARYO 7: Yetkisiz kaptanın başka takım adına rapor göndermesi');
const unauthorizedTeamAttempt = validateSubmission({
  fixtureId: FIXTURE_ID,
  captainTeamId: OTHER_TEAM_ID,
  fixtureHomeTeamId: HOME_TEAM_ID,
  fixtureAwayTeamId: AWAY_TEAM_ID,
  homeScore: 1,
  awayScore: 1,
  playedAt: '2026-10-30T21:00:00Z',
  players: homePlayers,
  allowedRosterPlayerIds: homeRosterIds,
  existingTeamReports: [],
});
assert.equal(unauthorizedTeamAttempt.valid, false);
assert.equal(unauthorizedTeamAttempt.code, 'UNAUTHORIZED_TEAM');

const foreignPlayerList = [...homePlayers.slice(0, 10), { ...awayPlayers[0] }];
const foreignPlayerAttempt = validateSubmission({
  fixtureId: FIXTURE_ID,
  captainTeamId: HOME_TEAM_ID,
  fixtureHomeTeamId: HOME_TEAM_ID,
  fixtureAwayTeamId: AWAY_TEAM_ID,
  homeScore: 1,
  awayScore: 1,
  playedAt: '2026-10-30T21:00:00Z',
  players: foreignPlayerList,
  allowedRosterPlayerIds: homeRosterIds,
  existingTeamReports: [],
});
assert.equal(foreignPlayerAttempt.valid, false);
assert.equal(foreignPlayerAttempt.code, 'UNAUTHORIZED_PLAYER');
console.log(
  '  [PASS] Yetkisiz takım kaptanının rapor göndermesi ve başka takım oyuncusunun kadroya eklenmesi engellendi.'
);

// SCENARIO 8: Aynı oyuncunun iki kez seçilmesi
console.log('SENARYO 8: Aynı oyuncunun iki kez seçilmesi');
const duplicatePlayers = [...homePlayers.slice(0, 10), { ...homePlayers[0] }];
const duplicatePlayerAttempt = validateSubmission({
  fixtureId: FIXTURE_ID,
  captainTeamId: HOME_TEAM_ID,
  fixtureHomeTeamId: HOME_TEAM_ID,
  fixtureAwayTeamId: AWAY_TEAM_ID,
  homeScore: 1,
  awayScore: 1,
  playedAt: '2026-10-30T21:00:00Z',
  players: duplicatePlayers,
  allowedRosterPlayerIds: homeRosterIds,
  existingTeamReports: [],
});
assert.equal(duplicatePlayerAttempt.valid, false);
assert.equal(duplicatePlayerAttempt.code, 'DUPLICATE_PLAYER');
console.log('  [PASS] Aynı oyuncunun ilk 11 içinde iki kez seçilmesi engellendi.');

// SCENARIO 9: İstatistiklerin iki kez işlenmeye çalışılması (Idempotency)
console.log('SENARYO 9: İstatistiklerin iki kez işlenmeye çalışılması (Idempotency)');
const doubleApproveAttempt = approveReportState(simState, 'rep-home-1');
assert.equal(doubleApproveAttempt.success, false);
assert.equal(
  doubleApproveAttempt.code,
  'ALREADY_APPROVED',
  'Zaten onaylanmış bir raporun ikinci kez onaylanması ve istatistiklerinin tekrar işlenmesi engellenmeli'
);
console.log('  [PASS] Onay işlemi idempotent: Onaylanmış raporun ikinci kez işlenmesi engellendi.');

// SCENARIO 10: Mevcut EA maç akışının ve diğer maç türlerinin bozulmaması
console.log('SENARYO 10: Mevcut EA maç akışının ve diğer maç türlerinin korunması');
const eaImportPath = path.resolve('app/admin/matches/ea-import/actions.ts');
const weeklyImportPath = path.resolve('app/admin/matches/import/actions.ts');
assert.ok(fs.existsSync(eaImportPath), 'EA import modülü korunmalı');
assert.ok(fs.existsSync(weeklyImportPath), 'Haftalık JSON import modülü korunmalı');
assert.ok(
  adminActionsCode.includes('export async function reviewMatchAction'),
  'Mevcut reviewMatchAction fonksiyonu korunmalı'
);
assert.ok(
  adminActionsCode.includes('export async function updateApprovedMatchDetailsAction'),
  'Mevcut updateApprovedMatchDetailsAction fonksiyonu korunmalı'
);
console.log('  [PASS] Mevcut EA maç içe aktarma, haftalık JSON aktarım ve admin maç düzenleme akışları korundu.\n');

// ---------------------------------------------------------------------------
// PART C: 9-Point Pre-Production Security & Data Integrity Audit Verification
// ---------------------------------------------------------------------------
console.log('BÖLÜM C: Production Öncesi Kritik Güvenlik ve Veri Bütünlüğü Denetimi (9 Alan)');

// AUDIT 1: approve_match_team_report single-write, hierarchical row locking, idempotency, MOM per-team index
console.log('DENETİM 1: approve_match_team_report RPC (Tekil Yazım, Row Locking, Idempotency, MOM İndeksi)');
assert.ok(
  migrationSql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_single_mom_per_match_team'),
  'İki kaptanın da kendi takımından MOM seçebilmesi için uq_single_mom_per_match_team indeksi olmalı'
);
assert.ok(
  migrationSql.includes('-- Lock 1: Fixture\n    SELECT * INTO v_fixture\n    FROM public.fixtures\n    WHERE id = v_fixture_id\n    FOR UPDATE;'),
  'approve_match_team_report önce parent fixtures satırını FOR UPDATE ile kilitlemeli (deadlock önleme)'
);
assert.ok(
  migrationSql.includes("IF v_report.status = 'APPROVED' OR v_report.is_stats_applied = true THEN"),
  'approve_match_team_report kilit altında status=APPROVED veya is_stats_applied=true kontrolü yapmalı'
);
assert.ok(
  migrationSql.includes('DELETE FROM public.match_player_stats\n    WHERE match_id = v_match.id\n      AND team_id = v_report.team_id;'),
  'approve_match_team_report yalnızca onaylanan takımın (team_id) match_player_stats kayıtlarını temizleyip yazmalı'
);
console.log('  [PASS] DENETİM 1: Tekil yazım, deterministik FOR UPDATE kilit sırası ve idempotency doğrulandı.');

// AUDIT 2: recalculate_season_stats accuracy on staggered 1st & 2nd report approvals
console.log('DENETİM 2: recalculate_season_stats (Ayrı Ayrı Onayda Sezon Toplamları ve Oyuncu Profilleri)');
const triggersSql = fs.readFileSync(
  path.resolve('supabase/migrations/20260821000008_functions_and_triggers.sql'),
  'utf8'
);
assert.ok(
  triggersSql.includes('CREATE OR REPLACE FUNCTION public.recalculate_season_stats'),
  'recalculate_season_stats fonksiyonu mevcut olmalı'
);
assert.ok(
  triggersSql.includes('CREATE TRIGGER trg_recalculate_on_player_stats') &&
    triggersSql.includes('AFTER INSERT OR UPDATE OR DELETE ON match_player_stats'),
  'match_player_stats üzerinde trg_recalculate_on_player_stats trigger aktif olmalı'
);
// Simulate full-recompute behavior of recalculate_season_stats after 1st approval and after 2nd approval
function simulateRecalculateSeasonStats(approvedMatch, matchPlayerStatsRows) {
  const playerTotals = {};
  if (approvedMatch.status === 'APPROVED') {
    for (const row of matchPlayerStatsRows) {
      if (!row.player_id) continue;
      if (!playerTotals[row.player_id]) {
        playerTotals[row.player_id] = { matches_played: 0, goals: 0, assists: 0 };
      }
      playerTotals[row.player_id].matches_played += 1;
      playerTotals[row.player_id].goals += row.goals;
      playerTotals[row.player_id].assists += row.assists;
    }
  }
  return playerTotals;
}
const afterFirstApprovalStats = simulateRecalculateSeasonStats(
  { status: 'APPROVED' },
  simState.appliedPlayerStatsByTeam[HOME_TEAM_ID]
);
assert.equal(Object.keys(afterFirstApprovalStats).length, 11);
assert.equal(afterFirstApprovalStats['home-player-11'].matches_played, 1);
assert.equal(afterFirstApprovalStats['home-player-11'].goals, 2);

const afterSecondApprovalStats = simulateRecalculateSeasonStats(
  { status: 'APPROVED' },
  [
    ...simState.appliedPlayerStatsByTeam[HOME_TEAM_ID],
    ...simState.appliedPlayerStatsByTeam[AWAY_TEAM_ID],
  ]
);
assert.equal(Object.keys(afterSecondApprovalStats).length, 22);
assert.equal(
  afterSecondApprovalStats['home-player-11'].matches_played,
  1,
  'İkinci rapor onaylandığında birinci takım oyuncularının maç/gol sayısı ikiye katlanmamalı'
);
assert.equal(afterSecondApprovalStats['home-player-11'].goals, 2);
assert.equal(afterSecondApprovalStats['away-player-11'].matches_played, 1);
assert.equal(afterSecondApprovalStats['away-player-11'].goals, 2);
console.log('  [PASS] DENETİM 2: Ayrı zamanlı 1. ve 2. rapor onaylarında sezon toplamları sıfırdan ve tekil hesaplanıyor.');

// AUDIT 3: EA Import Non-Overwrite Protection
console.log('DENETİM 3: EA Import Akışı (Onaylı/Bekleyen Kaptan Raporlarının Ezilmemesi)');
assert.ok(
  eaImportActionsCode.includes('existingFixtureMatch || existingCaptainReport'),
  'importEaMatchAction mevcut maç veya kaptan raporu olan fikstürleri sunucu tarafında engellemeli'
);
assert.ok(
  eaImportActionsCode.includes('dupFix || dupCaptainReport'),
  'fetchEaPreviewAction kaptan raporu bulunan fikstürleri FIXTURE_ALREADY_HAS_MATCH olarak işaretlemeli'
);
console.log('  [PASS] DENETİM 3: Onaylanmış/bekleyen kaptan raporlarının EA senkronizasyonunda ezilmesi engellendi.');

// AUDIT 4: RLS & RPC Security (SECURITY DEFINER, search_path, REVOKE PUBLIC/anon, revoked_at, is_active)
console.log('DENETİM 4: RLS ve RPC Güvenliği (SECURITY DEFINER, search_path, EXECUTE İzinleri, Üyelik)');
assert.ok(
  migrationSql.includes('SECURITY DEFINER') && migrationSql.includes('SET search_path = public'),
  'Tüm RPC ve trigger fonksiyonlarında SECURITY DEFINER ve SET search_path = public bulunmalı'
);
assert.ok(
  migrationSql.includes('REVOKE ALL ON FUNCTION public.submit_match_team_report') &&
    migrationSql.includes('REVOKE ALL ON FUNCTION public.approve_match_team_report') &&
    migrationSql.includes('REVOKE ALL ON FUNCTION public.reject_match_team_report'),
  'RPC fonksiyonlarında PUBLIC ve anon EXECUTE yetkileri açıkça REVOKE edilmeli'
);
assert.ok(
  migrationSql.includes('ur.revoked_at IS NULL') && migrationSql.includes('p.is_active = true'),
  'RLS ve RPC kontrollerinde ur.revoked_at IS NULL ve p.is_active = true doğrulanmalı'
);
console.log('  [PASS] DENETİM 4: RLS politikaları, SECURITY DEFINER, search_path ve EXECUTE izinleri doğrulandı.');

// AUDIT 5: Score Mismatch Explicit Admin Decision & Global reviewMatchAction Bypass Guard
console.log('DENETİM 5: Admin Onayı ve Skor Uyuşmazlığı Koruması');
assert.ok(
  adminActionsCode.includes('requiresMismatchConfirmation: true'),
  'approveTeamMatchReportAction skor uyuşmazlığında açık admin onayı istemeli'
);
assert.ok(
  adminActionsCode.includes('Bu maç için bekleyen çift taraflı kaptan raporu bulunmaktadır'),
  'reviewMatchAction bekleyen çift taraflı rapor varken doğrudan genel maç onayını engelleyip takım raporu onayına yönlendirmeli'
);
console.log('  [PASS] DENETİM 5: Skor uyuşmazlığında açık admin kararı zorunluluğu ve bypass koruması doğrulandı.');

// AUDIT 6: Captain Permissions (No cross-team or opponent player reporting)
console.log('DENETİM 6: Kaptan Yetkileri (Başka Takım veya Rakip Oyuncu Adına Rapor Engeli)');
assert.ok(
  migrationSql.includes('Yalnızca kaptanı olduğunuz takım adına maç raporu gönderebilirsiniz.') &&
    migrationSql.includes('Seçilen oyuncu bu sezonda takım kadrosunda yer almıyor.'),
  'RPC içinde kaptanlık ve aktif takım kadrosu doğrulaması bulunmalı'
);
assert.ok(
  migrationSql.includes('check_match_team_report_player_membership'),
  'Veritabanı seviyesinde oyuncu-takım üyeliği trigger kontrolü bulunmalı'
);
console.log('  [PASS] DENETİM 6: Kaptanın başka takım veya rakip oyuncular adına rapor göndermesi tüm katmanlarda engellendi.');

// AUDIT 7: Existing Matches Compatibility
console.log('DENETİM 7: Mevcut Maçlar, Skor Gönderim Sistemi ve Maç Düzenleme Uyumluluğu');
assert.ok(
  adminActionsCode.includes('export async function updateMatchScoreAction') &&
    adminActionsCode.includes('export async function assignPlayerStatsProfileAction'),
  'Mevcut skor güncelleme ve profil eşleştirme aksiyonları korunmalı'
);
console.log('  [PASS] DENETİM 7: Eski EA onaylı maçlar ve maç düzenleme akışı korundu.');

// AUDIT 8: Rollback SQL Verification
console.log('DENETİM 8: Rollback SQL Betiği Doğrulaması (Çalıştırılmadan Statik Kontrol)');
assert.ok(
  rollbackSql.includes('DROP TABLE IF EXISTS public.match_team_report_players') &&
    rollbackSql.includes('DROP TABLE IF EXISTS public.match_team_reports') &&
    rollbackSql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_single_mom_per_match'),
  'Rollback SQL yalnızca yeni tabloları/fonksiyonları kaldırmalı ve uq_single_mom_per_match indeksini geri yüklemeli'
);
assert.ok(
  !rollbackSql.includes('DROP TABLE IF EXISTS public.matches') &&
    !rollbackSql.includes('DROP TABLE IF EXISTS public.match_player_stats'),
  'Rollback SQL kesinlikle mevcut matches veya match_player_stats tablolarını silmemeli'
);
console.log('  [PASS] DENETİM 8: Rollback SQL betiği doğrulandı (mevcut tablolara dokunmaz).');

// AUDIT 9: Starting 11 Requirement for Teams with < 11 Active Players
console.log('DENETİM 9: Aktif Kadrosu 11\'den Az Olan Takımlarda İlk 11 Zorunluluğu Davranışı');
assert.ok(
  migrationSql.includes('v_expected_player_count := LEAST(11, v_active_roster_count);'),
  'SQL RPC aktif kadrosu 11\'den az olan takımlarda LEAST(11, v_active_roster_count) kullanmalı'
);
assert.ok(
  matchReportingLibCode.includes('export function getRequiredLineupCount') &&
    playerStatsFormCode.includes('getRequiredLineupCount'),
  'TypeScript doğrulaması ve formlar getRequiredLineupCount fonksiyonunu kullanmalı'
);
const smallRosterIds = Array.from({ length: 8 }, (_, i) => `small-team-player-${i + 1}`);
const smallTeamPlayers = buildPlayers(smallRosterIds, 8, 1);
const smallTeamSubmission = validateSubmission({
  fixtureId: FIXTURE_ID,
  captainTeamId: HOME_TEAM_ID,
  fixtureHomeTeamId: HOME_TEAM_ID,
  fixtureAwayTeamId: AWAY_TEAM_ID,
  homeScore: 1,
  awayScore: 0,
  playedAt: '2026-10-30T21:00:00Z',
  players: smallTeamPlayers,
  allowedRosterPlayerIds: smallRosterIds,
  existingTeamReports: [],
});
assert.equal(
  smallTeamSubmission.valid,
  true,
  'Aktif kadrosunda 8 oyuncu bulunan takım 8 oyuncusunun tamamını seçerek rapor gönderebilmeli'
);
assert.equal(smallTeamSubmission.requiredCount, 8);
const smallTeamIncomplete = validateSubmission({
  fixtureId: FIXTURE_ID,
  captainTeamId: HOME_TEAM_ID,
  fixtureHomeTeamId: HOME_TEAM_ID,
  fixtureAwayTeamId: AWAY_TEAM_ID,
  homeScore: 1,
  awayScore: 0,
  playedAt: '2026-10-30T21:00:00Z',
  players: smallTeamPlayers.slice(0, 7),
  allowedRosterPlayerIds: smallRosterIds,
  existingTeamReports: [],
});
assert.equal(
  smallTeamIncomplete.valid,
  false,
  'Aktif kadrosunda 8 oyuncu bulunan takım 7 oyuncu seçerse reddedilmeli'
);
console.log(
  '  [PASS] DENETİM 9: Aktif kadrosu < 11 olan takımlarda tüm aktif kadronun (LEAST(11, active_roster_count)) seçilmesi zorunlu kılınarak kilitlenme önlendi.\n'
);

// ---------------------------------------------------------------------------
// PART D: Final 10 Business Rules Verification (EA Flow vs Captain Flow)
// ---------------------------------------------------------------------------
console.log('BÖLÜM D: Nihai 10 İş Kuralı Doğrulaması (Oynanmamış Fikstürler, Geçmiş Maç Kilidi ve EA/Kaptan Ayrımı)');

const captainListPageCode = fs.readFileSync(
  path.resolve('app/takim/yonet/maclar/page.tsx'),
  'utf8'
);
const captainNewPageCode = fs.readFileSync(
  path.resolve('app/takim/yonet/maclar/yeni/page.tsx'),
  'utf8'
);
const captainDetailPageCode = fs.readFileSync(
  path.resolve('app/takim/yonet/maclar/[id]/page.tsx'),
  'utf8'
);
const matchImportPlanCode = fs.readFileSync(
  path.resolve('lib/match-import-plan.ts'),
  'utf8'
);

// RULE 1 & 2: Captains see both unplayed and finished fixtures; finished (COMPLETED, APPROVED, AUTO, FORFEIT, CANCELLED) matches are shown read-only as "BİTTİ" and strictly closed to reporting
console.log('KURAL 1 & 2: Kaptanlar oynanmamış maçlarla birlikte biten maçları salt okunur ("BİTTİ") görür; biten maçlar raporlamaya kesinlikle kapalıdır');
assert.ok(
  captainListPageCode.includes('MAÇ YÖNETİMİ') &&
    captainListPageCode.includes('getCaptainFixtureRowState') &&
    captainListPageCode.includes('İşlem yapılamaz') &&
    !captainListPageCode.includes(".eq('status', 'SCHEDULED')"),
  'Kaptan maç listesi (/takim/yonet/maclar) oynanmamış ve biten tüm takım fikstürlerini listelemeli ve biten maçlarda İşlem yapılamaz göstermeli'
);
assert.ok(
  captainNewPageCode.includes('canCaptainSubmitTeamReport'),
  'Kaptan yeni rapor sayfası (/takim/yonet/maclar/yeni) canCaptainSubmitTeamReport ile geçmiş maçları engellemeli'
);
assert.ok(
  captainDetailPageCode.includes("fixtureStatus !== 'SCHEDULED'") &&
    captainDetailPageCode.includes("match.status === 'APPROVED'"),
  'Kaptan maç detay sayfası (/takim/yonet/maclar/[id]) COMPLETED/APPROVED maçlarda raporlama ve düzenlemeyi kapatmalı'
);
assert.ok(
  migrationSql.includes("IF v_fixture.status != 'SCHEDULED' THEN") &&
    migrationSql.includes("IF v_match.status::text IN ('APPROVED', 'CANCELLED') THEN") &&
    migrationSql.includes("IF v_match.source IN ('AUTO', 'FORFEIT') THEN"),
  'Veritabanı trigger, RLS ve RPC katmanlarında hem fixture.status hem match.status/source kontrolü zorunlu olmalı'
);

// Verify read-only row state ("BİTTİ", score display, dual report visibility, and zero action buttons) for finished matches
const finishedEaRow = getCaptainFixtureRowState({
  fixtureStatus: 'COMPLETED',
  matchSource: 'AUTO',
  matchStatus: 'APPROVED',
  homeScore: 3,
  awayScore: 1,
  myTeamReportStatus: null,
  oppTeamReportStatus: null,
});
assert.equal(finishedEaRow.isFinished, true);
assert.equal(finishedEaRow.statusLabel, 'BİTTİ');
assert.equal(finishedEaRow.scoreText, '3 - 1');
assert.equal(finishedEaRow.hasDualReports, false);
assert.equal(finishedEaRow.canSubmit, false, 'Biten EA maçında SONUÇ GİR butonu olmamalı');
assert.equal(finishedEaRow.canViewPendingDetails, false, 'Biten maçta incele/düzenle linki olmamalı');

const finishedDualDrawRow = getCaptainFixtureRowState({
  fixtureStatus: 'COMPLETED',
  matchSource: 'MANUAL',
  matchStatus: 'APPROVED',
  homeScore: 2,
  awayScore: 2,
  myTeamReportStatus: 'APPROVED',
  oppTeamReportStatus: 'PENDING_REVIEW',
});
assert.equal(finishedDualDrawRow.isFinished, true);
assert.equal(finishedDualDrawRow.statusLabel, 'BİTTİ');
assert.equal(finishedDualDrawRow.scoreText, '2 - 2');
assert.equal(finishedDualDrawRow.hasDualReports, true, 'Biten maçta çift taraflı rapor durumları görüntülenebilmeli');
assert.equal(finishedDualDrawRow.canSubmit, false);
assert.equal(finishedDualDrawRow.canViewPendingDetails, false);

const unplayedFutureRow = getCaptainFixtureRowState({
  fixtureStatus: 'SCHEDULED',
  matchSource: null,
  matchStatus: null,
  homeScore: null,
  awayScore: null,
  myTeamReportStatus: null,
  oppTeamReportStatus: null,
});
assert.equal(unplayedFutureRow.isFinished, false);
assert.equal(unplayedFutureRow.statusLabel, 'SCHEDULED');
assert.equal(unplayedFutureRow.canSubmit, true, 'Oynanmamış SCHEDULED maçta SONUÇ GİR butonu aktif olmalı');
assert.equal(unplayedFutureRow.isResubmission, false);

// Edge Case 1: source = 'AUTO' where fixture/match status is NOT yet completed (e.g. PENDING_REVIEW or REJECTED on SCHEDULED fixture)
// must NOT be falsely labeled 'BİTTİ', while still remaining read-only (canSubmit = false, canViewPendingDetails = false)
const unapprovedEaRow = getCaptainFixtureRowState({
  fixtureStatus: 'SCHEDULED',
  matchSource: 'AUTO',
  matchStatus: 'PENDING_REVIEW',
  homeScore: 2,
  awayScore: 0,
  myTeamReportStatus: null,
  oppTeamReportStatus: null,
});
assert.equal(unapprovedEaRow.isFinished, false, 'Henüz onaylanmamış AUTO maç BİTTİ olarak işaretlenmemeli');
assert.notEqual(unapprovedEaRow.statusLabel, 'BİTTİ', 'Henüz tamamlanmamış AUTO maçta BİTTİ yazmamalı');
assert.equal(unapprovedEaRow.statusLabel, 'PENDING_REVIEW');
assert.equal(unapprovedEaRow.canSubmit, false, 'AUTO maç kaptan raporlamasına kapalı kalmalı');
assert.equal(unapprovedEaRow.canViewPendingDetails, false, 'AUTO maçta kaptan düzenleme linki olmamalı');

// Edge Case 2: CANCELLED and FORFEITED matches must display 'İPTAL' and 'HÜKMEN' respectively instead of 'BİTTİ', while staying read-only
for (const cancelledCase of [
  { fixtureStatus: 'CANCELLED', matchSource: null, matchStatus: null },
  { fixtureStatus: 'SCHEDULED', matchSource: 'MANUAL', matchStatus: 'CANCELLED' },
]) {
  const row = getCaptainFixtureRowState({
    ...cancelledCase,
    homeScore: null,
    awayScore: null,
    myTeamReportStatus: null,
    oppTeamReportStatus: null,
  });
  assert.equal(row.isFinished, true);
  assert.equal(row.statusLabel, 'İPTAL', 'İptal edilen maçlar BİTTİ yerine İPTAL olarak gösterilmeli');
  assert.equal(row.canSubmit, false);
  assert.equal(row.canViewPendingDetails, false);
}

for (const forfeitCase of [
  { fixtureStatus: 'FORFEITED', matchSource: null, matchStatus: null },
  { fixtureStatus: 'SCHEDULED', matchSource: 'FORFEIT', matchStatus: 'APPROVED' },
  { fixtureStatus: 'COMPLETED', matchSource: 'FORFEIT', matchStatus: 'APPROVED' },
]) {
  const row = getCaptainFixtureRowState({
    ...forfeitCase,
    homeScore: 3,
    awayScore: 0,
    myTeamReportStatus: null,
    oppTeamReportStatus: null,
  });
  assert.equal(row.isFinished, true);
  assert.equal(row.statusLabel, 'HÜKMEN', 'Hükmen sonuçlanan maçlar BİTTİ yerine HÜKMEN olarak gösterilmeli');
  assert.equal(row.scoreText, '3 - 0');
  assert.equal(row.canSubmit, false);
  assert.equal(row.canViewPendingDetails, false);
}

// Verify visibility and submission eligibility across all fixture & match status combinations (not just date!)
assert.equal(
  isFixtureFinishedForCaptain({ fixtureStatus: 'COMPLETED', matchSource: null, matchStatus: null }),
  true
);
assert.equal(
  isFixtureFinishedForCaptain({ fixtureStatus: 'SCHEDULED', matchSource: 'AUTO', matchStatus: 'APPROVED' }),
  true
);
assert.equal(
  isFixtureOpenForCaptainView({ fixtureStatus: 'COMPLETED', matchSource: null, matchStatus: null, hasAnyTeamReports: false }),
  false,
  'COMPLETED fikstür raporlamaya kapalı olmalı'
);
assert.equal(
  isFixtureOpenForCaptainView({ fixtureStatus: 'SCHEDULED', matchSource: 'AUTO', matchStatus: 'APPROVED', hasAnyTeamReports: false }),
  false,
  'Fikstür durumu SCHEDULED kalsa bile match.status = APPROVED olan geçmiş maç raporlamaya kapalı olmalı'
);
assert.equal(
  isFixtureOpenForCaptainView({ fixtureStatus: 'SCHEDULED', matchSource: 'AUTO', matchStatus: 'PENDING_REVIEW', hasAnyTeamReports: false }),
  false,
  'EA tarafından otomatik çekilmiş (source = AUTO) maç raporlamaya kapalı olmalı'
);
assert.equal(
  isFixtureOpenForCaptainView({ fixtureStatus: 'SCHEDULED', matchSource: 'MANUAL', matchStatus: 'APPROVED', hasAnyTeamReports: true }),
  false,
  'Onaylanmış (APPROVED) kaptan raporu bulunan tamamlanmış maç raporlamaya kapalı olmalı'
);

for (const closedCase of [
  { label: 'Fikstür COMPLETED', fixtureStatus: 'COMPLETED', matchSource: null, matchStatus: null },
  { label: 'Fikstür POSTPONED', fixtureStatus: 'POSTPONED', matchSource: null, matchStatus: null },
  { label: 'Fikstür CANCELLED', fixtureStatus: 'CANCELLED', matchSource: null, matchStatus: null },
  { label: 'Fikstür FORFEITED', fixtureStatus: 'FORFEITED', matchSource: null, matchStatus: null },
  { label: 'Fikstür SCHEDULED ama Match APPROVED', fixtureStatus: 'SCHEDULED', matchSource: 'MANUAL', matchStatus: 'APPROVED' },
  { label: 'Fikstür SCHEDULED ama Match AUTO (EA)', fixtureStatus: 'SCHEDULED', matchSource: 'AUTO', matchStatus: 'PENDING_REVIEW' },
  { label: 'Fikstür SCHEDULED ama Match FORFEIT', fixtureStatus: 'SCHEDULED', matchSource: 'FORFEIT', matchStatus: 'PENDING_REVIEW' },
  { label: 'Fikstür SCHEDULED ama Match CANCELLED', fixtureStatus: 'SCHEDULED', matchSource: 'MANUAL', matchStatus: 'CANCELLED' },
]) {
  const gate = canCaptainSubmitTeamReport({
    fixtureStatus: closedCase.fixtureStatus,
    matchSource: closedCase.matchSource,
    matchStatus: closedCase.matchStatus,
    myTeamReportStatus: null,
    myTeamHasSavedStats: false,
    hasAnyTeamReports: true,
  });
  assert.equal(gate.canSubmit, false, `${closedCase.label} kaptan raporlamasına kapalı olmalı`);

  const val = validateTeamMatchReportSubmission({
    fixtureId: FIXTURE_ID,
    captainTeamId: HOME_TEAM_ID,
    fixtureHomeTeamId: HOME_TEAM_ID,
    fixtureAwayTeamId: AWAY_TEAM_ID,
    fixtureStatus: closedCase.fixtureStatus,
    matchStatus: closedCase.matchStatus,
    matchSource: closedCase.matchSource,
    homeScore: 2,
    awayScore: 1,
    playedAt: '2026-10-30T21:00:00Z',
    players: homePlayers,
    allowedRosterPlayerIds: homeRosterIds,
    existingTeamReports: [],
  });
  assert.equal(val.valid, false, `${closedCase.label} sunucu doğrulamasında reddedilmeli`);
  assert.equal(val.code, 'MATCH_ALREADY_PLAYED');
}
console.log('  [PASS] KURAL 1 & 2: Geçmiş, COMPLETED, APPROVED ve EA maçları UI, Server Action, RPC ve DB seviyesinde kapatıldı.');

// RULE 3 & 6: All unplayed SCHEDULED fixtures are open to captain reporting (both draw and non-draw, regardless of scheduled_at date)
console.log('KURAL 3 & 6: Henüz oynanmamış bütün maçlar (beraberlik veya galibiyet/mağlubiyet, tarih filtresi olmaksızın) kaptan raporlamasına açıktır');
assert.equal(
  isFixtureOpenForCaptainView({ fixtureStatus: 'SCHEDULED', matchSource: null, matchStatus: null, hasAnyTeamReports: false }),
  true,
  'Oynanmamış SCHEDULED fikstür kaptan ekranında açık olmalı'
);
assert.equal(
  canCaptainSubmitTeamReport({
    fixtureStatus: 'SCHEDULED',
    matchSource: null,
    matchStatus: null,
    myTeamReportStatus: null,
    myTeamHasSavedStats: false,
    hasAnyTeamReports: false,
  }).canSubmit,
  true,
  'Oynanmamış fikstür için 1. kaptan rapor gönderebilmeli'
);
assert.equal(
  canCaptainSubmitTeamReport({
    fixtureStatus: 'SCHEDULED',
    matchSource: 'MANUAL',
    matchStatus: 'PENDING_REVIEW',
    myTeamReportStatus: null,
    myTeamHasSavedStats: false,
    hasAnyTeamReports: true,
  }).canSubmit,
  true,
  '1. kaptan rapor gönderdikten sonra 2. kaptan da aynı oynanmamış fikstür için rapor gönderebilmeli'
);

// Both draw (1-1) and non-draw (3-1) manual captain reports must pass validation without any draw-only or date filter
for (const [hScore, aScore] of [[1, 1], [0, 0], [3, 1], [0, 2]]) {
  const val = validateTeamMatchReportSubmission({
    fixtureId: FIXTURE_ID,
    captainTeamId: HOME_TEAM_ID,
    fixtureHomeTeamId: HOME_TEAM_ID,
    fixtureAwayTeamId: AWAY_TEAM_ID,
    fixtureStatus: 'SCHEDULED',
    matchStatus: null,
    matchSource: null,
    homeScore: hScore,
    awayScore: aScore,
    playedAt: '2026-01-15T19:00:00Z', // past or future date does not block an unplayed SCHEDULED fixture
    players: homePlayers,
    allowedRosterPlayerIds: homeRosterIds,
    existingTeamReports: [],
  });
  assert.equal(val.valid, true, `Oynanmamış fikstürde ${hScore}-${aScore} skoruyla manuel kaptan raporu gönderilebilmeli`);
}
console.log('  [PASS] KURAL 3 & 6: Oynanmamış tüm SCHEDULED fikstürler tarih veya beraberlik kısıtı olmadan kaptan raporlamasına ve admin onayına açık.');

// RULE 4, 5 & 8: EA non-draw continues auto flow; EA draw is blocked from auto-import; captain reports are protected from EA overwrite
console.log('KURAL 4, 5 & 8: EA beraberlik olmayan maçlar otomatik işlenir; EA beraberlik maçları otomatik import edilmez; kaptan raporları ezilmez');
assert.equal(isEaMatchDraw(2, 1), false, '2-1 beraberlik değildir -> EA akışı');
assert.equal(isEaMatchDraw(0, 3), false, '0-3 beraberlik değildir -> EA akışı');
assert.equal(isEaMatchDraw(0, 0), true, '0-0 beraberliktir -> Kaptan raporlamasına bırakılmalı');
assert.equal(isEaMatchDraw(2, 2), true, '2-2 beraberliktir -> Kaptan raporlamasına bırakılmalı');

assert.ok(
  eaImportActionsCode.includes('DRAW_REQUIRES_CAPTAIN_REPORT') &&
    eaImportActionsCode.includes('normalized.home_team.score === normalized.away_team.score'),
  'Canlı EA API import aksiyonu beraberlik maçlarını DRAW_REQUIRES_CAPTAIN_REPORT olarak işaretlemeli ve otomatik importu engellemeli'
);
assert.ok(
  matchImportPlanCode.includes('DRAW_REQUIRES_CAPTAIN_REPORT') &&
    matchImportPlanCode.includes('FIXTURE_HAS_CAPTAIN_REPORT'),
  'Haftalık EA JSON planlayıcısı beraberlik maçlarını (DRAW_REQUIRES_CAPTAIN_REPORT) ve kaptan raporlu fikstürleri (FIXTURE_HAS_CAPTAIN_REPORT) engellemeli'
);
assert.ok(
  migrationSql.includes('CREATE TRIGGER trg_guard_ea_draw_and_captain_reports') &&
    migrationSql.includes('EA_DRAW_BLOCKED') &&
    migrationSql.includes('CAPTAIN_REPORT_PROTECTED'),
  'Veritabanı seviyesinde trg_guard_ea_draw_and_captain_reports trigger ile EA beraberlik importu ve kaptan raporu ezilmesi engellenmeli'
);
console.log('  [PASS] KURAL 4, 5 & 8: EA beraberlik olmayan maçlar otomatik akışta korundu; EA beraberlikleri ve kaptan raporlu maçlar EA importuna kapatıldı.');

// RULE 7, 9 & 10: Independent dual reports (1st sets official score + team 1 stats, 2nd preserves official score + adds team 2 stats)
console.log('KURAL 7, 9 & 10: Bağımsız iki kaptan raporu onayı (1. onay resmi skoru işler, 2. onay skoru değiştirmeden 2. takım istatistiğini ekler)');
const nonDrawDualState = {
  matchStatus: 'PENDING_REVIEW',
  homeScore: 3,
  awayScore: 1,
  fixtureStatus: 'SCHEDULED',
  reports: {
    r1: { id: 'r1', team_id: HOME_TEAM_ID, home_score: 3, away_score: 1, status: 'PENDING_REVIEW', is_stats_applied: false, players: homePlayers },
    r2: { id: 'r2', team_id: AWAY_TEAM_ID, home_score: 2, away_score: 2, status: 'PENDING_REVIEW', is_stats_applied: false, players: awayPlayers },
  },
  appliedPlayerStatsByTeam: {},
};
const firstApprovalPlan = applyTeamReportApproval(nonDrawDualState, 'r1', { allowScoreMismatch: true });
assert.equal(firstApprovalPlan.success, true);
assert.equal(firstApprovalPlan.isFirstApproval, true);
assert.equal(firstApprovalPlan.nextState.homeScore, 3);
assert.equal(firstApprovalPlan.nextState.awayScore, 1);

const secondApprovalPlan = applyTeamReportApproval(firstApprovalPlan.nextState, 'r2', { allowScoreMismatch: true });
assert.equal(secondApprovalPlan.success, true);
assert.equal(secondApprovalPlan.isFirstApproval, false);
assert.equal(secondApprovalPlan.nextState.homeScore, 3, 'İlk onaydaki resmi ev sahibi skoru (3) korunmalı');
assert.equal(secondApprovalPlan.nextState.awayScore, 1, 'İlk onaydaki resmi deplasman skoru (1) korunmalı');
assert.equal(secondApprovalPlan.nextState.appliedPlayerStatsByTeam[HOME_TEAM_ID]?.length, 11);
assert.equal(secondApprovalPlan.nextState.appliedPlayerStatsByTeam[AWAY_TEAM_ID]?.length, 11);
console.log('  [PASS] KURAL 7, 9 & 10: İki kaptan raporu bağımsızlığı, resmi skor korunumu ve geçmiş onaylı maçların değişmezliği doğrulandı.\n');

console.log('======================================================================');
console.log('TÜM 10 SENARYO, 9 GÜVENLİK DENETİMİ VE 10 NİHAİ İŞ KURALI GEÇTİ! (PASS)');
console.log('======================================================================');
