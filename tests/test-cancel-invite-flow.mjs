import assert from 'node:assert/strict';

console.log('======================================================================');
console.log('TEST SUITE: CANCEL TEAM INVITE & SLOT RESTORATION FLOW');
console.log('======================================================================');

class MockDatabase {
  constructor() {
    this.activeSeason = { id: 'season-6', name: 'Season 6', status: 'ACTIVE' };
    this.window = {
      id: 'window-1',
      season_id: 'season-6',
      is_open: true,
      is_unlimited: false,
      start_date: new Date(Date.now() - 3600000).toISOString(),
      end_date: new Date(Date.now() + 3600000).toISOString(),
    };
    this.transfers = [];
    this.notifications = [];
    this.userRoles = [
      { user_id: 'captain-1', team_id: 'team-a', role: 'CAPTAIN', is_active: true },
      { user_id: 'co-captain-1', team_id: 'team-a', role: 'CAPTAIN', is_active: true },
      { user_id: 'stranger', team_id: 'team-b', role: 'CAPTAIN', is_active: true },
    ];
    this.profiles = [
      { id: 'captain-1', username: 'CaptainA', status: 'ACTIVE' },
      { user_id: 'co-captain-1', username: 'CoCaptainA', status: 'ACTIVE' },
      { id: 'player-1', username: 'Striker9', status: 'ACTIVE' },
      { id: 'stranger', username: 'OtherCaptain', status: 'ACTIVE' },
    ];
  }

  getSlots(teamId) {
    const used = this.transfers.filter(
      t => t.to_team_id === teamId &&
           t.transfer_window_id === this.window.id &&
           ['APPROVED', 'PENDING_PLAYER'].includes(t.status)
    ).length;

    return {
      total: 5,
      used,
      remaining: Math.max(0, 5 - used),
    };
  }

  sendInvite(teamId, playerId, requestedBy) {
    const slots = this.getSlots(teamId);
    if (slots.remaining <= 0) {
      throw new Error('Transfer kotanız dolmuştur (Maksimum 5 transfer).');
    }

    const transferId = 'tx-' + (this.transfers.length + 1);
    this.transfers.push({
      id: transferId,
      transfer_window_id: this.window.id,
      season_id: this.activeSeason.id,
      player_id: playerId,
      to_team_id: teamId,
      requested_by: requestedBy,
      status: 'PENDING_PLAYER',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    this.notifications.push({
      id: 'notif-' + (this.notifications.length + 1),
      reference_id: transferId,
      type: 'TRANSFER_OFFER',
      user_id: playerId,
      is_read: false,
    });

    return transferId;
  }

  cancelInvite(transferId, callerId) {
    const transfer = this.transfers.find(t => t.id === transferId);
    if (!transfer) throw new Error('Transfer not found');

    const isRequester = transfer.requested_by === callerId;
    const isTeamCaptain = this.userRoles.some(
      ur => ur.user_id === callerId && ur.team_id === transfer.to_team_id && ur.role === 'CAPTAIN' && ur.is_active
    );
    const isAdmin = this.userRoles.some(
      ur => ur.user_id === callerId && ['ADMIN', 'SUPER_ADMIN'].includes(ur.role) && ur.is_active
    );

    if (!isRequester && !isTeamCaptain && !isAdmin) {
      throw new Error('Unauthorized: Not your invite');
    }

    if (transfer.status !== 'PENDING_PLAYER') {
      throw new Error('Invite cannot be cancelled at this state.');
    }

    transfer.status = 'CANCELLED';
    transfer.updated_at = new Date().toISOString();

    const notif = this.notifications.find(
      n => n.reference_id === transferId && n.type === 'TRANSFER_OFFER' && n.user_id === transfer.player_id
    );
    if (notif) notif.is_read = true;

    return true;
  }
}

// Scenario 1: Initial state has 5 slots remaining
const db = new MockDatabase();
let slots = db.getSlots('team-a');
assert.equal(slots.remaining, 5, 'Initial slots must be 5');
console.log('[PASS] Test 1: Başlangıç transfer slotu 5/5');

// Scenario 2: Captain sends invite -> remaining drops to 4
const tx1 = db.sendInvite('team-a', 'player-1', 'captain-1');
slots = db.getSlots('team-a');
assert.equal(slots.used, 1, 'Used slots must be 1');
assert.equal(slots.remaining, 4, 'Remaining slots must be 4');
console.log('[PASS] Test 2: Teklif gönderildiğinde slot 4/5 oldu (1 rezerve edildi)');

// Scenario 3: Unauthorized user (stranger) attempts to cancel -> rejected
assert.throws(() => {
  db.cancelInvite(tx1, 'stranger');
}, /Unauthorized: Not your invite/);
console.log('[PASS] Test 3: Yetkisiz kullanıcının teklifi geri çekmesi engellendi');

// Scenario 4: Co-captain can cancel the invite for their team
db.cancelInvite(tx1, 'co-captain-1');
assert.equal(db.transfers.find(t => t.id === tx1).status, 'CANCELLED');
console.log('[PASS] Test 4: Takım kaptanı teklifi geri çekti (status = CANCELLED)');

// Scenario 5: Slot is immediately refunded back to 5!
slots = db.getSlots('team-a');
assert.equal(slots.used, 0, 'Used slots must be 0 after cancellation');
assert.equal(slots.remaining, 5, 'Remaining slots must be back to 5');
console.log('[PASS] Test 5: Teklif geri çekilince transfer slotu derhal 5/5 seviyesine yükseldi (+1 iade)');

// Scenario 6: Player notification is marked as read
const notif = db.notifications.find(n => n.reference_id === tx1);
assert.equal(notif.is_read, true, 'Player notification must be marked as read');
console.log('[PASS] Test 6: Oyuncunun gelen kutusundaki davet bildirimi okundu olarak işaretlendi');

// Scenario 7: Cannot cancel an already cancelled invite
assert.throws(() => {
  db.cancelInvite(tx1, 'captain-1');
}, /Invite cannot be cancelled at this state/);
console.log('[PASS] Test 7: Zaten iptal edilmiş bir teklif tekrar geri çekilemez');

// Scenario 8: Exhausting 5 invites, cancelling 1, sending another succeeds
const txIds = [];
for (let i = 1; i <= 5; i++) {
  txIds.push(db.sendInvite('team-a', `player-test-${i}`, 'captain-1'));
}
slots = db.getSlots('team-a');
assert.equal(slots.remaining, 0, 'Remaining slots must be 0 after 5 invites');
assert.throws(() => {
  db.sendInvite('team-a', 'player-overflow', 'captain-1');
}, /Transfer kotanız dolmuştur/);

// Cancel the 3rd invite
db.cancelInvite(txIds[2], 'captain-1');
slots = db.getSlots('team-a');
assert.equal(slots.remaining, 1, 'Remaining slots must be 1 after cancelling 1 invite');

// Sending new invite now succeeds
const newTx = db.sendInvite('team-a', 'player-overflow', 'captain-1');
assert(newTx);
slots = db.getSlots('team-a');
assert.equal(slots.remaining, 0, 'Remaining slots back to 0 after replacement invite');
console.log('[PASS] Test 8: 5 kota doluyken geri çekilen teklifin yerine yeni davet başarıyla gönderildi');

console.log('======================================================================');
console.log('ALL 8 CANCEL INVITE & SLOT RESTORATION TESTS PASSED (100%)');
console.log('======================================================================');
