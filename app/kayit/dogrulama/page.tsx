'use client';

import Link from 'next/link';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { resendVerificationAction } from '@/app/auth/actions';
import { useActionState, use, Suspense } from 'react';

function VerificationContent({ searchParamsPromise }: { searchParamsPromise: Promise<{ e?: string }> }) {
  const searchParams = use(searchParamsPromise);
  let email = '';
  try {
    if (searchParams.e) {
      email = Buffer.from(searchParams.e, 'base64').toString('utf-8');
    }
  } catch(e) {}

  let maskedEmail = '';
  if (email && email.includes('@')) {
    const [name, domain] = email.split('@');
    if (name.length > 1) {
      maskedEmail = name[0] + '***@' + domain;
    } else {
      maskedEmail = '*@' + domain;
    }
  }

  const [state, formAction, isPending] = useActionState(resendVerificationAction as any, { error: '', success: '' });

  return (
    <div className="w-full max-w-md p-8 relative z-10">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-cyan-500/30">
          <Mail className="w-8 h-8 text-cyan-400" />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight mb-3">
          E-POSTANI DOĞRULA
        </h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Kaydını tamamlamak için {maskedEmail ? <span className="text-cyan-400 font-medium">{maskedEmail}</span> : 'e-posta'} adresine gönderdiğimiz doğrulama bağlantısına tıkla.
        </p>
        <p className="text-zinc-500 text-xs mt-3">
          Mail gelmediyse spam/önemsiz klasörünü kontrol etmeyi unutma.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        
        {state?.error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-center text-xs font-bold text-red-500">
            {state.error}
          </div>
        )}
        {state?.success && (
          <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 text-center text-xs font-bold text-green-500">
            {state.success}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-white/5 hover:bg-white/10 text-white font-medium h-12 rounded-lg flex items-center justify-center gap-2 transition-all border border-white/10 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {isPending ? 'GÖNDERİLİYOR...' : 'E-POSTAYI TEKRAR GÖNDER'}
        </button>
      </form>

      <div className="mt-8 text-center">
        <Link
          href="/giris"
          className="text-zinc-400 hover:text-white inline-flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          GİRİŞ SAYFASINA DÖN
        </Link>
      </div>
    </div>
  );
}

export default function VerificationPage(props: { searchParams: Promise<{ e?: string }> }) {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#0a0a0a]">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
      
      <Suspense fallback={<div className="text-white">Yükleniyor...</div>}>
        <VerificationContent searchParamsPromise={props.searchParams} />
      </Suspense>
    </div>
  );
}
