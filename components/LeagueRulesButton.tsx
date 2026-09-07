
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

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

  const hasRules = rules && Object.keys(rules).length > 0 && rules.description;

  const modalContent = isOpen ? (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-[#01060b]/80 backdrop-blur-md p-3'>
      {/* Click-away backdrop */}
      <div className='absolute inset-0 z-0' onClick={() => setIsOpen(false)} />
      
      {/* Modal Container */}
      <div className='relative z-10 w-full max-w-[800px] max-h-[85vh] flex flex-col client-glass bg-[#03070c] border border-[#00e5ff]/30 rounded-2xl shadow-[0_0_50px_rgba(0,229,255,0.15)] overflow-hidden'>
        {/* Header */}
        <div className='flex items-center justify-between p-5 md:p-6 border-b border-white/10 bg-black/60 shrink-0'>
          <div>
            <h2 className='text-[18px] md:text-[22px] font-[900] text-white tracking-widest uppercase drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]'>
              {leagueName}
            </h2>
            <p className='text-[11px] font-[800] text-[#00e5ff] tracking-[0.2em] uppercase mt-1'>
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
        <div className='p-6 md:p-8 overflow-y-auto custom-scrollbar flex-1 relative bg-gradient-to-b from-[#03070c] to-[#010408]'>
          {!hasRules ? (
            <div className='empty-state !py-20 !border-0 bg-transparent flex flex-col items-center justify-center'>
              <span className='text-[48px] mb-6 drop-shadow-[0_0_15px_rgba(0,229,255,0.2)]'>⚖️</span>
              <span className='empty-state-title text-[20px] text-white tracking-widest uppercase mb-3 drop-shadow-md'>Kurallar Henüz Eklenmedi</span>
              <span className='empty-state-desc text-[14px] max-w-sm mx-auto text-gray-400'>Bu ligin kuralları henüz yayınlanmamıştır. Daha sonra tekrar kontrol edin.</span>
            </div>
          ) : (
            <div className='space-y-8 text-gray-300 text-[15px] leading-relaxed'>
              {rules.description && (
                <section>
                  <h3 className='text-cyan-400 font-bold uppercase tracking-widest text-xs mb-3'>Genel Açıklama</h3>
                  <p className='whitespace-pre-wrap text-sm text-zinc-300'>{rules.description}</p>
                </section>
              )}
              {rules.participation && rules.participation.length > 0 && (
                <section>
                  <h3 className='text-cyan-400 font-bold uppercase tracking-widest text-xs mb-3'>Katılım Şartları</h3>
                  <ul className='list-disc pl-5 space-y-2 text-sm text-zinc-300'>
                    {rules.participation.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </section>
              )}
              {rules.match_rules && rules.match_rules.length > 0 && (
                <section>
                  <h3 className='text-cyan-400 font-bold uppercase tracking-widest text-xs mb-3'>Maç Kuralları</h3>
                  <ul className='list-disc pl-5 space-y-2 text-sm text-zinc-300'>
                    {rules.match_rules.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </section>
              )}
              {rules.points && (
                <section>
                  <h3 className='text-cyan-400 font-bold uppercase tracking-widest text-xs mb-3'>Puanlama Sistemi</h3>
                  <div className='grid grid-cols-3 gap-4 max-w-sm'>
                    <div className='bg-white/5 p-3 rounded-lg border border-white/5 text-center'>
                      <div className='text-[10px] uppercase font-bold text-emerald-400 mb-1'>Galibiyet</div>
                      <div className='text-2xl font-black text-white'>{rules.points.win}</div>
                    </div>
                    <div className='bg-white/5 p-3 rounded-lg border border-white/5 text-center'>
                      <div className='text-[10px] uppercase font-bold text-amber-400 mb-1'>Beraberlik</div>
                      <div className='text-2xl font-black text-white'>{rules.points.draw}</div>
                    </div>
                    <div className='bg-white/5 p-3 rounded-lg border border-white/5 text-center'>
                      <div className='text-[10px] uppercase font-bold text-red-400 mb-1'>Mağlubiyet</div>
                      <div className='text-2xl font-black text-white'>{rules.points.loss}</div>
                    </div>
                  </div>
                </section>
              )}
              {rules.promotion_relegation && (
                <section>
                  <h3 className='text-cyan-400 font-bold uppercase tracking-widest text-xs mb-3'>Yükselme / Küme Düşme</h3>
                  <p className='whitespace-pre-wrap text-sm text-zinc-300'>{rules.promotion_relegation}</p>
                </section>
              )}
              {rules.additional_rules && rules.additional_rules.length > 0 && (
                <section>
                  <h3 className='text-cyan-400 font-bold uppercase tracking-widest text-xs mb-3'>Ek Kurallar</h3>
                  <ul className='list-disc pl-5 space-y-2 text-sm text-zinc-300'>
                    {rules.additional_rules.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </section>
              )}
            </div>
          )}
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

