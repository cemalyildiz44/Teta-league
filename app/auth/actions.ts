'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSiteUrl, getAuthCallbackUrl } from '@/lib/site-url';

export async function loginAction(prevState: any, formData: FormData) {
  const email = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'E-posta ve şifre zorunludur.' };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !authData?.user) {
    const isEmailNotConfirmed =
      error?.message?.toLowerCase().includes('email not confirmed') ||
      (error as any)?.code === 'email_not_confirmed';

    if (isEmailNotConfirmed) {
      const encodedEmail = Buffer.from(email).toString('base64');
      redirect('/kayit/dogrulama?e=' + encodedEmail);
    }

    return { error: 'E-posta veya şifre hatalı.' };
  }

  // Check if player is BANNED
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, is_active')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profile?.status === 'BANNED') {
    await supabase.auth.signOut();
    return { error: 'Hesabınız sistem kurallarını ihlal ettiği gerekçesiyle yasaklanmıştır (BANLI).' };
  }

  const redirectTo = (formData.get('redirectTo') as string)?.trim();
  const safeRedirect = redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';
  redirect(safeRedirect);
}

export async function registerAction(prevState: any, formData: FormData) {
  const email = (formData.get('email') as string)?.trim();
  const username = (formData.get('username') as string)?.trim();
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const legalAccept = formData.get('legalAccept');
  const betaRegistered = formData.get('beta_registered') === 'on' || formData.get('beta_registered') === 'true';

  if (!legalAccept) {
    return { error: "Kayıt olmak için Kullanım Koşulları'nı kabul etmelisiniz." };
  }

  if (!email || !username || !password || !confirmPassword) {
    return { error: 'Lütfen tüm alanları doldurun.' };
  }

  // Username format check (3-30 chars, alphanumeric + _ . -)
  const usernameRegex = /^[a-zA-Z0-9_.-]{3,30}$/;
  if (!usernameRegex.test(username)) {
    return { error: 'Kullanıcı adı 3-30 karakter arasında olmalı ve yalnızca harf, rakam, alt çizgi, nokta ve tire içerebilir.' };
  }

  if (password.length < 8) {
    return { error: 'Şifre en az 8 karakter olmalıdır.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Şifreler eşleşmiyor.' };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Check if username is already taken (case-insensitive check with escaped wildcards)
  const escapedUsername = username.replace(/[_%]/g, '\\$&');
  const { data: existingProfile, error: checkError } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', escapedUsername)
    .maybeSingle();

  if (checkError) {
    console.error('Username availability check error:', checkError);
    return { error: 'Kullanıcı adı kontrol edilirken bir hata oluştu. Lütfen tekrar deneyin.' };
  }

  if (existingProfile) {
    return { error: 'Bu kullanıcı adı zaten kullanılıyor. Lütfen başka bir kullanıcı adı seçin.' };
  }

  const siteUrl = getSiteUrl();
  
  // NOTE: Storing terms_accepted_at in user_meta_data is useful for basic application logic
  // but it is not an immutable, tamper-proof legal record system (like a dedicated audit log table would be).
  // Users theoretically cannot edit this directly due to RLS, but admins can, and history is not natively preserved
  // without triggers or an external logging system.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username,
        terms_accepted_at: new Date().toISOString(),
        beta_registered: betaRegistered,
      },
      emailRedirectTo: siteUrl + '/',
    },
  });

  if (error) {
    const errorMsg = error.message || '';
    if (
      errorMsg.toLowerCase().includes('database error saving new user') ||
      errorMsg.toLowerCase().includes('unique constraint') ||
      (error.status === 500 && errorMsg.includes('Database error'))
    ) {
      return { error: 'Kayıt oluşturulamadı. Seçtiğiniz kullanıcı adı veya e-posta adresi kullanımda olabilir. Lütfen bilgilerinizi kontrol edip tekrar deneyin.' };
    }
    return { error: error.message || 'Kayıt olurken bir hata oluştu.' };
  }

  const encodedEmail = Buffer.from(email).toString('base64');
  redirect('/kayit/dogrulama?e=' + encodedEmail);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  await supabase.auth.signOut();
  redirect('/');
}

export async function forgotPasswordAction(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  if (!email) {
    return { error: 'Lütfen e-posta adresinizi girin.' };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  const redirectUrl = getAuthCallbackUrl('/sifre-yenile');

  // Do not expose whether the email exists or not (User Enumeration protection)
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });

  if (error) {
    // We swallow the error and just return success to not leak users,
    // but in case of rate limits we might want to tell the user to wait.
    if (error.status === 429) {
      return { error: 'Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyin.' };
    }
    console.error('Password reset email error:', error);
  }

  return { success: 'Eğer bu e-posta adresiyle kayıtlı bir hesabınız varsa, şifre yenileme bağlantısı gönderildi.' };
}

export async function resetPasswordAction(prevState: any, formData: FormData) {
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || !confirmPassword) {
    return { error: 'Lütfen tüm alanları doldurun.' };
  }

  if (password.length < 8) {
    return { error: 'Şifre en az 8 karakter olmalıdır.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Şifreler eşleşmiyor.' };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Check if user is actually logged in (session established via recovery link)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Yetkisiz işlem. Oturumunuz (veya kurtarma bağlantınızın süresi) dolmuş olabilir.' };
  }

  const { error } = await supabase.auth.updateUser({
    password: password
  });

  if (error) {
    return { error: 'Şifre güncellenirken bir hata oluştu: ' + error.message };
  }

  // Await sign out so the user logs back in with new password (optional, but good practice)
  await supabase.auth.signOut();

  return { success: 'Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz.' };
}


export async function resendVerificationAction(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  if (!email) {
    return { error: 'E-posta adresi bulunamadı.' };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  const siteUrl = getSiteUrl();
  
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: siteUrl + '/'
    }
  });

  if (error) {
    if (error.status === 429) {
      return { error: 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.' };
    }
    return { error: 'Doğrulama maili gönderilirken bir hata oluştu.' };
  }

  return { success: 'Doğrulama e-postası tekrar gönderildi.' };
}
