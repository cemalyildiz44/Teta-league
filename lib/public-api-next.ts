// Glue between the Next.js route files and the public API logic: one anonymous (publishable-key) Supabase client,
// so every query is limited by the existing RLS policies and column allow-lists. The service_role key is never used here.
import { createClient } from '@supabase/supabase-js';
import { handleGet, methodNotAllowed } from './public-api.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (sb: any, sp: URLSearchParams) => Promise<{ data: unknown; meta?: unknown }>;

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('supabase env missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function publicApiHandlers(fn: Fn) {
  const reject = async () => methodNotAllowed();
  return {
    GET: (req: Request) => handleGet(req, (sp) => fn(anonClient(), sp)),
    POST: reject,
    PUT: reject,
    PATCH: reject,
    DELETE: reject,
    HEAD: reject,
    OPTIONS: reject,
  };
}
