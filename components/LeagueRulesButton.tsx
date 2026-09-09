
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

import LeagueRulesViewer from './LeagueRulesViewer';

interface Props {
  leagueName: string;
  seasonName: string;
  rules?: any;
  className?: string;
  variant?: 'flat' | 'outline';
}

export default function LeagueRulesButton({ leagueName, seasonName, rules, className, variant = 'outline' }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const modalContent = isOpen ? (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-[#01060b]/85 backdrop-blur-md p-3 sm:p-4'>
      {/* Click-away backdrop */}
      <div className='absolute inset-0 z-0' onClick={() => setIsOpen(false)} />
      
      {/* Modal Container */}
      <div className='relative z-10 w-full max-w-[850px] max-h-[85vh] flex flex-col bg-[#03070c] border border-white/10 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden'>
        {/* Header */}
        <div className='flex items-center justify-between p-5 md:p-6 border-b border-white/10 bg-black/60 shrink-0'>
          <div>
            <h2 className='text-[18px] md:text-[22px] font-black text-white tracking-widest uppercase'>
              {leagueName}
            </h2>
            <p className='text-[11px] font-bold text-[#00e5ff] tracking-[0.2em] uppercase mt-1'>
              KURALLARI ({seasonName})
            </p>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
            className='w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#00e5ff]/50 text-white hover:text-[#00e5ff] flex items-center justify-center transition-all'
          >
            <svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'><line x1='18' y1='6' x2='6' y2='18'></line><line x1='6' y1='6' x2='18' y2='18'></line></svg>
          </button>
        </div>

        {/* Content Area */}
        <div className='p-6 md:p-8 overflow-y-auto custom-scrollbar flex-1 relative'>
          <LeagueRulesViewer rules={rules} leagueName={leagueName} seasonName={seasonName} />
        </div>
      </div>
    </div>
  ) : null;

  const buttonStyle = variant === 'flat' 
    ? 'flat-button w-full sm:w-auto text-center px-6 py-2.5 text-[13px] flex items-center justify-center gap-2 relative z-20 pointer-events-auto'
    : 'pointer-events-auto relative z-20 shrink-0 px-4 py-2 bg-black/50 border border-white/10 hover:border-[#00e5ff]/50 rounded-xl text-[11px] font-[900] tracking-[0.2em] text-white hover:text-[#00e5ff] uppercase flex items-center gap-2 transition-all shadow-lg';

  return (
    <>
      <button 
        onClick={(e) => { 
          e.preventDefault(); 
          e.stopPropagation(); 
          setIsOpen(true); 
        }}
        className={className || buttonStyle}
      >
        <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20'></path></svg>
        KURALLAR
      </button>

      {/* Render modal with React Portal */}
      {mounted && isOpen ? createPortal(modalContent, document.body) : null}
    </>
  );
}

