import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Ekip | Teta League',
  description: 'Teta League yönetim ve organizasyon ekibi.',
};

export default function EkipPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="card-surface rounded-2xl p-8 md:p-12 border border-white/5 relative overflow-hidden text-center space-y-6">
        {/* Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#00e5ff] rounded-full blur-[140px] opacity-10 pointer-events-none" />

        <span className="text-[#00e5ff] font-extrabold tracking-[0.3em] text-xs uppercase block">
          TETA LEAGUE
        </span>

        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-widest uppercase">
          YÖNETİM VE ORGANİZASYON <span className="text-[#00e5ff]">EKİBİ</span>
        </h1>

        <p className="text-gray-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          Teta League lig operasyonları, hakem heyeti ve teknik yönetim kadrosu bilgileri yakında bu sayfada yer alacaktır. Organizasyon ve iş birlikleri için Discord üzerinden bizimle iletişime geçebilirsiniz.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://discord.gg/Cd9b4jpcAZ"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all shadow-[0_0_20px_rgba(88,101,242,0.3)] hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M19.73 4.87a18.2 18.2 0 00-4.6-1.44c-.21.38-.44.88-.6 1.28a16.69 16.69 0 00-5.06 0c-.16-.4-.4-.9-.6-1.28a18.2 18.2 0 00-4.6 1.44A18.52 18.52 0 001.3 16.7a18.3 18.3 0 005.61 2.85 13.06 13.06 0 001.2-1.95 12.3 12.3 0 01-1.93-.94 9 9 0 00.36-.28c3.84 1.76 8 1.76 11.83 0a9 9 0 00.36.28 12.3 12.3 0 01-1.93.94c.36.69.76 1.34 1.2 1.95a18.3 18.3 0 005.61-2.85 18.66 18.66 0 00-4.27-11.82zM8.5 13.91c-1.12 0-2.04-1.04-2.04-2.3 0-1.27.9-2.3 2.04-2.3 1.15 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.3-2.04 2.3zm7 0c-1.12 0-2.04-1.04-2.04-2.3 0-1.27.9-2.3 2.04-2.3 1.15 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.3-2.04 2.3z" clipRule="evenodd" />
            </svg>
            Bize Discord&apos;dan Ulaşın
          </a>

          <Link
            href="/"
            className="px-8 py-3.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all border border-white/5"
          >
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    </div>
  );
}
