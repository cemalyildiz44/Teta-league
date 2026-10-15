import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";
import { getSiteUrl, sanitizeNextUrl } from "@/lib/site-url";
import { hasSupabaseAuthCookie } from "@/lib/auth-cookies";

// Next.js 16: "middleware" file convention is deprecated, use "proxy" instead.
// Export must be named "proxy" (not "middleware").
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const baseUrl = process.env.NODE_ENV === "production" ? getSiteUrl() : request.nextUrl.origin;

  // 1. Auth error handling:
  // If Supabase redirects an expired OTP error (e.g. otp_expired) when clicking an auth link:
  const errorCode = searchParams.get("error_code");
  const error = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");
  const isOtpExpired =
    errorCode === "otp_expired" ||
    (errorDesc && errorDesc.toLowerCase().includes("expired"));

  if (isOtpExpired && !pathname.startsWith("/auth/callback")) {
    // Specifically target password recovery or root landing
    if (pathname.startsWith("/sifre-yenile") || pathname === "/") {
      const redirectUrl = new URL("/sifremi-unuttum", baseUrl);
      redirectUrl.searchParams.set("error", "expired_link");
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 2. PKCE code forwarding:
  // If a PKCE code arrives at a route other than /auth/callback (e.g. root '/' because of Supabase
  // dashboard Site URL fallback or direct link), do NOT delete it. Forward it to /auth/callback
  // so the code can be exchanged for an authenticated session.
  if (
    searchParams.has("code") &&
    !pathname.startsWith("/auth/callback")
  ) {
    const code = searchParams.get("code")!;
    const callbackUrl = new URL("/auth/callback", baseUrl);
    callbackUrl.searchParams.set("code", code);

    const nextParam = sanitizeNextUrl(searchParams.get("next"));
    if (nextParam !== "/") {
      callbackUrl.searchParams.set("next", nextParam);
    } else if (pathname !== "/") {
      callbackUrl.searchParams.set("next", sanitizeNextUrl(pathname));
    }
    return NextResponse.redirect(callbackUrl);
  }

  const { supabase, getResponse } = createClient(request);

  // Check if any active Supabase SSR session cookies are present (standard or chunked).
  // PKCE verifiers alone or unrelated cookies will not trigger an unnecessary session refresh.
  const hasAuthCookie = hasSupabaseAuthCookie(request.cookies.getAll());

  // Only trigger session refresh if Supabase auth cookies are present.
  // For anonymous visitors, skip getUser() to avoid unnecessary CPU and Supabase Auth calls.
  if (hasAuthCookie) {
    await supabase.auth.getUser();
  }

  return getResponse();
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
