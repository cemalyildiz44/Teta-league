'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { resetPasswordAction } from '@/app/auth/actions';

const initialState = {
  error: '',
  success: '',
};

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(resetPasswordAction as any, initialState);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
      <div className="w-full max-w-md relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00e5ff] rounded-full blur-[80px] opacity-20" />
        
        <div className="card-surface rounded-2xl p-8 relative z-10 glow-cyan">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-white tracking-widest">YENİ ŞİFRE BELİRLE</h1>
            <p className="text-sm text-gray-400 mt-2">
              Lütfen hesabınız için yeni bir şifre girin.
            </p>
          </div>

          {state?.success ? (
            <div className="text-center">
              <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-4 mb-6">
                <p className="text-sm font-bold text-emerald-400">
                  {state.success}
                </p>
              </div>
              <Link 
                href="/giris" 
                className="inline-block px-6 py-3 bg-[#01060b] border border-[#00e5ff]/30 text-[#00e5ff] text-xs font-black tracking-widest uppercase rounded-lg hover:bg-[#00e5ff]/10 transition-colors"
              >
                Giriş Yap
              </Link>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Yeni Şifre
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all placeholder:text-gray-600"
                  placeholder="En az 8 karakter"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Yeni Şifre Tekrar
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  required
                  minLength={8}
                  className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all placeholder:text-gray-600"
                  placeholder="Şifreyi doğrulayın"
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
                {isPending ? 'GÜNCELLENİYOR...' : 'ŞİFREYİ GÜNCELLE'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
