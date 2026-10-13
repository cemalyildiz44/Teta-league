import { type EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { getSiteUrl, sanitizeNextUrl } from '@/lib/site-url';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const error = searchParams.get('error');
  const errorCode = searchParams.get('error_code');

  const safeNext = sanitizeNextUrl(searchParams.get('next'));
  const siteUrl = getSiteUrl();
  const redirectTo = `${siteUrl}${safeNext}`;
  const isRecoveryFlow = type === 'recovery' || safeNext.startsWith('/sifre-yenile');

  // Handle explicit errors from Supabase
  if (error || errorCode) {
    if (isRecoveryFlow) {
      return NextResponse.redirect(`${siteUrl}/sifremi-unuttum?error=expired_link`);
    }
    return NextResponse.redirect(`${siteUrl}/giris?error=invalid_verification`);
  }

  if (token_hash && type) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    
    if (!verifyError) {
      return NextResponse.redirect(redirectTo);
    }

    console.error('Auth verifyOtp error:', verifyError);
    if (isRecoveryFlow) {
      return NextResponse.redirect(`${siteUrl}/sifremi-unuttum?error=expired_link`);
    }
  }

  // Return the user to an error page with instructions
  if (isRecoveryFlow) {
    return NextResponse.redirect(`${siteUrl}/sifremi-unuttum?error=expired_link`);
  }
  return NextResponse.redirect(`${siteUrl}/giris?error=invalid_verification`);
}
