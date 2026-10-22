import assert from 'node:assert';
import {
  createVerifiedAuthHeaders,
  verifyVerifiedUserHeaders,
  HEADER_VERIFIED_USER_META,
  HEADER_VERIFIED_USER_ID,
  HEADER_VERIFIED_AUTH_SIG,
} from '../lib/auth-server.ts';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`[PASS] ${name}`); passed++; }
  catch (e) { console.error(`[FAIL] ${name}`); console.error(e); failed++; }
}

const USER_ID = '11111111-2222-3333-4444-555555555555';
const base = { id: USER_ID, email: 'oyuncu@example.com' };

function roundTrip(meta) {
  const created = createVerifiedAuthHeaders({ ...base, user_metadata: meta });
  // Simulate real proxy behaviour: Headers.set must not throw (ByteString check)
  const h = new Headers();
  for (const [k, v] of Object.entries(created)) h.set(k, v);
  return { created, user: verifyVerifiedUserHeaders(h) };
}

test('1. Turkish + emoji + surrogate pair metadata encodes to ASCII and round-trips', () => {
  const meta = { full_name: 'Çağrı Şükrü Ğüler İıÖö 😀⚽🏆', username: 'ŞampiyonÇ_😎' };
  const { created, user } = roundTrip(meta);
  assert.ok(/^[\x20-\x7e]*$/.test(created[HEADER_VERIFIED_USER_META]), 'meta header must be ASCII');
  assert.deepStrictEqual(user.user_metadata, meta);
  assert.strictEqual(user.id, USER_ID);
});

test('2. Legacy plain-JSON ASCII metadata header still decodes', () => {
  const created = createVerifiedAuthHeaders({ ...base, user_metadata: {} });
  const h = new Headers();
  for (const [k, v] of Object.entries(created)) h.set(k, v);
  h.set(HEADER_VERIFIED_USER_META, JSON.stringify({ full_name: 'Ali Veli' }));
  assert.deepStrictEqual(verifyVerifiedUserHeaders(h).user_metadata, { full_name: 'Ali Veli' });
});

test('3. Malformed metadata yields empty metadata but keeps verified identity', () => {
  const created = createVerifiedAuthHeaders({ ...base, user_metadata: { a: 1 } });
  const h = new Headers();
  for (const [k, v] of Object.entries(created)) h.set(k, v);
  h.set(HEADER_VERIFIED_USER_META, '!!!not-valid!!!');
  const user = verifyVerifiedUserHeaders(h);
  assert.deepStrictEqual(user.user_metadata, {});
  assert.strictEqual(user.id, USER_ID);
});

test('4. Oversized metadata (>4KB) is omitted; signed identity headers remain valid', () => {
  const { created, user } = roundTrip({ bio: 'x😀'.repeat(3000) });
  assert.strictEqual(created[HEADER_VERIFIED_USER_META], undefined);
  assert.ok(created[HEADER_VERIFIED_USER_ID] && created[HEADER_VERIFIED_AUTH_SIG]);
  assert.strictEqual(user.id, USER_ID);
  assert.deepStrictEqual(user.user_metadata, {});
});

test('5. Signature still enforced: tampered id or signature is rejected', () => {
  const created = createVerifiedAuthHeaders({ ...base, user_metadata: { full_name: 'Çağrı 😀' } });
  const tampered = new Headers();
  for (const [k, v] of Object.entries(created)) tampered.set(k, v);
  tampered.set(HEADER_VERIFIED_USER_ID, '99999999-2222-3333-4444-555555555555');
  assert.strictEqual(verifyVerifiedUserHeaders(tampered), null);

  const badSig = new Headers();
  for (const [k, v] of Object.entries(created)) badSig.set(k, v);
  badSig.set(HEADER_VERIFIED_AUTH_SIG, 'deadbeef');
  assert.strictEqual(verifyVerifiedUserHeaders(badSig), null);
});

test('6. Non-object / array metadata decodes to empty object', () => {
  const created = createVerifiedAuthHeaders({ ...base, user_metadata: {} });
  const h = new Headers();
  for (const [k, v] of Object.entries(created)) h.set(k, v);
  h.set(HEADER_VERIFIED_USER_META, Buffer.from('[1,2]').toString('base64url'));
  assert.deepStrictEqual(verifyVerifiedUserHeaders(h).user_metadata, {});
});

console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
if (failed > 0) process.exit(1);
