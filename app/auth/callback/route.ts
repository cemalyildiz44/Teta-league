import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getSiteUrl, sanitizeNextUrl } from '@/lib/site-url';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorCode = searchParams.get('error_code');
  
  const safeNext = sanitizeNextUrl(searchParams.get('next'));
  const siteUrl = getSiteUrl();
  const isRecoveryFlow = safeNext.startsWith('/sifre-yenile');

  // Handle explicit errors from Supabase auth (e.g. otp_expired, access_denied)
  if (error || errorCode) {
    if (isRecoveryFlow) {
      return NextResponse.redirect(`${siteUrl}/sifremi-unuttum?error=expired_link`);
    }
    if (errorCode === 'otp_expired') {
      return NextResponse.redirect(`${siteUrl}/giris?error=invalid_verification`);
    }
    return NextResponse.redirect(`${siteUrl}/giris?error=invalid_link`);
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    
    // Exchange the code for a session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!exchangeError) {
      return NextResponse.redirect(`${siteUrl}${safeNext}`);
    }

    console.error('Auth code exchange error:', exchangeError);
    if (isRecoveryFlow) {
      return NextResponse.redirect(`${siteUrl}/sifremi-unuttum?error=expired_link`);
    }
    return NextResponse.redirect(`${siteUrl}/giris?error=invalid_link`);
  }

  // Fallback if no code or error provided
  if (isRecoveryFlow) {
    return NextResponse.redirect(`${siteUrl}/sifremi-unuttum?error=expired_link`);
  }
  return NextResponse.redirect(`${siteUrl}/giris?error=invalid_link`);
}
