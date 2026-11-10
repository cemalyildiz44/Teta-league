'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-20 md:py-28">
      <div className="text-center fade-in-up flex flex-col items-center">
        <span className="text-[#ff3b30] text-[11px] font-[900] tracking-[0.3em] uppercase bg-[#ff3b30]/10 px-4 py-1.5 rounded-full border border-[#ff3b30]/30 mb-5">
          BEKLENMEYEN HATA
        </span>
        <h1 className="text-[34px] sm:text-[42px] md:text-[54px] font-[900] text-white tracking-widest uppercase mb-4 leading-tight">
          BİR ŞEYLER <span className="text-[#00e5ff]">TERS GİTTİ</span>
        </h1>
        <p className="text-[#a0b0c0] font-medium max-w-xl mx-auto text-[15px] md:text-[16px] leading-relaxed mb-10">
          Bu sayfa şu anda yüklenemedi. Tekrar denemek çoğu zaman sorunu çözer; devam ederse daha sonra yeniden deneyin.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="px-6 py-3 rounded-xl bg-[#00e5ff] text-[#050a0f] text-[13px] font-[900] uppercase tracking-wider hover:bg-[#7fffd4] transition-colors"
          >
            Tekrar Dene
          </button>
          <Link
            href="/"
            className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 text-white text-[13px] font-[800] uppercase tracking-wider hover:border-[#00e5ff]/40 hover:text-[#00e5ff] transition-colors"
          >
            Ana Sayfa
          </Link>
        </div>
        {error.digest && (
          <p className="mt-8 text-[11px] text-gray-600 font-mono">Hata kodu: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
