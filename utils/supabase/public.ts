import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Cookie-free client for public data in Server Components. Unlike the cookie-based server client it does not
 * read the request, so pages that only use it can be cached (ISR). It runs as the anon role and therefore only
 * sees what RLS allows signed-out visitors to see; never use it for per-user or admin data.
 */
export const createPublicClient = () =>
  createClient(supabaseUrl!, supabaseKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
