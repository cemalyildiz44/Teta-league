/**
 * Supabase Auth Cookie Matching Utilities
 *
 * In @supabase/ssr, session tokens are stored as cookies formatted with the project reference:
 * - Standard session: `sb-<project-ref>-auth-token`
 * - Chunked session: `sb-<project-ref>-auth-token.0`, `sb-<project-ref>-auth-token.1`, etc.
 *
 * PKCE code verifier (`sb-<project-ref>-auth-token-code-verifier`) is used strictly
 * by the auth callback route for exchangeCodeForSession. It contains no session/JWT
 * and does not require or warrant a getUser() call in middleware.
 */

// Strictly matches standard session cookie and chunked variants:
// e.g. `sb-cquqplzrfmsfflyxegab-auth-token` or `sb-cquqplzrfmsfflyxegab-auth-token.0`
const SUPABASE_SESSION_COOKIE_REGEX = /^sb-[a-z0-9_-]+-auth-token(\.\d+)?$/i;

// Matches the temporary PKCE code-verifier cookie
const SUPABASE_VERIFIER_COOKIE_REGEX = /^sb-[a-z0-9_-]+-auth-token-code-verifier$/i;

/**
 * Checks if a cookie name is an active Supabase SSR session cookie (standard or chunked).
 * Rejects code-verifiers, provider tokens, and unrelated cookies.
 */
export function isSupabaseAuthCookie(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  return SUPABASE_SESSION_COOKIE_REGEX.test(name);
}

/**
 * Checks if a cookie name is a Supabase PKCE code-verifier cookie.
 * Separated from session cookies as it does not represent an active user session.
 */
export function isSupabaseCodeVerifierCookie(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  return SUPABASE_VERIFIER_COOKIE_REGEX.test(name);
}

/**
 * Inspects a list of cookies and returns true if any cookie represents an active
 * Supabase auth session token (standard or chunked).
 */
export function hasSupabaseAuthCookie(
  cookies: Array<{ name: string }> | Iterable<{ name: string }>
): boolean {
  if (!cookies) return false;

  for (const cookie of cookies) {
    if (cookie && isSupabaseAuthCookie(cookie.name)) {
      return true;
    }
  }

  return false;
}
