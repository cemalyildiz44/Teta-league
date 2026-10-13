'use client';

import { useActionState, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { resetPasswordAction } from '@/app/auth/actions';
import { createClient } from '@/utils/supabase/client';
import { Eye, EyeOff, AlertTriangle, CheckCircle2, Lock, ArrowRight, RotateCw } from 'lucide-react';

const initialState = {
  error: '',
  success: '',
};

type SessionStatus = 'checking' | 'ready' | 'expired' | 'no_session';

function ResetPasswordContent() {
  const [state, formAction, isPending] = useActionState(resetPasswordAction as any, initialState);
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<SessionStatus>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clientError, setClientError] = useState('');

  useEffect(() => {
    // 1. Check URL search params for error flags
    const errorParam = searchParams.get('error');
    const errorCodeParam = searchParams.get('error_code');
    const errorDescParam = searchParams.get('error_description');

    if (
      errorCodeParam === 'otp_expired' ||
      errorParam === 'access_denied' ||
      errorParam === 'expired_link' ||
      (errorDescParam && errorDescParam.toLowerCase().includes('expired'))
    ) {
      setStatus('expired');
      return;
    }

    // 2. Check window hash for error flags (implicit/fragment flow fallback)
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.substring(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      const hashErrorCode = hashParams.get('error_code');
      const hashErrorDesc = hashParams.get('error_description');
      if (
        hashErrorCode === 'otp_expired' ||
        (hashErrorDesc && hashErrorDesc.toLowerCase().includes('expired'))
      ) {
        setStatus('expired');
        return;
      }
    }

    // 3. Verify active recovery / auth session with Supabase client
    const supabase = createClient();
    let isSubscribed = true;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isSubscribed) return;
      if (
        event === 'PASSWORD_RECOVERY' ||
        event === 'SIGNED_IN' ||
        session?.user
      ) {
        setStatus('ready');
      }
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!isSubscribed) return;
        if (session?.user) {
          setStatus('ready');
          return;
        }

        // If there is an access_token in the URL hash (implicit flow fallback),
        // allow GoTrue client a brief window to parse the fragment:
        const hasHashToken =
          typeof window !== 'undefined' &&
          window.location.hash &&
          window.location.hash.includes('access_token');

        if (hasHashToken) {
          fallbackTimer = setTimeout(() => {
            if (!isSubscribed) return;
            supabase.auth.getSession().then(({ data: { session: hashSession } }) => {
              if (!isSubscribed) return;
              setStatus((prev) => {
                if (prev === 'ready' || prev === 'expired') return prev;
                return hashSession?.user ? 'ready' : 'no_session';
              });
            });
          }, 1500);
          return;
        }

        // No hash token and no session cookie:
        setStatus((prev) => {
          if (prev === 'ready' || prev === 'expired') return prev;
          return 'no_session';
        });
      })
      .catch(() => {
        if (!isSubscribed) return;
        setStatus((prev) => {
          if (prev === 'ready' || prev === 'expired') return prev;
          return 'no_session';
        });
      });

    return () => {
      isSubscribed = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (password.length < 8) {
      e.preventDefault();
      setClientError('Şifre en az 8 karakter olmalıdır.');
      return;
    }
    if (password !== confirmPassword) {
      e.preventDefault();
      setClientError('Girdiğiniz şifreler birbiriyle eşleşmiyor.');
      return;
    }
    setClientError('');
  };

  const activeError = clientError || state?.error;

  return (
    <div className="w-full max-w-md relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#00e5ff] rounded-full blur-[80px] opacity-20" />

      <div className="card-surface rounded-2xl p-8 relative z-10 glow-cyan">
        {/* Loading / Checking State */}
        {status === 'checking' && (
          <div className="text-center py-8 space-y-4">
            <RotateCw className="w-8 h-8 text-[#00e5ff] animate-spin mx-auto opacity-80" />
            <h2 className="text-sm font-bold text-gray-300 tracking-wider">
              Şifre sıfırlama bağlantısı doğrulanıyor...
            </h2>
            <p className="text-xs text-gray-500">
              Lütfen bekleyin, oturum durumu kontrol ediliyor.
            </p>
          </div>
        )}

        {/* Expired or Invalid Session State */}
        {(status === 'expired' || status === 'no_session') && (
          <div className="text-center py-4 space-y-5">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h1 className="text-xl font-black text-white tracking-widest uppercase">
                BAĞLANTI GEÇERSİZ VEYA SÜRESİ DOLMUŞ
              </h1>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Tıkladığınız şifre sıfırlama bağlantısının süresi dolmuş veya bağlantı daha önce kullanılmış.
                Güvenliğiniz için lütfen yeni bir bağlantı talep edin.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <Link
                href="/sifremi-unuttum"
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 bg-[#00e5ff] hover:bg-[#00b8d4] text-black font-black rounded-lg transition-all tracking-wide text-xs shadow-[0_0_15px_rgba(0,229,255,0.3)]"
              >
                <span>YENİ BAĞLANTI İSTE</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <div>
                <Link
                  href="/giris"
                  className="text-xs text-gray-500 hover:text-white transition-colors"
                >
                  Giriş sayfasına dön
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Ready State */}
        {status === 'ready' && (
          <>
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center mx-auto text-[#00e5ff] mb-4">
                <Lock className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-black text-white tracking-widest">YENİ ŞİFRE BELİRLE</h1>
              <p className="text-sm text-gray-400 mt-2">
                Hesabınız için en az 8 karakterden oluşan yeni bir şifre girin.
              </p>
            </div>

            {state?.success ? (
              <div className="text-center py-2 space-y-5">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 className="w-7 h-7" />
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-4">
                  <p className="text-sm font-bold text-emerald-400 leading-relaxed">
                    {state.success}
                  </p>
                </div>

                <Link
                  href="/giris"
                  className="w-full inline-flex items-center justify-center gap-2 py-3.5 bg-[#00e5ff] hover:bg-[#00b8d4] text-black font-black rounded-lg transition-all tracking-wide text-xs shadow-[0_0_15px_rgba(0,229,255,0.3)]"
                >
                  <span>GİRİŞ YAP</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Yeni Şifre
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (clientError) setClientError('');
                      }}
                      required
                      minLength={8}
                      className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all placeholder:text-gray-600 pr-11"
                      placeholder="En az 8 karakter"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      aria-label="Şifreyi göster/gizle"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Yeni Şifre Tekrar
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (clientError) setClientError('');
                    }}
                    required
                    minLength={8}
                    className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all placeholder:text-gray-600"
                    placeholder="Şifreyi doğrulayın"
                  />
                </div>

                {activeError && (
                  <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-center text-xs font-bold text-red-500">
                    {activeError}
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
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="text-center py-8 text-gray-400 text-xs">
            Yükleniyor...
          </div>
        }
      >
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}
