'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { registerAction } from '@/app/auth/actions';

const initialState = {
  error: '',
};

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction as any, initialState);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
      <div className="w-full max-w-md relative">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00e5ff] rounded-full blur-[80px] opacity-20" />
        
        <div className="card-surface rounded-2xl p-8 relative z-10 glow-cyan">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-white tracking-widest">KAYIT OL</h1>
            <p className="text-sm text-gray-400 mt-2">Teta League'e katıl</p>
          </div>

          <form action={formAction} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                name="username"
                required
                className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all placeholder:text-gray-600"
                placeholder="Örn: proplayer123"
              />
            </div>

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
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Şifre
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
                Şifre (Tekrar)
              </label>
              <input
                type="password"
                name="confirmPassword"
                required
                minLength={8}
                className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all placeholder:text-gray-600"
                placeholder="Şifrenizi tekrar girin"
              />
            </div>

            <div className="pt-2 pb-1 space-y-3">
              <div className="flex items-start space-x-3">
                <input 
                  type="checkbox" 
                  name="legalAccept" 
                  id="legalAccept" 
                  required 
                  className="mt-1 w-4 h-4 bg-[#060d18] border border-white/20 rounded focus:ring-2 focus:ring-[#00e5ff]/50 text-[#00e5ff] cursor-pointer"
                />
                <label htmlFor="legalAccept" className="text-xs text-gray-400 leading-relaxed cursor-pointer select-none">
                  <Link href="/kullanim-sartlari" target="_blank" className="text-[#00e5ff] hover:underline">Kullanım Koşulları</Link>'nı kabul ediyorum. *
                </label>
              </div>
              <div className="text-[11px] text-gray-500 pl-7 leading-relaxed">
                Teta League platformuna kayıt olarak <Link href="/gizlilik" target="_blank" className="text-[#00e5ff] hover:underline">Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni</Link>'ni okuduğunuzu ve kişisel verilerinizin işlenmesi hakkında bilgilendirildiğinizi teyit etmiş olursunuz.
              </div>
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
              {isPending ? 'KAYIT OLUNUYOR...' : 'KAYIT OL'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Zaten hesabın var mı?{' '}
              <Link href="/giris" className="text-[#00e5ff] hover:text-white font-bold transition-colors">
                Giriş Yap
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
