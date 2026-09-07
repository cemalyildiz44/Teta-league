'use client';

import { useActionState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { loginAction } from '@/app/auth/actions';

const initialState = {
  error: '',
};

function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction as any, initialState);
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  let urlError = '';
  if (errorParam === 'invalid_link') urlError = 'Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.';
  if (errorParam === 'invalid_verification') urlError = 'E-posta doğrulama bağlantısı geçersiz, kullanılmış veya süresi dolmuş.';

  return (
    <div className="w-full max-w-md relative">
      {/* Glow effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#00e5ff] rounded-full blur-[80px] opacity-20" />
      
      <div className="card-surface rounded-2xl p-8 relative z-10 glow-cyan">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-white tracking-widest">GİRİŞ YAP</h1>
          <p className="text-sm text-gray-400 mt-2">Teta League hesabınıza erişin</p>
        </div>

        {urlError && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-center text-xs font-bold text-red-500">
            {urlError}
          </div>
        )}

          <form action={formAction} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                E-posta
              </label>
              <input
                type="email"
                name="email"
                required
                className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all placeholder:text-gray-600"
                placeholder="ornek@email.com"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Şifre
                </label>
                <Link href="/sifremi-unuttum" className="text-[10px] font-bold text-[#00e5ff] hover:text-white transition-colors uppercase tracking-widest">
                  Şifremi Unuttum?
                </Link>
              </div>
              <input
                type="password"
                name="password"
                required
                className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all placeholder:text-gray-600"
                placeholder="••••••••"
              />
            </div>

            {state?.error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-center text-xs font-bold text-red-500">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3.5 bg-[#00e5ff] hover:bg-[#00b8d4] text-black font-black rounded-lg transition-all tracking-wide disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-[0_0_15px_rgba(0,229,255,0.3)]"
            >
              {isPending ? 'GİRİŞ YAPILIYOR...' : 'GİRİŞ YAP'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Hesabın yok mu?{' '}
              <Link href="/kayit" className="text-[#00e5ff] hover:text-white font-bold transition-colors">
                Kayıt Ol
              </Link>
            </p>
          </div>
        </div>
      </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-white text-sm">Yükleniyor...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
