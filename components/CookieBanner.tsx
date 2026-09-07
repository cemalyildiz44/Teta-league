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

  return (
    <div className="fixed bottom-0 left-0 w-full z-50 p-4 pointer-events-none flex justify-center">
      <div className="bg-[#060d18]/95 backdrop-blur-md border border-[#00e5ff]/20 rounded-xl p-5 shadow-[0_-5px_25px_rgba(0,0,0,0.5)] w-full max-w-4xl pointer-events-auto flex flex-col sm:flex-row items-center gap-4 sm:gap-8 justify-between relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00e5ff] rounded-full blur-[80px] opacity-10 pointer-events-none" />
        
        <div className="flex-1 text-sm text-gray-300 leading-relaxed">
          <p className="font-bold text-white tracking-wide mb-1 flex items-center gap-2">
            <span className="text-[#00e5ff]">TETA LEAGUE</span> ÇEREZ TERCİHLERİ
          </p>
          <p>
            Teta League platformunun güvenli ve düzgün çalışması, üye girişlerinin sağlanması ve temel işlevlerin yerine getirilebilmesi için <span className="text-white font-medium">zorunlu çerezler</span> kullanılmaktadır. Platformumuzda halihazırda reklam veya analiz amaçlı üçüncü taraf çerezler kullanılmamaktadır. Detaylı bilgi için <Link href="/cerez-politikasi" className="text-[#00e5ff] hover:underline whitespace-nowrap">Çerez Politikamızı</Link> inceleyebilirsiniz.
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
          <button 
            onClick={handleAccept}
            className="w-full sm:w-auto px-6 py-2.5 bg-[#00e5ff] hover:bg-[#00b8d4] text-black text-xs font-black tracking-widest rounded transition-all shadow-[0_0_15px_rgba(0,229,255,0.2)]"
          >
            TÜMÜNÜ KABUL ET
          </button>
        </div>
      </div>
    </div>
  );
}
