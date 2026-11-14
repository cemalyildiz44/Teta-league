'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has already accepted the banner
    const consent = localStorage.getItem('teta_cookie_consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('teta_cookie_consent', new Date().toISOString());
    setIsVisible(false);
  };

  if (!isVisible) return null;

  // One slim line so the notice never covers page content (it only mentions essential cookies)
  return (
    <div
      role="region"
      aria-label="Çerez bildirimi"
      className="fixed bottom-0 left-0 w-full z-50 p-2 sm:p-3 pointer-events-none flex justify-center"
    >
      <div className="bg-[#060d18]/95 backdrop-blur-md border border-[#00e5ff]/20 rounded-lg px-3 sm:px-4 py-2 shadow-[0_-5px_25px_rgba(0,0,0,0.5)] w-full max-w-3xl pointer-events-auto flex items-center gap-3 justify-between">
        <p className="flex-1 text-[12px] sm:text-[13px] text-gray-300 leading-snug">
          <span className="sm:hidden">Yalnızca zorunlu çerezler kullanıyoruz. </span>
          <span className="hidden sm:inline">
            <span className="text-[#00e5ff] font-bold">TETA League</span> yalnızca zorunlu çerezler kullanır; reklam veya analiz çerezi yoktur.{' '}
          </span>
          <Link href="/cerez-politikasi" className="text-[#00e5ff] hover:underline whitespace-nowrap">
            Detaylar
          </Link>
        </p>
        <button
          onClick={handleAccept}
          className="min-h-[36px] shrink-0 px-4 py-1.5 whitespace-nowrap bg-[#00e5ff] hover:bg-[#00b8d4] text-black text-[11px] font-black tracking-widest rounded transition-colors"
        >
          KABUL ET
        </button>
      </div>
    </div>
  );
}
