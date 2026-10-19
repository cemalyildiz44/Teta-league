import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { User } from '@supabase/supabase-js';

export const HEADER_VERIFIED_USER_ID = 'x-teta-verified-user-id';
export const HEADER_VERIFIED_USER_EMAIL = 'x-teta-verified-user-email';
export const HEADER_VERIFIED_USER_CONFIRMED = 'x-teta-verified-user-confirmed';
export const HEADER_VERIFIED_USER_META = 'x-teta-verified-user-meta';
export const HEADER_VERIFIED_AUTH_SIG = 'x-teta-verified-auth-sig';
export const HEADER_AUTH_ERROR = 'x-teta-auth-error';

const FORBIDDEN_CLIENT_HEADERS = [
  HEADER_VERIFIED_USER_ID,
  HEADER_VERIFIED_USER_EMAIL,
  HEADER_VERIFIED_USER_CONFIRMED,
  HEADER_VERIFIED_USER_META,
  HEADER_VERIFIED_AUTH_SIG,
  HEADER_AUTH_ERROR,
] as const;

const INTERNAL_SECRET_SALT = 'teta_proxy_sig_v1';

/**
 * Returns a server-only HMAC key.
 * Prefers server-only secrets (INTERNAL_AUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY)
 * which are never exposed to the client bundle.
 * Falls back deterministically to hash of Supabase public configuration when server secret is absent.
 */
function getSecretKey(): string {
  const serverSecret = process.env.INTERNAL_AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serverSecret) {
    return createHash('sha256').update(`${serverSecret}::${INTERNAL_SECRET_SALT}`).digest('hex');
  }
  const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'teta_default_pub';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'teta_default_url';
  return createHash('sha256').update(`${pub}::${url}::${INTERNAL_SECRET_SALT}`).digest('hex');
}

/**
 * Generates an HMAC-SHA256 signature for the verified user identity.
 */
export function signVerifiedUser(userId: string, email?: string | null): string {
  return createHmac('sha256', getSecretKey())
    .update(`${userId}:${email || ''}`)
    .digest('hex');
}

/**
 * Timing-safe verification of the HMAC-SHA256 signature.
 */
export function verifySignature(userId: string, email: string | null | undefined, signature: string | null | undefined): boolean {
  if (!userId || !signature || typeof signature !== 'string') return false;
  const expected = signVerifiedUser(userId, email);
  const bExpected = Buffer.from(expected);
  const bSig = Buffer.from(signature);
  if (bExpected.length !== bSig.length) return false;
  return timingSafeEqual(bExpected, bSig);
}

/**
 * Strictly strips any internal authentication headers provided by the client request.
 * MUST be invoked at the start of proxy execution to ensure untrusted client headers cannot leak.
 */
export function stripClientAuthHeaders(headers: Headers): void {
  for (const header of FORBIDDEN_CLIENT_HEADERS) {
    headers.delete(header);
  }
}

export type VerifiedAuthUser = User;

/**
 * Creates verified headers to be forwarded downstream from proxy to Server Components.
 */
export function createVerifiedAuthHeaders(user: {
  id: string;
  email?: string | null;
  user_metadata?: any;
  email_confirmed_at?: string | null;
}): Record<string, string> {
  const sig = signVerifiedUser(user.id, user.email);
  const headers: Record<string, string> = {
    [HEADER_VERIFIED_USER_ID]: user.id,
    [HEADER_VERIFIED_AUTH_SIG]: sig,
  };
  if (user.email) {
    headers[HEADER_VERIFIED_USER_EMAIL] = user.email;
  }
  if (user.email_confirmed_at) {
    headers[HEADER_VERIFIED_USER_CONFIRMED] = user.email_confirmed_at;
  }
  if (user.user_metadata && typeof user.user_metadata === 'object') {
    try {
      headers[HEADER_VERIFIED_USER_META] = JSON.stringify(user.user_metadata);
    } catch {
      // ignore serialization error
    }
  }
  return headers;
}

/**
 * Validates request headers in Server Components / Actions.
 * Returns the verified user object if signature is valid, null otherwise.
 */
export function verifyVerifiedUserHeaders(headers: { get(name: string): string | null }): User | null {
  const userId = headers.get(HEADER_VERIFIED_USER_ID);
  const sig = headers.get(HEADER_VERIFIED_AUTH_SIG);
  const email = headers.get(HEADER_VERIFIED_USER_EMAIL);

  if (!userId || !sig) {
    return null;
  }

  const isValid = verifySignature(userId, email, sig);
  if (!isValid) {
    return null;
  }

  let userMetadata: Record<string, any> = {};
  const metaRaw = headers.get(HEADER_VERIFIED_USER_META);
  if (metaRaw) {
    try {
      userMetadata = JSON.parse(metaRaw);
    } catch {
      userMetadata = {};
    }
  }

  const emailConfirmedAt = headers.get(HEADER_VERIFIED_USER_CONFIRMED);

  return {
    id: userId,
    email: email || undefined,
    user_metadata: userMetadata,
    app_metadata: {},
    aud: 'authenticated',
    role: 'authenticated',
    created_at: new Date().toISOString(),
    email_confirmed_at: emailConfirmedAt || undefined,
    confirmed_at: emailConfirmedAt || undefined,
    last_sign_in_at: new Date().toISOString(),
    phone: '',
    factors: [],
  };
}
