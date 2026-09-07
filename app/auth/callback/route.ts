import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  let next = searchParams.get('next') ?? '/';
  try {
    const url = new URL(next);
    next = url.pathname + url.search;
  } catch (e) {
    // relative path
  }
  
  // Güvenlik ve origin uyumluluğu için .env'den URL alınıyor
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000';
  const safeNext = next.startsWith('/') ? next : `/${next}`;

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    
    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      return NextResponse.redirect(`${siteUrl}${safeNext}`);
    }
  }

  // Fallback to error page with instructions if no code or exchange fails
  return NextResponse.redirect(`${siteUrl}/giris?error=invalid_link`);
}
