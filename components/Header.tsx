"use client";

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { logoutAction } from '@/app/auth/actions';
import { Lock } from 'lucide-react';

interface NavLink {
  label: string;
  href: string;
  locked?: boolean;
}

const leftLinks: NavLink[] = [
  { label: 'LİGLER', href: '/ligler' },
  { label: 'FİKSTÜR', href: '/fikstur' },
  { label: 'TURNUVALAR', href: '/turnuvalar' },
  { label: 'TAKIMLAR', href: '/takimlar' },
  { label: 'OYUNCULAR', href: '/oyuncular' },
];

const rightLinks: NavLink[] = [
  { label: 'HABERLER', href: '/haberler' },
  { label: 'SOSYAL', href: '/sosyal' },
  { label: 'MAĞAZA', href: '/magaza', locked: true },
];

export default function Header({ user, userProfile, activeTeam, unreadCount = 0 }: { user: any, userProfile?: any, activeTeam?: any, unreadCount?: number }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-50 w-full transition-all duration-300 ${scrolled ? 'bg-[#03070C]/90 backdrop-blur-md border-b border-[#00E5FF]/20 shadow-[0_4px_30px_rgba(0,0,0,0.8)]' : 'bg-[#03070C]/50 backdrop-blur-sm border-b border-transparent'}`}>
      <div className="mx-auto flex h-[90px] max-w-[1400px] items-center justify-between px-4 lg:px-6">
        
        {/* Desktop Nav - Left */}
        <nav className="hidden xl:flex items-center gap-8 flex-1 justify-end pr-8">
          {leftLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative text-[14px] font-[800] uppercase tracking-[0.1em] transition-all duration-300 ${isActive ? 'text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]' : 'text-gray-300 hover:text-[#00E5FF]'}`}
              >
                {link.label}
                {isActive && (
                  <span className="absolute -bottom-[35px] left-0 right-0 h-[2px] bg-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,1)]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Center Logo */}
        <Link href="/" className="flex items-center justify-center shrink-0 mx-4 relative group">
          <Image
            src="/logo-t.png"
            alt="TETA League"
            width={64}
            height={64}
            className="object-contain drop-shadow-[0_0_10px_rgba(0,229,255,0.2)] group-hover:drop-shadow-[0_0_20px_rgba(0,229,255,0.6)] group-hover:scale-105 transition-all duration-300"
          />
        </Link>

        {/* Desktop Nav - Right */}
        <div className="hidden xl:flex items-center gap-8 flex-1 justify-start pl-8 min-w-0">
          {rightLinks.map((link) => {
            if (link.locked) {
              return (
                <div
                  key={link.label}
                  className="relative flex items-center gap-1.5 text-[14px] font-[800] uppercase tracking-[0.1em] text-gray-500/70 hover:text-gray-400 cursor-not-allowed select-none transition-colors duration-200 group"
                  aria-disabled="true"
                  title="Mağaza Çok Yakında"
                >
                  <span>{link.label}</span>
                  <Lock size={13} className="text-gray-500 group-hover:text-gray-400 transition-colors" />
                </div>
              );
            }
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative text-[14px] font-[800] uppercase tracking-[0.1em] transition-all duration-300 ${isActive ? 'text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]' : 'text-gray-300 hover:text-[#00E5FF]'}`}
              >
                {link.label}
                {isActive && (
                  <span className="absolute -bottom-[35px] left-0 right-0 h-[2px] bg-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,1)]" />
                )}
              </Link>
            );
          })}

          {/* OYUNCUM */}
          {user ? (
            <Link
              href={userProfile?.username ? `/oyuncular/${userProfile.username}` : '/profil'}
              className={`relative text-[14px] font-[800] uppercase tracking-[0.1em] transition-all duration-300 ${pathname === (userProfile?.username ? `/oyuncular/${userProfile.username}` : '/profil') ? 'text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]' : 'text-gray-300 hover:text-[#00E5FF]'}`}
            >
              OYUNCUM
              {pathname === (userProfile?.username ? `/oyuncular/${userProfile.username}` : '/profil') && (
                <span className="absolute -bottom-[35px] left-0 right-0 h-[2px] bg-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,1)]" />
              )}
            </Link>
          ) : (
            <Link
              href="/giris"
              className="flex items-center gap-1.5 text-[14px] font-[800] uppercase tracking-[0.1em] text-gray-500 hover:text-[#00E5FF] transition-colors duration-300 opacity-70 hover:opacity-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              OYUNCUM
            </Link>
          )}

          {/* Action Buttons */}
          <div className="ml-4 flex items-center min-w-0">
            {user && userProfile ? (
              <div className="flex items-center gap-3">
                <Link href="/bildirimler" className="relative p-2 text-gray-400 hover:text-[#00e5ff] transition-colors rounded-full hover:bg-white/5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-lg shadow-red-500/50">
                      {unreadCount}
                    </span>
                  )}
                </Link>
                <Link 
                  href="/profil" 
                  className="client-glass flex items-center gap-3 p-1.5 pr-4 rounded-full border border-white/5 bg-[#03070c]/50 hover:border-[#00e5ff]/40 hover:bg-[#00e5ff]/5 transition-all group shrink-0"
                  title="Hesap Ayarları"
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-black border border-white/10 shrink-0 group-hover:border-[#00e5ff]/30 transition-colors">
                    {userProfile.avatar_url ? (
                      <img src={userProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-[#00e5ff] text-[12px]">
                        {userProfile.username?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 max-w-[120px]">
                    <span className="text-[12px] font-[900] text-white tracking-widest truncate group-hover:text-[#00e5ff] transition-colors uppercase leading-tight">
                      {userProfile.username}
                    </span>
                    <span className="text-[9px] font-[800] text-gray-500 tracking-[0.2em] uppercase truncate leading-tight mt-0.5 group-hover:text-gray-400 transition-colors">
                      {activeTeam ? activeTeam.name : "Takımsız"}
                    </span>
                  </div>
                </Link>
                <button
                  onClick={() => logoutAction()}
                  className="px-4 py-2 h-[44px] flex items-center text-[10px] font-[900] tracking-[0.1em] text-red-400 border border-red-500/20 bg-red-500/5 rounded-xl hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-300 transition-all uppercase shrink-0"
                >
                  ÇIKIŞ
                </button>
              </div>
            ) : user ? (
              <div className="flex items-center gap-4">
                <span className="text-[13px] font-[800] text-white tracking-widest bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                  {user.user_metadata?.username || user.email?.split('@')[0]}
                </span>
                <button
                  onClick={() => logoutAction()}
                  className="px-4 py-2 text-[12px] font-[800] tracking-wider text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/10 transition-all"
                >
                  ÇIKIŞ
                </button>
              </div>
            ) : (
              <Link
                href="/giris"
                className="flat-button flat-button-solid px-6 py-2 text-[13px]"
              >
                OTURUM AÇ
              </Link>
            )}
          </div>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="xl:hidden flex flex-col gap-1.5 p-2 z-50"
          aria-label="Menü"
        >
          <span className={`block h-0.5 w-6 bg-white transition-transform ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block h-0.5 w-6 bg-white transition-opacity ${mobileOpen ? 'opacity-0' : ''}`} />
          <span className={`block h-0.5 w-6 bg-white transition-transform ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="xl:hidden fixed top-[90px] left-0 w-full border-t border-[#00E5FF]/20 bg-[#03070C]/98 backdrop-blur-xl shadow-[0_10px_50px_rgba(0,0,0,0.9)] h-[calc(100vh-90px)]">
          <nav className="flex flex-col px-6 py-6 gap-6 h-full pb-12 overflow-y-auto">
            {[...leftLinks, ...rightLinks].map((link) => {
              if (link.locked) {
                return (
                  <div
                    key={link.label}
                    className="flex items-center gap-2 text-[16px] font-[800] uppercase tracking-widest text-gray-500/70 cursor-not-allowed select-none"
                    aria-disabled="true"
                  >
                    <span>{link.label}</span>
                    <Lock size={14} className="text-gray-500" />
                  </div>
                );
              }
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`text-[16px] font-[800] uppercase tracking-widest ${isActive ? 'text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]' : 'text-gray-300 hover:text-[#00E5FF]'}`}
                >
                  {link.label}
                </Link>
              );
            })}
            
            {user ? (
              <>
                <Link
                  href="/bildirimler"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center justify-between text-[16px] font-[800] uppercase tracking-widest ${pathname === '/bildirimler' ? 'text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]' : 'text-gray-300 hover:text-[#00E5FF]'}`}
                >
                  <span className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>
                    BİLDİRİMLER
                  </span>
                  {unreadCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </Link>
                <Link
                  href={userProfile?.username ? `/oyuncular/${userProfile.username}` : '/profil'}
                  onClick={() => setMobileOpen(false)}
                  className={`text-[16px] font-[800] uppercase tracking-widest ${pathname === (userProfile?.username ? `/oyuncular/${userProfile.username}` : '/profil') ? 'text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]' : 'text-gray-300 hover:text-[#00E5FF]'}`}
                >
                  OYUNCUM
                </Link>
              </>
            ) : (
              <Link
                href="/giris"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 text-[16px] font-[800] uppercase tracking-widest text-gray-500 hover:text-[#00E5FF]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                OYUNCUM
              </Link>
            )}

            <div className="my-2 h-px bg-white/10" />
            
            {user && userProfile ? (
              <div className="flex flex-col gap-4">
                <Link 
                  href="/profil"
                  onClick={() => setMobileOpen(false)}
                  className="client-glass flex items-center justify-between p-3 rounded-xl border border-white/5 bg-[#03070c]/50 hover:border-[#00e5ff]/40 transition-all group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-black border border-white/10 shrink-0 group-hover:border-[#00e5ff]/30 transition-colors">
                      {userProfile.avatar_url ? (
                        <img src={userProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-[#00e5ff] text-[18px]">
                          {userProfile.username?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[16px] font-[900] text-white tracking-widest truncate group-hover:text-[#00e5ff] transition-colors uppercase">
                        {userProfile.username}
                      </span>
                      <span className="text-[12px] font-[800] text-gray-500 tracking-[0.2em] uppercase truncate mt-0.5">
                        {activeTeam ? activeTeam.name : "Takımsız"}
                      </span>
                    </div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 group-hover:text-[#00e5ff] transition-colors"><path d="m9 18 6-6-6-6"></path></svg>
                </Link>
                <button
                  onClick={() => {
                    logoutAction();
                    setMobileOpen(false);
                  }}
                  className="w-full py-4 text-center text-[14px] font-[900] tracking-[0.1em] text-red-400 border border-red-500/20 bg-red-500/5 rounded-xl hover:bg-red-500/15 transition-all uppercase"
                >
                  ÇIKIŞ YAP
                </button>
              </div>
            ) : user ? (
              <div className="flex flex-col gap-4">
                <span className="text-[15px] font-[800] text-white tracking-widest bg-white/5 p-3 rounded-lg text-center">
                  {user.user_metadata?.username || user.email?.split('@')[0]}
                </span>
                <button
                  onClick={() => {
                    logoutAction();
                    setMobileOpen(false);
                  }}
                  className="w-full py-4 text-center text-[14px] font-[800] tracking-wider text-red-400 border border-red-500/30 rounded hover:bg-red-500/10 transition-all"
                >
                  ÇIKIŞ YAP
                </button>
              </div>
            ) : (
              <Link
                href="/giris"
                onClick={() => setMobileOpen(false)}
                className="flat-button flat-button-solid w-full py-4 text-[14px]"
              >
                OTURUM AÇ
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
