import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

// Next.js 16: "middleware" file convention is deprecated, use "proxy" instead.
// Export must be named "proxy" (not "middleware").
export async function proxy(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);
  
  // This triggers the session refresh if needed
  await supabase.auth.getUser();

  // After PKCE auth flow, Supabase redirects to /?code=XXXX
  // The code has already been consumed by getUser() / browser client.
  // Strip the one-time code parameter to keep the URL clean.
  const { pathname } = request.nextUrl;
  if (
    request.nextUrl.searchParams.has("code") &&
    !pathname.startsWith("/auth/callback")
  ) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("code");
    return NextResponse.redirect(cleanUrl);
  }

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
