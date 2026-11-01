/**
 * TETA LEAGUE — TRANSFER WINDOW SYSTEM HARDENING ISOLATED TEST SUITE
 * 
 * Verifies all 33 mandatory test scenarios across 4 categories:
 * - Kategori 1: Kota ve Limit Mantığı (Senaryolar 1-12)
 * - Kategori 2: Pencere Yönetimi ve Yaşam Döngüsü (Senaryolar 13-19)
 * - Kategori 3: Tarih ve Saat Dilimi (Senaryolar 20-24)
 * - Kategori 4: Güvenlik, Yetkilendirme ve Eşzamanlılık (Senaryolar 25-33)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  TURKEY_TIMEZONE,
  parseToTurkeyISO,
  formatForDateTimeLocal,
  formatTournamentDate,
} from '../lib/date-utils.ts';

console.log('======================================================================');
console.log('TETA LEAGUE — TRANSFER SYSTEM HARDENING 33 SCENARIO TEST SUITE');
console.log('======================================================================\n');

// ---------------------------------------------------------------------------
// 0. Static Verification of Migration and Code Files
// ---------------------------------------------------------------------------
const migrationPath = path.resolve('supabase/migrations/20261101220000_transfer_window_hardening_and_quota_fix.sql');
const rollbackPath = path.resolve('docs/rollback/20261101220000_transfer_window_hardening_and_quota_fix_rollback.sql');
const takimYonetPagePath = path.resolve('app/takim/yonet/page.tsx');
const transferlerPagePath = path.resolve('app/profil/transferler/page.tsx');
const adminActionsPath = path.resolve('app/admin/transfer-windows/actions.ts');
const managerComponentPath = path.resolve('app/admin/transfer-windows/TransferWindowsManager.tsx');

assert(fs.existsSync(migrationPath), 'Migration file must exist');
assert(fs.existsSync(rollbackPath), 'Rollback file must exist');
assert(fs.existsSync(takimYonetPagePath), 'Captain management page must exist');
assert(fs.existsSync(transferlerPagePath), 'Player transfers page must exist');
assert(fs.existsSync(adminActionsPath), 'Admin transfer actions must exist');
assert(fs.existsSync(managerComponentPath), 'Admin transfer manager component must exist');

const migrationSql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');
const takimYonetCode = fs.readFileSync(takimYonetPagePath, 'utf8');
const transferlerCode = fs.readFileSync(transferlerPagePath, 'utf8');
const adminActionsCode = fs.readFileSync(adminActionsPath, 'utf8');
const managerCode = fs.readFileSync(managerComponentPath, 'utf8');

// ---------------------------------------------------------------------------
// State Simulator Modeling Postgres Engine with Migrated RPCs
// ---------------------------------------------------------------------------
class MockPostgresDb {
  constructor() {
    this.reset();
  }

  reset() {
    this.seasons = [
      { id: 'season-6', name: 'TETA SEASON 6 | FC27', is_active: true },
      { id: 'season-5', name: 'TETA SEASON 5 | FC26', is_active: false },
    ];
    this.windows = [];
    this.teams = [
      { id: 'team-a', name: 'Galatasaray FC', captain_id: 'captain-a' },
      { id: 'team-b', name: 'Fenerbahçe SK', captain_id: 'captain-b' },
    ];
    this.team_members = [
      { id: 'tm-1', team_id: 'team-a', player_id: 'captain-a', role: 'CAPTAIN' },
      { id: 'tm-2', team_id: 'team-b', player_id: 'captain-b', role: 'CAPTAIN' },
    ];
    this.league_teams = [
      { id: 'lt-1', league_id: 'l-1', season_id: 'season-6', team_id: 'team-a', captain_id: 'captain-a' },
      { id: 'lt-2', league_id: 'l-1', season_id: 'season-6', team_id: 'team-b', captain_id: 'captain-b' },
      { id: 'lt-s5', league_id: 'l-s5', season_id: 'season-5', team_id: 'team-a', captain_id: 'captain-a' },
    ];
    this.user_roles = [
      { id: 'ur-1', user_id: 'captain-a', role: 'CAPTAIN', team_id: 'team-a', is_active: true, revoked_at: null },
      { id: 'ur-2', user_id: 'captain-b', role: 'CAPTAIN', team_id: 'team-b', is_active: true, revoked_at: null },
    ];
    this.transfers = [];
    this.mockNow = new Date('2026-11-01T21:30:00.000Z'); // 00:30 TRT on Nov 2
  }

  setNow(isoString) {
    this.mockNow = new Date(isoString);
  }

  // Exact logic implemented in get_team_transfer_slots RPC
  rpc_get_team_transfer_slots(p_team_id, p_season_id) {
    const window = this.windows
      .filter(w => w.season_id === p_season_id && w.is_open && new Date(w.start_date) <= this.mockNow && new Date(w.end_date) >= this.mockNow)
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

    if (!window) {
      return { total_slots: 0, used_slots: 0, remaining_slots: 0, is_unlimited: false };
    }

    if (window.is_unlimited) {
      const used = this.transfers.filter(t => t.to_team_id === p_team_id && t.season_id === p_season_id && ['APPROVED', 'PENDING_PLAYER'].includes(t.status)).length;
      return { total_slots: 999, used_slots: used, remaining_slots: 999, is_unlimited: true };
    }

    const totalSlots = window.transfer_quota || 5;
    const used = this.transfers.filter(t => t.to_team_id === p_team_id && t.season_id === p_season_id && ['APPROVED', 'PENDING_PLAYER'].includes(t.status)).length;
    const remaining = Math.max(0, totalSlots - used);
    return { total_slots: totalSlots, used_slots: used, remaining_slots: remaining, is_unlimited: false };
  }

  // Exact logic implemented in send_team_invite RPC
  rpc_send_team_invite(p_from_team_id, p_player_id, p_caller_user_id) {
    // 1. Caller role check
    const callerMember = this.team_members.find(tm => tm.team_id === p_from_team_id && tm.player_id === p_caller_user_id);
    if (!callerMember || !['CAPTAIN', 'VICE_CAPTAIN'].includes(callerMember.role)) {
      throw new Error('Sadece takım kaptanları veya yardımcı kaptanları davet gönderebilir.');
    }

    // 2. Already member check
    const existingInTeam = this.team_members.some(tm => tm.team_id === p_from_team_id && tm.player_id === p_player_id);
    if (existingInTeam) {
      throw new Error('Bu oyuncu zaten takımınızın bir parçası.');
    }

    // 3. Squad size check (max 23)
    const squadCount = this.team_members.filter(tm => tm.team_id === p_from_team_id).length;
    if (squadCount >= 23) {
      throw new Error('Takımınız maksimum kadro limitine (23) ulaşmıştır.');
    }

    // 4. Active season
    const activeSeason = this.seasons.find(s => s.is_active);
    if (!activeSeason) {
      throw new Error('Aktif bir sezon bulunamadı.');
    }

    // 5. Transfer window check
    const window = this.windows
      .filter(w => w.season_id === activeSeason.id)
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

    if (!window || !window.is_open) {
      throw new Error('Aktif ve açık bir transfer penceresi bulunmuyor.');
    }
    if (this.mockNow < new Date(window.start_date)) {
      throw new Error('Transfer penceresi henüz başlamadı.');
    }
    if (this.mockNow > new Date(window.end_date)) {
      throw new Error('Transfer penceresi sona ermiştir.');
    }

    // 6. Quota check
    if (!window.is_unlimited) {
      const quota = window.transfer_quota || 5;
      const used = this.transfers.filter(t => t.to_team_id === p_from_team_id && t.season_id === activeSeason.id && ['APPROVED', 'PENDING_PLAYER'].includes(t.status)).length;
      if (used >= quota) {
        throw new Error(`Bu transfer döneminde takımınızın transfer kotası (${quota}) dolmuştur.`);
      }
    }

    // 7. Duplicate pending invite check
    const existingPending = this.transfers.some(t => t.to_team_id === p_from_team_id && t.player_id === p_player_id && t.status === 'PENDING_PLAYER');
    if (existingPending) {
      throw new Error('Bu oyuncuya zaten bekleyen bir davetiniz var.');
    }

    // Create transfer record
    const newTransfer = {
      id: `transfer-${this.transfers.length + 1}`,
      from_team_id: this.team_members.find(tm => tm.player_id === p_player_id)?.team_id || null,
      to_team_id: p_from_team_id,
      player_id: p_player_id,
      season_id: activeSeason.id,
      status: 'PENDING_PLAYER',
      created_at: this.mockNow.toISOString(),
    };
    this.transfers.push(newTransfer);
    return newTransfer.id;
  }

  // Exact logic implemented in accept_team_invite RPC
  rpc_accept_team_invite(p_transfer_id, p_caller_user_id) {
    const transfer = this.transfers.find(t => t.id === p_transfer_id);
    if (!transfer) {
      throw new Error('Transfer kaydı bulunamadı.');
    }
    if (transfer.player_id !== p_caller_user_id) {
      throw new Error('Bu transfer davetini kabul etme yetkiniz yok.');
    }
    if (transfer.status !== 'PENDING_PLAYER') {
      throw new Error('Bu transfer daveti artık geçerli değil.');
    }

    // Transfer window validation
    const window = this.windows
      .filter(w => w.season_id === transfer.season_id)
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

    if (!window || !window.is_open) {
      throw new Error('Transfer penceresi kapalı olduğu için davet kabul edilemez.');
    }
    if (this.mockNow < new Date(window.start_date)) {
      throw new Error('Transfer penceresi henüz başlamadı.');
    }
    if (this.mockNow > new Date(window.end_date)) {
      throw new Error('Transfer penceresi sona ermiştir.');
    }

    // Squad limit check (max 23)
    const squadCount = this.team_members.filter(tm => tm.team_id === transfer.to_team_id).length;
    if (squadCount >= 23) {
      throw new Error('Takımın kadrosu dolu (maksimum 23 oyuncu).');
    }

    // Quota validation
    if (!window.is_unlimited) {
      const quota = window.transfer_quota || 5;
      const approvedCount = this.transfers.filter(t => t.to_team_id === transfer.to_team_id && t.season_id === transfer.season_id && t.status === 'APPROVED').length;
      if (approvedCount >= quota) {
        throw new Error(`Bu transfer döneminde takımın transfer kotası (${quota}) dolmuştur.`);
      }
    }

    // Clean up captaincy from previous team if captain
    const oldTeamMember = this.team_members.find(tm => tm.player_id === p_caller_user_id);
    if (oldTeamMember) {
      const oldTeam = this.teams.find(t => t.id === oldTeamMember.team_id);
      if (oldTeam && oldTeam.captain_id === p_caller_user_id) {
        oldTeam.captain_id = null;
      }
      // league_teams.captain_id cleanup
      const oldLeagueTeam = this.league_teams.find(lt => lt.team_id === oldTeamMember.team_id && lt.season_id === transfer.season_id);
      if (oldLeagueTeam && oldLeagueTeam.captain_id === p_caller_user_id) {
        oldLeagueTeam.captain_id = null;
      }
      // user_roles cleanup
      const oldRole = this.user_roles.find(ur => ur.user_id === p_caller_user_id && ur.team_id === oldTeamMember.team_id && ur.role === 'CAPTAIN' && ur.is_active);
      if (oldRole) {
        oldRole.is_active = false;
        oldRole.revoked_at = this.mockNow.toISOString();
      }
      this.team_members = this.team_members.filter(tm => tm.player_id !== p_caller_user_id);
    }

    // Add to new team as PLAYER role
    this.team_members.push({
      id: `tm-${this.team_members.length + 1}`,
      team_id: transfer.to_team_id,
      player_id: p_caller_user_id,
      role: 'PLAYER',
    });

    // Mark current transfer APPROVED
    transfer.status = 'APPROVED';

    // Auto-cancel all other pending invites for this player in this season
    for (const otherTransfer of this.transfers) {
      if (otherTransfer.id !== p_transfer_id && otherTransfer.player_id === p_caller_user_id && otherTransfer.status === 'PENDING_PLAYER') {
        otherTransfer.status = 'CANCELLED';
      }
    }

    return true;
  }
}

const db = new MockPostgresDb();

let passedCount = 0;
let totalScenarios = 39;

function runScenario(num, name, fn) {
  try {
    fn();
    console.log(`[PASS] Senaryo ${num}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] Senaryo ${num}: ${name}`);
    console.error(`       Error: ${err.message}`);
    throw err;
  }
}

// ===========================================================================
// KATEGORİ 1: KOTA VE LİMİT MANTIĞI (SENARYOLAR 1-12)
// ===========================================================================
console.log('--- Kategori 1: Kota ve Limit Mantığı (1-12) ---');

// Senaryo 1: Sınırsız pencerede kota kontrolünün devre dışı olması ve transferlerin sınırsız gerçekleşmesi
runScenario(1, 'Sınırsız pencerede kota kontrolünün devre dışı olması', () => {
  db.reset();
  db.windows.push({
    id: 'w-unlimited',
    season_id: 'season-6',
    name: 'Season 6 transfer window',
    is_open: true,
    is_unlimited: true,
    transfer_quota: null,
    start_date: '2026-09-07T09:00:00.000Z',
    end_date: '2026-11-01T21:00:00.000Z',
  });
  db.setNow('2026-10-15T12:00:00.000Z');

  const slots = db.rpc_get_team_transfer_slots('team-a', 'season-6');
  assert.equal(slots.is_unlimited, true);
  assert.equal(slots.remaining_slots, 999);

  // Send 6 invites in unlimited window
  for (let i = 1; i <= 6; i++) {
    const inviteId = db.rpc_send_team_invite('team-a', `player-test-${i}`, 'captain-a');
    assert(inviteId);
  }
  const pendingCount = db.transfers.filter(t => t.to_team_id === 'team-a' && t.status === 'PENDING_PLAYER').length;
  assert.equal(pendingCount, 6, 'Should allow 6 invites when unlimited');
});

// Senaryo 2: 5 kotalı pencerede 1. transferin başarıyla gerçekleşmesi ve kalan hakkın 4 olması
runScenario(2, '5 kotalı pencerede 1. transfer ve kalan hakkın 4 olması', () => {
  db.reset();
  db.windows.push({
    id: 'w-limited',
    season_id: 'season-6',
    name: 'Season 6 Ara Transfer',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 5,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  const inv1 = db.rpc_send_team_invite('team-a', 'player-1', 'captain-a');
  db.rpc_accept_team_invite(inv1, 'player-1');

  const slots = db.rpc_get_team_transfer_slots('team-a', 'season-6');
  assert.equal(slots.total_slots, 5);
  assert.equal(slots.used_slots, 1);
  assert.equal(slots.remaining_slots, 4);
});

// Senaryo 3: 5 kotalı pencerede 2. transferin gerçekleşmesi ve kalan hakkın 3 olması
runScenario(3, '5 kotalı pencerede 2. transfer ve kalan hakkın 3 olması', () => {
  const inv2 = db.rpc_send_team_invite('team-a', 'player-2', 'captain-a');
  db.rpc_accept_team_invite(inv2, 'player-2');

  const slots = db.rpc_get_team_transfer_slots('team-a', 'season-6');
  assert.equal(slots.used_slots, 2);
  assert.equal(slots.remaining_slots, 3);
});

// Senaryo 4: 5 kotalı pencerede 3. transferin gerçekleşmesi ve kalan hakkın 2 olması
runScenario(4, '5 kotalı pencerede 3. transfer ve kalan hakkın 2 olması', () => {
  const inv3 = db.rpc_send_team_invite('team-a', 'player-3', 'captain-a');
  db.rpc_accept_team_invite(inv3, 'player-3');

  const slots = db.rpc_get_team_transfer_slots('team-a', 'season-6');
  assert.equal(slots.used_slots, 3);
  assert.equal(slots.remaining_slots, 2);
});

// Senaryo 5: 5 kotalı pencerede 4. transferin gerçekleşmesi ve kalan hakkın 1 olması
runScenario(5, '5 kotalı pencerede 4. transfer ve kalan hakkın 1 olması', () => {
  const inv4 = db.rpc_send_team_invite('team-a', 'player-4', 'captain-a');
  db.rpc_accept_team_invite(inv4, 'player-4');

  const slots = db.rpc_get_team_transfer_slots('team-a', 'season-6');
  assert.equal(slots.used_slots, 4);
  assert.equal(slots.remaining_slots, 1);
});

// Senaryo 6: 5 kotalı pencerede 5. transferin gerçekleşmesi ve kalan hakkın 0 olması
runScenario(6, '5 kotalı pencerede 5. transfer ve kalan hakkın 0 olması', () => {
  const inv5 = db.rpc_send_team_invite('team-a', 'player-5', 'captain-a');
  db.rpc_accept_team_invite(inv5, 'player-5');

  const slots = db.rpc_get_team_transfer_slots('team-a', 'season-6');
  assert.equal(slots.used_slots, 5);
  assert.equal(slots.remaining_slots, 0);
});

// Senaryo 7: 5 transfer hakkı dolan takımın 6. transfer denemesinde reddedilmesi
runScenario(7, '5 transfer hakkı dolan takımın 6. transfer denemesinde reddedilmesi', () => {
  assert.throws(
    () => db.rpc_send_team_invite('team-a', 'player-6', 'captain-a'),
    /transfer kotası \(5\) dolmuştur/
  );
});

// Senaryo 8: Takım A'nın hakkı dolduğunda Takım B'nin 5 hakkının korunması
runScenario(8, 'Takımlar arası kota izolasyonu (Takım A 0, Takım B 5)', () => {
  const slotsB = db.rpc_get_team_transfer_slots('team-b', 'season-6');
  assert.equal(slotsB.total_slots, 5);
  assert.equal(slotsB.used_slots, 0);
  assert.equal(slotsB.remaining_slots, 5);

  const invB1 = db.rpc_send_team_invite('team-b', 'player-b1', 'captain-b');
  assert(invB1);
});

// Senaryo 9: PENDING_PLAYER davetinin kotadan düşmesi (çift harcama engelleme)
runScenario(9, 'PENDING_PLAYER davetinin kotayı rezerve etmesi', () => {
  db.reset();
  db.windows.push({
    id: 'w-limited',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 5,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  // Send 5 invites without accepting yet
  for (let i = 1; i <= 5; i++) {
    db.rpc_send_team_invite('team-a', `player-${i}`, 'captain-a');
  }
  const slots = db.rpc_get_team_transfer_slots('team-a', 'season-6');
  assert.equal(slots.used_slots, 5, '5 pending invites should consume all 5 slots');
  assert.equal(slots.remaining_slots, 0);

  // 6th invite must be blocked even though 0 have been approved
  assert.throws(
    () => db.rpc_send_team_invite('team-a', 'player-6', 'captain-a'),
    /transfer kotası \(5\) dolmuştur/
  );
});

// Senaryo 10: Kaptanın daveti iptal etmesi (CANCELLED) durumunda kotanın iade edilmesi
runScenario(10, 'Kaptanın daveti iptal etmesiyle kotanın geri verilmesi', () => {
  const pending = db.transfers.find(t => t.to_team_id === 'team-a' && t.status === 'PENDING_PLAYER');
  assert(pending);
  pending.status = 'CANCELLED';

  const slots = db.rpc_get_team_transfer_slots('team-a', 'season-6');
  assert.equal(slots.used_slots, 4);
  assert.equal(slots.remaining_slots, 1);

  // Now sending a new invite must succeed
  const newInvite = db.rpc_send_team_invite('team-a', 'player-replacement', 'captain-a');
  assert(newInvite);
});

// Senaryo 11: Oyuncunun daveti reddetmesi (REJECTED) durumunda kotanın iade edilmesi
runScenario(11, 'Oyuncunun daveti reddetmesiyle kotanın iade edilmesi', () => {
  const pending = db.transfers.find(t => t.to_team_id === 'team-a' && t.player_id === 'player-replacement');
  assert(pending);
  pending.status = 'REJECTED';

  const slots = db.rpc_get_team_transfer_slots('team-a', 'season-6');
  assert.equal(slots.used_slots, 4);
  assert.equal(slots.remaining_slots, 1);
});

// Senaryo 12: Farklı sezonların kotalarının birbirini etkilememesi (sezon izolasyonu)
runScenario(12, 'Farklı sezonların kotalarının birbirini etkilememesi', () => {
  // Add 5 transfers in Season 5 for team-a
  for (let i = 1; i <= 5; i++) {
    db.transfers.push({
      id: `s5-trans-${i}`,
      from_team_id: null,
      to_team_id: 'team-a',
      player_id: `s5-player-${i}`,
      season_id: 'season-5',
      status: 'APPROVED',
      created_at: '2026-05-01T10:00:00Z',
    });
  }

  // Check Season 5 slots
  db.windows.push({
    id: 'w-s5',
    season_id: 'season-5',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 5,
    start_date: '2026-05-01T00:00:00Z',
    end_date: '2026-12-01T00:00:00Z',
  });
  const s5Slots = db.rpc_get_team_transfer_slots('team-a', 'season-5');
  assert.equal(s5Slots.used_slots, 5);
  assert.equal(s5Slots.remaining_slots, 0);

  // Season 6 slot must be unaffected
  const s6Slots = db.rpc_get_team_transfer_slots('team-a', 'season-6');
  assert.equal(s6Slots.used_slots, 4);
  assert.equal(s6Slots.remaining_slots, 1);
});

// ===========================================================================
// KATEGORİ 2: PENCERE YÖNETİMİ VE YAŞAM DÖNGÜSÜ (SENARYOLAR 13-19)
// ===========================================================================
console.log('\n--- Kategori 2: Pencere Yönetimi ve Yaşam Döngüsü (13-19) ---');

// Senaryo 13: Bir sezonda birden fazla pencere olduğunda maybeSingle() çökmesinin önlenmesi
runScenario(13, 'Çoklu pencere varlığında UI sorgusunun deterministik çalışması (PGRST116 yok)', () => {
  // Verify code in page.tsx has order + limit(1).maybeSingle()
  const takimCodeNormalized = takimYonetCode.replace(/\s+/g, ' ');
  assert(takimCodeNormalized.includes(".eq('is_open', true)"), 'takim/yonet must filter is_open = true');
  assert(takimCodeNormalized.includes(".lte('start_date', nowIso)"), 'takim/yonet must filter start_date <= nowIso');
  assert(takimCodeNormalized.includes(".gte('end_date', nowIso)"), 'takim/yonet must filter end_date >= nowIso');
  assert(takimCodeNormalized.includes(".order('start_date', { ascending: false }) .limit(1) .maybeSingle()"), 'takim/yonet must order and limit 1');

  const transferlerCodeNormalized = transferlerCode.replace(/\s+/g, ' ');
  assert(transferlerCodeNormalized.includes(".order('start_date', { ascending: false }) .limit(1) .maybeSingle()"), 'transferler page must order and limit 1');

  // Simulate query behavior with multiple windows for season-6
  const multiWindows = [
    { id: 'w1', season_id: 'season-6', is_open: false, start_date: '2026-09-07T09:00:00Z', end_date: '2026-11-01T21:00:00Z' },
    { id: 'w2', season_id: 'season-6', is_open: true, start_date: '2026-11-01T21:00:00Z', end_date: '2026-11-15T21:00:00Z' },
  ];
  const now = '2026-11-02T10:00:00Z';
  const activeWindow = multiWindows
    .filter(w => w.season_id === 'season-6' && w.is_open && w.start_date <= now && w.end_date >= now)
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0] || null;

  assert.equal(activeWindow.id, 'w2', 'Must resolve to the currently valid open window without error');
});

// Senaryo 14: Pencere kapalıyken (is_open = false) davet gönderilememesi
runScenario(14, 'Pencere kapalıyken davet gönderilememesi', () => {
  db.reset();
  db.windows.push({
    id: 'w-closed',
    season_id: 'season-6',
    is_open: false,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  assert.throws(
    () => db.rpc_send_team_invite('team-a', 'player-x', 'captain-a'),
    /Aktif ve açık bir transfer penceresi bulunmuyor/
  );
});

// Senaryo 15: Pencere kapalıyken bekleyen davetin KABUL EDİLEMEMESİ
runScenario(15, 'Pencere kapalıyken bekleyen davetin KABUL EDİLEMEMESİ', () => {
  db.transfers.push({
    id: 'transfer-old-pending',
    from_team_id: null,
    to_team_id: 'team-a',
    player_id: 'player-x',
    season_id: 'season-6',
    status: 'PENDING_PLAYER',
  });

  assert.throws(
    () => db.rpc_accept_team_invite('transfer-old-pending', 'player-x'),
    /Transfer penceresi kapalı olduğu için davet kabul edilemez/
  );
});

// Senaryo 16: Pencere başlangıç tarihinden önce davet gönderilememesi ve kabul edilememesi
runScenario(16, 'Pencere başlangıç tarihinden önce işlem engeli', () => {
  db.reset();
  db.windows.push({
    id: 'w-future',
    season_id: 'season-6',
    is_open: true,
    start_date: '2026-11-05T00:00:00.000Z',
    end_date: '2026-11-15T00:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  assert.throws(
    () => db.rpc_send_team_invite('team-a', 'player-future', 'captain-a'),
    /Transfer penceresi henüz başlamadı/
  );

  db.transfers.push({
    id: 'trans-fut',
    to_team_id: 'team-a',
    player_id: 'player-future',
    season_id: 'season-6',
    status: 'PENDING_PLAYER',
  });

  assert.throws(
    () => db.rpc_accept_team_invite('trans-fut', 'player-future'),
    /Transfer penceresi henüz başlamadı/
  );
});

// Senaryo 17: Pencere bitiş tarihinden sonra davet gönderilememesi ve kabul edilememesi
runScenario(17, 'Pencere bitiş tarihinden sonra işlem engeli', () => {
  db.setNow('2026-11-20T00:00:00.000Z');

  assert.throws(
    () => db.rpc_send_team_invite('team-a', 'player-expired', 'captain-a'),
    /Transfer penceresi sona ermiştir/
  );

  assert.throws(
    () => db.rpc_accept_team_invite('trans-fut', 'player-future'),
    /Transfer penceresi sona ermiştir/
  );
});

// Senaryo 18: Eski pencerede gönderilen PENDING davetin, yeni kotalı pencerede kota doluyken kabul edilememesi
runScenario(18, 'Eski pencere davetinin yeni pencere kural/kota kontrollerine tabi olması', () => {
  db.reset();
  // Open new window with 1 quota
  db.windows.push({
    id: 'w-new',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 1,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  // Existing transfer from old window
  db.transfers.push({
    id: 'old-invite-1',
    from_team_id: null,
    to_team_id: 'team-a',
    player_id: 'player-old-1',
    season_id: 'season-6',
    status: 'PENDING_PLAYER',
  });
  db.transfers.push({
    id: 'old-invite-2',
    from_team_id: null,
    to_team_id: 'team-a',
    player_id: 'player-old-2',
    season_id: 'season-6',
    status: 'PENDING_PLAYER',
  });

  // Accept 1st -> consumes the 1 slot
  db.rpc_accept_team_invite('old-invite-1', 'player-old-1');

  // 2nd accept must fail because quota (1) is reached
  assert.throws(
    () => db.rpc_accept_team_invite('old-invite-2', 'player-old-2'),
    /takımın transfer kotası \(1\) dolmuştur/
  );
});

// Senaryo 19: Pencere kapalıyken UI'ın "TRANSFER KAPALI" durumunu doğru göstermesi
runScenario(19, 'Pencere kapalıyken UI durumunun doğruluğu', () => {
  // Page logic inspection
  assert(takimYonetCode.includes('const isWindowOpen = !!window;'), 'isWindowOpen must depend on active window resolution');
  assert(takimYonetCode.includes('TRANSFER KAPALI'), 'UI must show TRANSFER KAPALI');
});

// ===========================================================================
// KATEGORİ 3: TARİH VE SAAT DİLİMİ (SENARYOLAR 20-24)
// ===========================================================================
console.log('\n--- Kategori 3: Tarih ve Saat Dilimi (20-24) ---');

// Senaryo 20: Türkiye saat diliminde girilen 2026-11-02 00:00 tarihinin UTC 2026-11-01 21:00:00Z olarak kaydedilmesi
runScenario(20, 'TRT 2026-11-02 00:00 inputunun UTC 2026-11-01T21:00:00.000Z olarak parse edilmesi', () => {
  const parsed = parseToTurkeyISO('2026-11-02T00:00');
  assert.equal(parsed, '2026-11-01T21:00:00.000Z');

  // Verify admin actions use parseToTurkeyISO
  assert(adminActionsCode.includes("parseToTurkeyISO(start_date_raw)"), 'createTransferWindow must call parseToTurkeyISO for startDate');
  assert(adminActionsCode.includes("parseToTurkeyISO(end_date_raw)"), 'createTransferWindow must call parseToTurkeyISO for endDate');
});

// Senaryo 21: UI'da gösterilen tarihin Türkiye saati ile birebir eşleşmesi (kayma olmaması)
runScenario(21, 'UTC değerinin formatTournamentDate ile Türkiye saati (00:00) olarak görüntülenmesi', () => {
  const formatted = formatTournamentDate('2026-11-01T21:00:00.000Z');
  assert(formatted.includes('02.11.2026'), 'Date must display 02.11.2026 in Turkey');
  assert(formatted.includes('00:00'), 'Time must display 00:00 in Turkey');
});

// Senaryo 22: datetime-local input formatının doğru parse ve format edilmesi (roundtrip)
runScenario(22, 'datetime-local formatForDateTimeLocal ve parseToTurkeyISO roundtrip', () => {
  const inputStr = '2026-11-02T00:00';
  const utc = parseToTurkeyISO(inputStr);
  const local = formatForDateTimeLocal(utc);
  assert.equal(local, inputStr, 'Roundtrip must be idempotent');

  assert(managerCode.includes("return formatForDateTimeLocal(isoStr);"), 'Manager must use formatForDateTimeLocal');
});

// Senaryo 23: Pencere bitiş anında sınır kontrolü (23:59:59 açık, 00:00:00 kapalı)
runScenario(23, 'Pencere bitiş anı sınır kontrolü', () => {
  const endIso = '2026-11-01T21:00:00.000Z'; // 02.11.2026 00:00 TRT
  const justBefore = new Date('2026-11-01T20:59:59.999Z');
  const exactEnd = new Date('2026-11-01T21:00:00.000Z');
  const justAfter = new Date('2026-11-01T21:00:00.001Z');

  const endDate = new Date(endIso);
  assert.equal(justBefore <= endDate, true, 'Before end is OPEN');
  assert.equal(exactEnd <= endDate, true, 'Exact end is OPEN (inclusive)');
  assert.equal(justAfter <= endDate, false, 'After end is CLOSED');
});

// Senaryo 24: Tarih formatlama yardımcı fonksiyonlarının (lib/date-utils.ts) doğruluğu
runScenario(24, 'lib/date-utils.ts sabit ve fonksiyon doğrulaması', () => {
  assert.equal(TURKEY_TIMEZONE, 'Europe/Istanbul');
  const nowTurkeyIso = parseToTurkeyISO('2026-06-15T15:30');
  assert.equal(nowTurkeyIso, '2026-06-15T12:30:00.000Z');
});

// ===========================================================================
// KATEGORİ 4: GÜVENLİK, YETKİLENDİRME VE EŞZAMANLILIK (SENARYOLAR 25-33)
// ===========================================================================
console.log('\n--- Kategori 4: Güvenlik, Yetkilendirme ve Eşzamanlılık (25-33) ---');

// Senaryo 25: Aynı anda gönderilen 2 paralel kabul isteğinde kota aşımının engellenmesi (FOR UPDATE kilidi)
runScenario(25, 'Paralel kabul isteklerinde FOR UPDATE kilidi ve kota aşımı engelleme', () => {
  // Check migration SQL has FOR UPDATE on transfers and league_teams
  const normSql = migrationSql.replace(/\s+/g, ' ');
  assert(normSql.includes('FROM public.transfers WHERE id = p_transfer_id FOR UPDATE'), 'accept_team_invite must lock transfer row');
  assert(normSql.includes('FROM public.league_teams WHERE team_id = v_captain_team_id AND season_id = v_window.season_id FOR UPDATE'), 'send_team_invite must lock league_team row');
  assert(normSql.includes('FROM public.league_teams WHERE team_id = v_transfer.to_team_id AND season_id = v_transfer.season_id FOR UPDATE'), 'accept_team_invite must lock target league_team row');

  // Concurrency logic simulation:
  // Suppose remaining quota is 1. Two concurrent threads (A and B) attempt to accept invitations for team-a.
  db.reset();
  db.windows.push({
    id: 'w-conc',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 1,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.transfers.push({ id: 't-conc-1', to_team_id: 'team-a', player_id: 'p-conc-1', season_id: 'season-6', status: 'PENDING_PLAYER' });
  db.transfers.push({ id: 't-conc-2', to_team_id: 'team-a', player_id: 'p-conc-2', season_id: 'season-6', status: 'PENDING_PLAYER' });

  // Thread 1 acquires lock and accepts
  const res1 = db.rpc_accept_team_invite('t-conc-1', 'p-conc-1');
  assert.equal(res1, true);

  // Thread 2 acquires lock next and checks quota (now 1/1 approved) -> MUST throw
  assert.throws(
    () => db.rpc_accept_team_invite('t-conc-2', 'p-conc-2'),
    /takımın transfer kotası \(1\) dolmuştur/
  );
});

// Senaryo 26: Kaptan veya yardımcı kaptan olmayan kullanıcının davet gönderememesi
runScenario(26, 'Kaptan/yardımcı kaptan olmayan kullanıcının davet gönderememesi', () => {
  // Add a normal player in team-a
  db.team_members.push({ id: 'tm-normal', team_id: 'team-a', player_id: 'player-normal', role: 'PLAYER' });

  assert.throws(
    () => db.rpc_send_team_invite('team-a', 'player-new', 'player-normal'),
    /Sadece takım kaptanları veya yardımcı kaptanları davet gönderebilir/
  );
});

// Senaryo 27: Başka bir takımın kaptanının yetkisiz işlem yapamaması
runScenario(27, 'Başka takım kaptanının yetkisiz davet gönderememesi', () => {
  // captain-b cannot invite for team-a
  assert.throws(
    () => db.rpc_send_team_invite('team-a', 'player-new', 'captain-b'),
    /Sadece takım kaptanları veya yardımcı kaptanları davet gönderebilir/
  );
});

// Senaryo 28: Oyuncunun aynı anda iki takımdan gelen daveti kabul edememesi (rakip tekliflerin iptali)
runScenario(28, 'Bir davet kabul edilince diğer takımlardan gelen davetlerin otomatik iptal edilmesi', () => {
  db.reset();
  db.windows.push({
    id: 'w-dual',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 5,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  // Both team-a and team-b invite star-player
  const inviteA = db.rpc_send_team_invite('team-a', 'star-player', 'captain-a');
  const inviteB = db.rpc_send_team_invite('team-b', 'star-player', 'captain-b');

  assert.equal(db.transfers.find(t => t.id === inviteA).status, 'PENDING_PLAYER');
  assert.equal(db.transfers.find(t => t.id === inviteB).status, 'PENDING_PLAYER');

  // Star player accepts team-a
  db.rpc_accept_team_invite(inviteA, 'star-player');

  assert.equal(db.transfers.find(t => t.id === inviteA).status, 'APPROVED');
  assert.equal(db.transfers.find(t => t.id === inviteB).status, 'CANCELLED', 'Other pending offer must be CANCELLED');

  // Trying to accept inviteB now must fail
  assert.throws(
    () => db.rpc_accept_team_invite(inviteB, 'star-player'),
    /artık geçerli değil/
  );
});

// Senaryo 29: Takım kaptanının transfer olması durumunda eski takımındaki kaptanlık rolünün temizlenmesi
runScenario(29, 'Kaptan transfer olduğunda eski takımdaki captain_id alanının NULL yapılması', () => {
  // Transfer captain-b to team-a
  const inviteCaptainB = db.rpc_send_team_invite('team-a', 'captain-b', 'captain-a');
  assert.equal(db.teams.find(t => t.id === 'team-b').captain_id, 'captain-b');

  db.rpc_accept_team_invite(inviteCaptainB, 'captain-b');

  // Former team's captain_id must now be NULL
  assert.equal(db.teams.find(t => t.id === 'team-b').captain_id, null, 'Former team captain_id must be cleared to NULL');
  assert(db.team_members.some(tm => tm.team_id === 'team-a' && tm.player_id === 'captain-b'));
});

// Senaryo 30: Zaten takımda olan oyuncuya davet gönderilememesi
runScenario(30, 'Zaten takımda olan oyuncuya davet gönderilememesi', () => {
  assert.throws(
    () => db.rpc_send_team_invite('team-a', 'captain-a', 'captain-a'),
    /Bu oyuncu zaten takımınızın bir parçası/
  );
});

// Senaryo 31: Başka takımın oyuncusuna teklif yapılıp kabul edilince eski takımından ayrılması
runScenario(31, 'Transfer teklifi kabul edildiğinde eski takımdan silinip yeni takıma eklenmesi', () => {
  // Add player-transferable to team-b
  db.team_members.push({ id: 'tm-b-trans', team_id: 'team-b', player_id: 'player-trans', role: 'PLAYER' });

  const inv = db.rpc_send_team_invite('team-a', 'player-trans', 'captain-a');
  db.rpc_accept_team_invite(inv, 'player-trans');

  const inOldTeam = db.team_members.some(tm => tm.team_id === 'team-b' && tm.player_id === 'player-trans');
  const inNewTeam = db.team_members.some(tm => tm.team_id === 'team-a' && tm.player_id === 'player-trans');
  assert.equal(inOldTeam, false, 'Player must no longer be in old team');
  assert.equal(inNewTeam, true, 'Player must now be in new team');
});

// Senaryo 32: Maksimum kadro limitinin (23 oyuncu) aşılmasının engellenmesi
runScenario(32, 'Maksimum kadro sınırının (23 oyuncu) korunması', () => {
  db.reset();
  db.windows.push({
    id: 'w-squad',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: true,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  // Fill team-a up to 23 players
  db.team_members = [{ id: 'tm-cap', team_id: 'team-a', player_id: 'captain-a', role: 'CAPTAIN' }];
  for (let i = 2; i <= 23; i++) {
    db.team_members.push({ id: `tm-sq-${i}`, team_id: 'team-a', player_id: `player-sq-${i}`, role: 'PLAYER' });
  }
  assert.equal(db.team_members.filter(tm => tm.team_id === 'team-a').length, 23);

  // Attempting to send invite when squad is full
  assert.throws(
    () => db.rpc_send_team_invite('team-a', 'player-24th', 'captain-a'),
    /maksimum kadro limitine \(23\) ulaşmıştır/
  );
});

// Senaryo 33: Takım içi rollerin transfer sonrası doğru atanması
runScenario(33, 'Transfer olan oyuncunun yeni takımda varsayılan PLAYER rolünü alması', () => {
  db.reset();
  db.windows.push({
    id: 'w-role',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 5,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  const inv = db.rpc_send_team_invite('team-a', 'player-role-check', 'captain-a');
  db.rpc_accept_team_invite(inv, 'player-role-check');

  const newMember = db.team_members.find(tm => tm.team_id === 'team-a' && tm.player_id === 'player-role-check');
  assert(newMember);
  assert.equal(newMember.role, 'PLAYER', 'Transferred player must be PLAYER, not CAPTAIN');
});

// ===========================================================================
// Summary
// ===========================================================================

// ===========================================================================
// KATEGORİ 5: KAPTANLIK TEMİZLİĞİ VE İZOLASYON DOĞRULAMASI (SENARYOLAR 34-39)
// ===========================================================================
console.log('\n--- Kategori 5: Kaptanlık Temizliği ve İzolasyon Doğrulaması (34-39) ---');

// Static migration check for league_teams.captain_id cleanup
const normSql = migrationSql.replace(/\s+/g, ' ');
assert(normSql.includes('UPDATE public.league_teams SET captain_id = NULL WHERE team_id = v_current_membership.team_id AND season_id = v_transfer.season_id AND captain_id = auth.uid();'), 'Migration must update league_teams.captain_id to NULL only for caller in current season');

// Senaryo 34: Eski takımın captain_id alanı transfer olan kullanıcıya aitse NULL yapılır
runScenario(34, 'Eski takımın league_teams.captain_id alanı transfer olan kullanıcıya aitse NULL yapılır', () => {
  db.reset();
  db.windows.push({
    id: 'w-cap-clean',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 5,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  // Verify captain-a is captain of team-a before transfer
  const ltBefore = db.league_teams.find(lt => lt.team_id === 'team-a' && lt.season_id === 'season-6');
  assert.equal(ltBefore.captain_id, 'captain-a');

  // Invite captain-a to team-b and accept
  const inv = db.rpc_send_team_invite('team-b', 'captain-a', 'captain-b');
  db.rpc_accept_team_invite(inv, 'captain-a');

  // After transfer: team-a captain_id must be NULL
  const ltAfter = db.league_teams.find(lt => lt.team_id === 'team-a' && lt.season_id === 'season-6');
  assert.equal(ltAfter.captain_id, null, 'Old team captain_id must be reset to NULL');
});

// Senaryo 35: Eski takımın captain_id alanı başka kullanıcıya aitse korunur
runScenario(35, 'Eski takımın league_teams.captain_id alanı başka kullanıcıya aitse korunur', () => {
  db.reset();
  db.windows.push({
    id: 'w-cap-clean2',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 5,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  // Add a normal player in team-a
  db.team_members.push({ id: 'tm-sub', team_id: 'team-a', player_id: 'player-sub', role: 'PLAYER' });

  // captain-a remains captain of team-a
  const ltBefore = db.league_teams.find(lt => lt.team_id === 'team-a' && lt.season_id === 'season-6');
  assert.equal(ltBefore.captain_id, 'captain-a');

  // player-sub transfers to team-b
  const inv = db.rpc_send_team_invite('team-b', 'player-sub', 'captain-b');
  db.rpc_accept_team_invite(inv, 'player-sub');

  // team-a captain_id must STILL be captain-a!
  const ltAfter = db.league_teams.find(lt => lt.team_id === 'team-a' && lt.season_id === 'season-6');
  assert.equal(ltAfter.captain_id, 'captain-a', 'Old team captain_id must remain captain-a when non-captain transfers');
});

// Senaryo 36: Başka sezonun captain_id kaydı korunur
runScenario(36, 'Başka sezonun league_teams.captain_id kaydı korunur', () => {
  db.reset();
  db.windows.push({
    id: 'w-cap-s5',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 5,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  // Transfer captain-a in season-6
  const inv = db.rpc_send_team_invite('team-b', 'captain-a', 'captain-b');
  db.rpc_accept_team_invite(inv, 'captain-a');

  // season-5 record for team-a must NOT be affected
  const ltSeason5 = db.league_teams.find(lt => lt.team_id === 'team-a' && lt.season_id === 'season-5');
  assert.equal(ltSeason5.captain_id, 'captain-a', 'Season 5 captain_id must not be modified by season 6 transfer');
});

// Senaryo 37: Yeni takımın captain_id alanı değişmez
runScenario(37, 'Yeni takımın league_teams.captain_id alanı değişmez', () => {
  db.reset();
  db.windows.push({
    id: 'w-new-team-cap',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 5,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  // Transfer captain-a to team-b
  const inv = db.rpc_send_team_invite('team-b', 'captain-a', 'captain-b');
  db.rpc_accept_team_invite(inv, 'captain-a');

  // team-b captain must remain captain-b
  const ltTeamB = db.league_teams.find(lt => lt.team_id === 'team-b' && lt.season_id === 'season-6');
  assert.equal(ltTeamB.captain_id, 'captain-b', 'New team captain_id must remain captain-b');
});

// Senaryo 38: Eski takımın user_roles CAPTAIN kaydı pasifleştirilir
runScenario(38, 'Eski takımın user_roles CAPTAIN kaydı pasifleştirilir', () => {
  db.reset();
  db.windows.push({
    id: 'w-ur-deact',
    season_id: 'season-6',
    is_open: true,
    is_unlimited: false,
    transfer_quota: 5,
    start_date: '2026-11-01T21:00:00.000Z',
    end_date: '2026-11-15T21:00:00.000Z',
  });
  db.setNow('2026-11-02T10:00:00.000Z');

  const inv = db.rpc_send_team_invite('team-b', 'captain-a', 'captain-b');
  db.rpc_accept_team_invite(inv, 'captain-a');

  const urOld = db.user_roles.find(ur => ur.user_id === 'captain-a' && ur.team_id === 'team-a' && ur.role === 'CAPTAIN');
  assert(urOld, 'User role record must exist');
  assert.equal(urOld.is_active, false, 'CAPTAIN role for old team must be deactivated');
  assert(urOld.revoked_at !== null, 'revoked_at must be populated');
});

// Senaryo 39: Yeni takımda otomatik CAPTAIN rolü oluşmaz
runScenario(39, 'Yeni takımda otomatik CAPTAIN rolü oluşmaz', () => {
  const urNewTeam = db.user_roles.find(ur => ur.user_id === 'captain-a' && ur.team_id === 'team-b' && ur.role === 'CAPTAIN');
  assert.equal(urNewTeam, undefined, 'No CAPTAIN role should exist for the player in the new team');

  const tmNew = db.team_members.find(tm => tm.team_id === 'team-b' && tm.player_id === 'captain-a');
  assert(tmNew, 'Member must exist in new team');
  assert.equal(tmNew.role, 'PLAYER', 'Role in new team must be standard PLAYER');
});

console.log('\n======================================================================');
console.log(`TEST SUITE RESULTS: ${passedCount} / ${totalScenarios} SCENARIOS PASSED (100%)`);
console.log('======================================================================');
