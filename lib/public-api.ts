// Read-only public REST API (/api/v1/*) for an invited partner: API-key auth, rate limiting, pagination and JSON helpers.
// No Next.js or Supabase imports here so the module can be unit-tested with plain Node.
import { createHash, timingSafeEqual } from 'node:crypto';

export const API_KEY_ENV = 'TETA_PUBLIC_API_KEY';
export const MIN_KEY_LENGTH = 32;
export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;
export const RATE_LIMIT_PER_MINUTE = 60; // per valid key
export const FAILED_AUTH_PER_MINUTE = 10; // per client IP, for missing/invalid keys (brute-force guard)
const WINDOW_MS = 60_000;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------- responses
const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extra } });
}

export function errorResponse(status: number, code: string, message: string, extra: Record<string, string> = {}): Response {
  return json(status, { error: { code, message } }, extra);
}

export function methodNotAllowed(): Response {
  return errorResponse(405, 'method_not_allowed', 'Only GET is supported.', { Allow: 'GET' });
}

// ---------------------------------------------------------------- authentication
/** Constant-time comparison of two secrets (hashed first so the lengths never leak). */
export function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Key from `Authorization: Bearer <key>` or `X-API-Key`. Never from the query string (URLs end up in logs). */
export function extractApiKey(headers: Headers): string | null {
  const auth = headers.get('authorization');
  if (auth) {
    const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
    if (m) return m[1];
  }
  const x = headers.get('x-api-key');
  return x && x.trim() ? x.trim() : null;
}

export function configuredKey(env: Record<string, string | undefined> = process.env): string | null {
  const k = env[API_KEY_ENV];
  return k && k.length >= MIN_KEY_LENGTH ? k : null; // weak/empty keys disable the API instead of weakening it
}

export function clientIp(headers: Headers): string {
  const xf = headers.get('x-forwarded-for');
  return (xf ? xf.split(',')[0].trim() : headers.get('x-real-ip')) || 'unknown';
}

// ---------------------------------------------------------------- rate limiting (fixed window, per server instance)
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

export function hit(bucketKey: string, limit: number, now = Date.now()): { allowed: boolean; remaining: number; reset: number } {
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  let b = buckets.get(bucketKey);
  if (!b || b.reset <= now) {
    b = { count: 0, reset: now + WINDOW_MS };
    buckets.set(bucketKey, b);
  }
  b.count += 1;
  return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), reset: b.reset };
}

export function resetRateLimits() {
  buckets.clear();
}

function rateHeaders(limit: number, remaining: number, reset: number, now: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(reset / 1000)),
    ...(remaining === 0 ? { 'Retry-After': String(Math.max(1, Math.ceil((reset - now) / 1000))) } : {}),
  };
}

export type AuthResult = { ok: true; headers: Record<string, string> } | { ok: false; response: Response };

export function authenticate(req: Request, env: Record<string, string | undefined> = process.env, now = Date.now()): AuthResult {
  const key = configuredKey(env);
  if (!key) return { ok: false, response: errorResponse(503, 'api_disabled', 'The API is not available.') };

  const ip = clientIp(req.headers);
  const provided = extractApiKey(req.headers);
  if (!provided || !secretsMatch(provided, key)) {
    const r = hit(`fail:${ip}`, FAILED_AUTH_PER_MINUTE, now);
    if (!r.allowed) {
      return { ok: false, response: errorResponse(429, 'rate_limited', 'Too many requests.', rateHeaders(FAILED_AUTH_PER_MINUTE, 0, r.reset, now)) };
    }
    return { ok: false, response: errorResponse(401, 'unauthorized', 'A valid API key is required.', { 'WWW-Authenticate': 'Bearer' }) };
  }

  const r = hit(`key:${createHash('sha256').update(provided).digest('hex').slice(0, 16)}`, RATE_LIMIT_PER_MINUTE, now);
  const headers = rateHeaders(RATE_LIMIT_PER_MINUTE, r.remaining, r.reset, now);
  if (!r.allowed) return { ok: false, response: errorResponse(429, 'rate_limited', 'Rate limit exceeded.', headers) };
  return { ok: true, headers };
}

// ---------------------------------------------------------------- query parameters
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function intParam(sp: URLSearchParams, name: string, def: number, min: number, max: number): number {
  const raw = sp.get(name);
  if (raw === null || raw === '') return def;
  if (!/^\d{1,9}$/.test(raw)) throw new ApiError(400, 'invalid_parameter', `"${name}" must be an integer.`);
  const n = Number(raw);
  if (n < min || n > max) throw new ApiError(400, 'invalid_parameter', `"${name}" must be between ${min} and ${max}.`);
  return n;
}

export function uuidParam(sp: URLSearchParams, name: string): string | null {
  const v = sp.get(name);
  if (v === null || v === '') return null;
  if (!UUID_RE.test(v)) throw new ApiError(400, 'invalid_parameter', `"${name}" must be a UUID.`);
  return v.toLowerCase();
}

export function slugParam(sp: URLSearchParams, name: string): string | null {
  const v = sp.get(name);
  if (v === null || v === '') return null;
  if (!SLUG_RE.test(v)) throw new ApiError(400, 'invalid_parameter', `"${name}" is not a valid slug.`);
  return v;
}

export function enumParam<T extends string>(sp: URLSearchParams, name: string, allowed: readonly T[]): T | null {
  const v = sp.get(name);
  if (v === null || v === '') return null;
  if (!(allowed as readonly string[]).includes(v)) throw new ApiError(400, 'invalid_parameter', `"${name}" must be one of: ${allowed.join(', ')}.`);
  return v as T;
}

/** Username prefix search: letters, digits, `_ . -` only (LIKE wildcards are escaped), at least 2 characters. */
export function usernamePrefixParam(sp: URLSearchParams, name: string): string | null {
  const v = sp.get(name);
  if (v === null || v === '') return null;
  if (!/^[A-Za-z0-9_.-]{2,40}$/.test(v)) throw new ApiError(400, 'invalid_parameter', `"${name}" must be 2-40 characters: letters, digits, _ . -`);
  return v.replace(/[\\%_]/g, (c) => '\\' + c);
}

export interface Page {
  page: number;
  perPage: number;
  from: number;
  to: number;
}

export function pageParams(sp: URLSearchParams, defPerPage = DEFAULT_PER_PAGE, maxPerPage = MAX_PER_PAGE): Page {
  const page = intParam(sp, 'page', 1, 1, 10_000);
  const perPage = intParam(sp, 'per_page', defPerPage, 1, maxPerPage);
  return { page, perPage, from: (page - 1) * perPage, to: (page - 1) * perPage + perPage - 1 };
}

export function pageMeta(p: Page, total: number | null) {
  return { page: p.page, per_page: p.perPage, total: total ?? 0, total_pages: total ? Math.ceil(total / p.perPage) : 0 };
}

// ---------------------------------------------------------------- request wrapper
/**
 * Runs `fn` for an authenticated GET. Unexpected failures are logged server-side (without details in the response):
 * clients only ever see a generic error, never SQL, table names or secrets.
 */
export async function handleGet(req: Request, fn: (sp: URLSearchParams) => Promise<{ data: unknown; meta?: unknown }>, env: Record<string, string | undefined> = process.env): Promise<Response> {
  const auth = authenticate(req, env);
  if (!auth.ok) return auth.response;
  try {
    const sp = new URL(req.url).searchParams;
    const out = await fn(sp);
    return json(200, out, auth.headers);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e.status, e.code, e.message, auth.headers);
    console.error('[public-api] unexpected failure', e instanceof Error && /^db:[A-Za-z0-9]{1,10}$/.test(e.message) ? e.message : 'non-db error');
    return errorResponse(500, 'internal_error', 'Something went wrong.', auth.headers);
  }
}
