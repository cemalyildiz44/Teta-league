'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function loginAction(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'E-posta ve şifre zorunludur.' };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: 'E-posta veya şifre hatalı.' };
  }

  redirect('/');
}

export async function registerAction(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const legalAccept = formData.get('legalAccept');

  if (!legalAccept) {
    return { error: "Kayıt olmak için Kullanım Koşulları'nı kabul etmelisiniz." };
  }

  if (!email || !username || !password || !confirmPassword) {
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000';
  
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
      },
      emailRedirectTo: siteUrl + '/',
    },
  });

  if (error) {
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
  
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const redirectUrl = `${siteUrl}/auth/callback?next=/sifre-yenile`;

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
  
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000';
  
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
