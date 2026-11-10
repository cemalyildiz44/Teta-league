import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Sayfa Bulunamadı',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-20 md:py-28">
      <div className="text-center fade-in-up flex flex-col items-center">
        <span className="text-[#00e5ff] text-[11px] font-[900] tracking-[0.3em] uppercase bg-[#00e5ff]/10 px-4 py-1.5 rounded-full border border-[#00e5ff]/30 mb-5 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
          HATA 404
        </span>
        <h1 className="text-[38px] sm:text-[46px] md:text-[60px] font-[900] text-white tracking-widest uppercase mb-4 drop-shadow-[0_0_15px_rgba(0,229,255,0.4)] leading-tight">
          SAYFA <span className="text-[#00e5ff]">BULUNAMADI</span>
        </h1>
        <p className="text-[#a0b0c0] font-medium max-w-xl mx-auto text-[15px] md:text-[16px] leading-relaxed mb-10">
          Aradığınız sayfa taşınmış, silinmiş ya da hiç var olmamış olabilir. Bağlantıyı kontrol edin veya aşağıdan devam edin.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="px-6 py-3 rounded-xl bg-[#00e5ff] text-[#050a0f] text-[13px] font-[900] uppercase tracking-wider hover:bg-[#7fffd4] transition-colors"
          >
            Ana Sayfa
          </Link>
          <Link
            href="/ligler"
            className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 text-white text-[13px] font-[800] uppercase tracking-wider hover:border-[#00e5ff]/40 hover:text-[#00e5ff] transition-colors"
          >
            Ligler
          </Link>
          <Link
            href="/oyuncular"
            className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 text-white text-[13px] font-[800] uppercase tracking-wider hover:border-[#00e5ff]/40 hover:text-[#00e5ff] transition-colors"
          >
            Oyuncular
          </Link>
        </div>
      </div>
    </div>
  );
}
