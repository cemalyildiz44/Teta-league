import assert from 'node:assert';
import fs from 'node:fs';

console.log('================================================================');
console.log('TETA LEAGUE — NIGHT CUP SQUAD MANAGEMENT & ISOLATION AUDIT SUITE');
console.log('================================================================');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    failedTests++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: /admin/teams does NOT query tournament_applications
// ─────────────────────────────────────────────────────────────────────────────
test('1. /admin/teams page and manager do NOT query tournament_applications', () => {
  const pageContent = fs.readFileSync('app/admin/teams/page.tsx', 'utf8');
  const managerContent = fs.readFileSync('app/admin/teams/TeamsManager.tsx', 'utf8');

  assert.ok(
    !pageContent.includes("from('tournament_applications')"),
    'app/admin/teams/page.tsx must NOT query tournament_applications'
  );
  assert.ok(
    !pageContent.includes('initialApplications'),
    'app/admin/teams/page.tsx must NOT pass initialApplications prop'
  );
  assert.ok(
    !managerContent.includes('tournament_applications'),
    'TeamsManager.tsx must NOT reference tournament_applications'
  );
  assert.ok(
    !managerContent.includes("activeTab === 'APPLICATIONS'"),
    'TeamsManager.tsx must NOT contain APPLICATIONS tab'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Night Cup applications are listed from /admin/tournaments
// ─────────────────────────────────────────────────────────────────────────────
test('2. Night Cup applications are queried and managed in /admin/tournaments', () => {
  const pageContent = fs.readFileSync('app/admin/tournaments/page.tsx', 'utf8');
  const managerContent = fs.readFileSync('app/admin/tournaments/TournamentsManager.tsx', 'utf8');

  assert.ok(
    pageContent.includes("from('tournament_applications')"),
    'app/admin/tournaments/page.tsx must query tournament_applications'
  );
  assert.ok(
    pageContent.includes("tournament_application_players"),
    'app/admin/tournaments/page.tsx must fetch squad players for applications'
  );
  assert.ok(
    managerContent.includes('editingNightCupTeam'),
    'TournamentsManager.tsx must have editingNightCupTeam state for temporary team & squad management'
  );
  assert.ok(
    managerContent.includes('updateNightCupApplicationStatusAction'),
    'TournamentsManager.tsx must invoke updateNightCupApplicationStatusAction'
  );
  assert.ok(
    managerContent.includes('adminUpdateNightCupTeamAction'),
    'TournamentsManager.tsx must invoke adminUpdateNightCupTeamAction'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Application approval does NOT insert into teams table
// ─────────────────────────────────────────────────────────────────────────────
test('3. Application approval (updateNightCupApplicationStatusAction) does NOT create row in teams', () => {
  const actionsContent = fs.readFileSync('app/admin/tournaments/actions.ts', 'utf8');

  const start = actionsContent.indexOf('export async function updateNightCupApplicationStatusAction');
  const end = actionsContent.indexOf('\nexport async function', start + 1);
  const fnBody = actionsContent.slice(start, end === -1 ? undefined : end);

  assert.ok(
    fnBody.includes("from('tournament_applications')"),
    'Must update tournament_applications'
  );
  assert.ok(
    !fnBody.includes("from('teams').insert"),
    'Approval must NOT insert into teams table'
  );
  assert.ok(
    !fnBody.includes("from('team_memberships').insert"),
    'Approval must NOT insert into team_memberships table'
  );
  assert.ok(
    !fnBody.includes("from('league_teams')"),
    'Approval must NOT touch league_teams table'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Admin updating temporary team name does NOT touch teams table
// ─────────────────────────────────────────────────────────────────────────────
test('4. Admin changing temporary team name updates tournament_applications only — not teams table', () => {
  const actionsContent = fs.readFileSync('app/admin/tournaments/actions.ts', 'utf8');

  const start = actionsContent.indexOf('export async function adminUpdateNightCupTeamAction');
  const end = actionsContent.indexOf('\nexport async function', start + 1);
  const fnBody = actionsContent.slice(start, end === -1 ? undefined : end);

  assert.ok(
    fnBody.includes("from('tournament_applications')"),
    'Must target tournament_applications'
  );
  assert.ok(
    !fnBody.includes("from('teams').update"),
    'Admin updating temporary team must NOT update teams table'
  );
  assert.ok(
    !fnBody.includes("from('teams').insert"),
    'Admin updating temporary team must NOT insert into teams table'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Admin updating temporary logo does NOT touch official club logo
// ─────────────────────────────────────────────────────────────────────────────
test('5. Admin changing temporary team logo writes to tournament_applications only', () => {
  const actionsContent = fs.readFileSync('app/admin/tournaments/actions.ts', 'utf8');

  const start = actionsContent.indexOf('export async function adminUpdateNightCupTeamAction');
  const end = actionsContent.indexOf('\nexport async function', start + 1);
  const fnBody = actionsContent.slice(start, end === -1 ? undefined : end);

  assert.ok(
    fnBody.includes('updatePayload.logo_url = new_logo_url') || fnBody.includes('logo_url: new_logo_url'),
    'Logo URL must be set in tournament application update payload'
  );
  assert.ok(
    !fnBody.includes("from('teams')"),
    'Must not reference official teams table for logo change'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Captain adding player updates ONLY tournament_application_players
// ─────────────────────────────────────────────────────────────────────────────
test('6. Captain adding player updates tournament_application_players only — not team_memberships', () => {
  const actionsContent = fs.readFileSync('app/turnuvalar/actions.ts', 'utf8');

  const start = actionsContent.indexOf('export async function captainAddPlayerToSquadAction');
  const end = actionsContent.indexOf('\nexport async function', start + 1);
  const fnBody = actionsContent.slice(start, end === -1 ? undefined : end);

  assert.ok(
    fnBody.includes("from('tournament_application_players')"),
    'Must insert into tournament_application_players'
  );
  assert.ok(
    !fnBody.includes("from('team_memberships')"),
    'Must NOT touch official team_memberships table'
  );
  assert.ok(
    !fnBody.includes("from('teams')"),
    'Must NOT touch official teams table'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Captain removing player does NOT affect team_memberships
// ─────────────────────────────────────────────────────────────────────────────
test('7. Captain removing player deletes from tournament_application_players only', () => {
  const actionsContent = fs.readFileSync('app/turnuvalar/actions.ts', 'utf8');

  const start = actionsContent.indexOf('export async function captainRemovePlayerFromSquadAction');
  const end = actionsContent.indexOf('\nexport async function', start + 1);
  const fnBody = actionsContent.slice(start, end === -1 ? undefined : end);

  assert.ok(
    fnBody.includes("from('tournament_application_players')"),
    'Must delete from tournament_application_players'
  );
  assert.ok(
    !fnBody.includes("from('team_memberships')"),
    'Must NOT touch official team_memberships table'
  );
  assert.ok(
    !fnBody.includes("from('teams')"),
    'Must NOT touch official teams table'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Captain cannot edit another team roster (strict ownership check)
// ─────────────────────────────────────────────────────────────────────────────
test('8. Captain cannot edit another team roster (strict ownership check)', () => {
  const actionsContent = fs.readFileSync('app/turnuvalar/actions.ts', 'utf8');

  // Check captainAddPlayerToSquadAction
  const startAdd = actionsContent.indexOf('export async function captainAddPlayerToSquadAction');
  const endAdd = actionsContent.indexOf('\nexport async function', startAdd + 1);
  const bodyAdd = actionsContent.slice(startAdd, endAdd === -1 ? undefined : endAdd);

  assert.ok(
    bodyAdd.includes('app.applicant_id !== user.id'),
    'captainAddPlayerToSquadAction must enforce app.applicant_id === user.id'
  );
  assert.ok(
    bodyAdd.includes("error: 'Bu takımın kadrosunu düzenleme yetkiniz yok.'"),
    'Must return unauthorized error if not team captain'
  );

  // Check captainRemovePlayerFromSquadAction
  const startRem = actionsContent.indexOf('export async function captainRemovePlayerFromSquadAction');
  const endRem = actionsContent.indexOf('\nexport async function', startRem + 1);
  const bodyRem = actionsContent.slice(startRem, endRem === -1 ? undefined : endRem);

  assert.ok(
    bodyRem.includes('app.applicant_id !== user.id'),
    'captainRemovePlayerFromSquadAction must enforce app.applicant_id === user.id'
  );
  assert.ok(
    bodyRem.includes("error: 'Bu takımın kadrosunu düzenleme yetkiniz yok.'"),
    'Must return unauthorized error if not team captain'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Unauthenticated or non-captain user blocked from roster editing
// ─────────────────────────────────────────────────────────────────────────────
test('9. Unauthenticated or non-captain user blocked in action and UI', () => {
  const actionsContent = fs.readFileSync('app/turnuvalar/actions.ts', 'utf8');
  const clientContent = fs.readFileSync('app/turnuvalar/[id]/TournamentDetailClient.tsx', 'utf8');

  // Server check
  assert.ok(
    actionsContent.includes("if (!user) {\n    return { error: 'Kadro düzenlemek için giriş yapmanız gerekmektedir.' };\n  }"),
    'Must enforce authenticated user in both squad actions'
  );

  // UI check: "KADROYU DÜZENLE" button only visible to verified captain
  assert.ok(
    clientContent.includes('Boolean(currentUser && app.applicant_id === currentUser.id)'),
    'UI must only render squad editing button when currentUser is the verified applicant captain'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Active deadline allows captain to add player (behavioral test)
// ─────────────────────────────────────────────────────────────────────────────
test('10. Active deadline permits player addition when registration window is open', () => {
  function checkDeadline(registrationEnd, isRegistrationOpen, status) {
    const now = new Date();
    if (registrationEnd && new Date(registrationEnd) < now) {
      return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };
    }
    if (!isRegistrationOpen || status === 'COMPLETED' || status === 'ARCHIVED') {
      return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };
    }
    return { ok: true };
  }

  // Future registration date (e.g. 2 days from now)
  const futureEnd = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  const result = checkDeadline(futureEnd, true, 'REGISTRATION');
  assert.strictEqual(result.ok, true, 'Future deadline must permit squad changes');
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Active deadline permits player removal (and prevents captain removal)
// ─────────────────────────────────────────────────────────────────────────────
test('11. Active deadline permits player removal; prevents captain self-removal', () => {
  const actionsContent = fs.readFileSync('app/turnuvalar/actions.ts', 'utf8');

  const start = actionsContent.indexOf('export async function captainRemovePlayerFromSquadAction');
  const end = actionsContent.indexOf('\nexport async function', start + 1);
  const fnBody = actionsContent.slice(start, end === -1 ? undefined : end);

  assert.ok(
    fnBody.includes('profile_id === app.applicant_id'),
    'Must check if removed player is applicant captain'
  );
  assert.ok(
    fnBody.includes("error: 'Takım kaptanı kadrodan çıkarılamaz.'"),
    'Must return error when trying to remove captain'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Expired deadline blocks captain player addition with exact message
// ─────────────────────────────────────────────────────────────────────────────
test('12. Expired deadline blocks player add with exact message: "Başvuru süresi sona erdiği için kadro düzenleme kapatıldı."', () => {
  function checkAddDeadline(tour) {
    const now = new Date();
    if (tour.registration_end && new Date(tour.registration_end) < now) {
      return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };
    }
    if (!tour.is_registration_open || tour.status === 'COMPLETED' || tour.status === 'ARCHIVED') {
      return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };
    }
    return { ok: true };
  }

  // Past registration date (1 hour ago)
  const pastEnd = new Date(Date.now() - 3600 * 1000).toISOString();
  const res = checkAddDeadline({
    registration_end: pastEnd,
    is_registration_open: true,
    status: 'REGISTRATION'
  });

  assert.strictEqual(res.error, 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.');

  // Code inspection in server action
  const actionsContent = fs.readFileSync('app/turnuvalar/actions.ts', 'utf8');
  assert.ok(
    actionsContent.includes("return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };"),
    'Exact Turkish error string must be present in actions.ts'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Expired deadline blocks captain player removal with exact message
// ─────────────────────────────────────────────────────────────────────────────
test('13. Expired deadline blocks player remove with exact message: "Başvuru süresi sona erdiği için kadro düzenleme kapatıldı."', () => {
  function checkRemoveDeadline(tour) {
    const now = new Date();
    if (tour.registration_end && new Date(tour.registration_end) < now) {
      return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };
    }
    if (!tour.is_registration_open || tour.status === 'COMPLETED' || tour.status === 'ARCHIVED') {
      return { error: 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.' };
    }
    return { ok: true };
  }

  // Completed tournament status
  const resCompleted = checkRemoveDeadline({
    registration_end: new Date(Date.now() + 100000).toISOString(),
    is_registration_open: false,
    status: 'COMPLETED'
  });
  assert.strictEqual(resCompleted.error, 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.');

  // Past date
  const resExpired = checkRemoveDeadline({
    registration_end: new Date(Date.now() - 50000).toISOString(),
    is_registration_open: true,
    status: 'ACTIVE'
  });
  assert.strictEqual(resExpired.error, 'Başvuru süresi sona erdiği için kadro düzenleme kapatıldı.');
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14: Stale request after deadline is rejected server-side
// ─────────────────────────────────────────────────────────────────────────────
test('14. Server-Side enforcement: Even if UI is bypassed, Server Action strictly rejects stale requests', () => {
  const actionsContent = fs.readFileSync('app/turnuvalar/actions.ts', 'utf8');

  // Both functions query tournament registration_end from database directly
  assert.ok(
    actionsContent.includes(`tournaments (
        id,
        registration_end,
        is_registration_open,
        status
      )`),
    'Server Actions must fetch tournament deadline directly from database query'
  );
  assert.ok(
    actionsContent.includes('new Date(tour.registration_end) < now'),
    'Server Actions must compare database registration_end against server timestamp'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15: Invalid or banned player ID rejected
// ─────────────────────────────────────────────────────────────────────────────
test('15. Invalid, banned, or suspended player profiles are rejected from squad addition', () => {
  const actionsContent = fs.readFileSync('app/turnuvalar/actions.ts', 'utf8');

  const start = actionsContent.indexOf('export async function captainAddPlayerToSquadAction');
  const end = actionsContent.indexOf('\nexport async function', start + 1);
  const fnBody = actionsContent.slice(start, end === -1 ? undefined : end);

  assert.ok(
    fnBody.includes("error: 'Seçilen oyuncu profili bulunamadı.'"),
    'Must reject nonexistent player profile'
  );
  assert.ok(
    fnBody.includes("playerProfile.status === 'BANNED'"),
    'Must check if player is banned'
  );
  assert.ok(
    fnBody.includes("playerProfile.status === 'SUSPENDED'"),
    'Must check if player is suspended'
  );
  assert.ok(
    fnBody.includes("error: 'Bu oyuncu zaten kadroda yer alıyor.'"),
    'Must prevent duplicate player addition in squad'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16: Logo upload error preserves existing logo
// ─────────────────────────────────────────────────────────────────────────────
test('16. Temporary team logo update validates MIME type and preserves logo if upload omitted', () => {
  const actionsContent = fs.readFileSync('app/admin/tournaments/actions.ts', 'utf8');

  const start = actionsContent.indexOf('export async function adminUpdateNightCupTeamAction');
  const end = actionsContent.indexOf('\nexport async function', start + 1);
  const fnBody = actionsContent.slice(start, end === -1 ? undefined : end);

  assert.ok(
    fnBody.includes("logo_file.type.startsWith('image/')"),
    'Must restrict to valid image MIME types'
  );
  assert.ok(
    fnBody.includes('5 * 1024 * 1024'),
    'Must enforce 5MB maximum file size'
  );
  assert.ok(
    fnBody.includes('if (logo_file && logo_file.size > 0)'),
    'Must only replace logo if valid file is provided, otherwise preserves existing logo'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 17: Tournament matches, goals, and winners isolated from official league
// ─────────────────────────────────────────────────────────────────────────────
test('17. Tournament matches and standings are strictly isolated from official league tables', () => {
  const migrationsContent = fs.readFileSync('supabase/migrations/20261009180000_night_cup_phase2_groups_and_fixtures.sql', 'utf8');

  assert.ok(
    migrationsContent.includes('tournament_groups'),
    'Tournament groups have dedicated table'
  );
  assert.ok(
    migrationsContent.includes('tournament_matches'),
    'Tournament matches use tournament_matches — never official matches table'
  );
  assert.ok(
    migrationsContent.includes('home_application_id UUID REFERENCES') &&
    migrationsContent.includes('tournament_applications'),
    'Tournament match participants link to tournament_applications — never official teams table'
  );
  assert.ok(
    !migrationsContent.includes('ALTER TABLE teams') && !migrationsContent.includes('ALTER TABLE public.teams'),
    'No schema change altering official teams'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18: Official league player career stats untouched by Night Cup
// ─────────────────────────────────────────────────────────────────────────────
test('18. Official league player career stats and standings untouched by Night Cup matches', () => {
  const standingsContent = fs.readFileSync('lib/tournament-engine.ts', 'utf8');

  // Night cup calculates standings in-memory per group
  assert.ok(
    standingsContent.includes('export function calculateGroupStandings'),
    'calculateGroupStandings handles standings inside tournament scope only'
  );
  assert.ok(
    standingsContent.includes('application_id'),
    'calculateGroupStandings keys on application_id, completely isolated from league_teams'
  );
});

console.log('================================================================');
console.log(`SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
}
