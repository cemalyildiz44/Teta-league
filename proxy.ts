import { type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

// Next.js 16: "middleware" file convention is deprecated, use "proxy" instead.
// Export must be named "proxy" (not "middleware").
export async function proxy(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);
  
  // This triggers the session refresh if needed
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public folder image assets
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
