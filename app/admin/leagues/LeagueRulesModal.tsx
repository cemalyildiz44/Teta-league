'use client';

import { useState } from 'react';
import { X, Loader2, Save, BookOpen } from 'lucide-react';
import { saveLeagueRulesAction } from './actions';
import { useRouter } from 'next/navigation';
import { extractRulesText } from '@/components/LeagueRulesViewer';

export function LeagueRulesModal({ league, onClose }: { league: any, onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rulesText, setRulesText] = useState(() => extractRulesText(league.rules));

  const handleSave = async () => {
    setLoading(true);
    setError('');

    const res = await saveLeagueRulesAction(league.id, { text: rulesText.trim() });
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      router.refresh();
      onClose();
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto'>
      <div className='card-surface w-full max-w-3xl my-8 rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh] bg-[#03070c] shadow-2xl'>
        {/* Header */}
        <div className='p-6 border-b border-white/5 flex items-center justify-between bg-[#0a1628] shrink-0'>
          <div className='flex items-center gap-3'>
            <div className='w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400'>
              <BookOpen className='w-4 h-4' />
            </div>
            <div>
              <h2 className='text-lg font-black text-white uppercase tracking-widest'>{league.name}</h2>
              <p className='text-[10px] text-cyan-400 font-bold uppercase tracking-widest mt-0.5'>Lig Kurallarını Yönet</p>
            </div>
          </div>
          <button onClick={onClose} className='p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors'>
            <X className='w-5 h-5'/>
          </button>
        </div>
        
        {/* Content */}
        <div className='p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4 bg-[#060d18]'>
          {error && (
            <div className='p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-xl'>
              {error}
            </div>
          )}

          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <label className='text-xs font-black text-zinc-400 tracking-widest uppercase'>
                KURALLAR METNİ (DÜZ METİN)
              </label>
              <span className='text-[11px] text-zinc-500'>
                Otomatik biçimlendirilir
              </span>
            </div>

            <p className='text-[11px] text-zinc-400 leading-relaxed bg-white/[0.02] border border-white/5 rounded-xl p-3'>
              💡 <span className='text-zinc-300 font-bold'>Format Rehberi:</span> Başlıkları tamamen <span className='text-cyan-400 font-bold'>BÜYÜK HARFLE</span> yazın (Örn: <code className='text-white'>GENEL KURALLAR</code>). Maddeli kuralları tire (<code className='text-white'>-</code>) veya nokta (<code className='text-white'>•</code>) ile başlatın. HTML etiketleri kullanmanıza gerek yoktur.
            </p>

            <textarea
              value={rulesText}
              onChange={e => setRulesText(e.target.value)}
              className='w-full h-80 sm:h-96 bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-cyan-500 outline-none resize-none font-mono leading-relaxed placeholder:text-zinc-600'
              placeholder={`GENEL KURALLAR\n\nTakımlar maç saatinden 15 dakika önce hazır bulunmalıdır.\nOyuncular resmi PSN / EA ID ile oynamak zorundadır.\n\nTRANSFER KURALLARI\n\n- Transfer dönemi sezon ortasında 3 gün sürer.\n- Takım başına maksimum 3 transfer yapılabilir.\n\nMAÇ KURALLARI\n\n- Skor ekran görüntüsü maç bitiminde sisteme yüklenmelidir.\n- Kural ihlali durumunda maç tescil edilmez.`}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className='p-6 border-t border-white/5 bg-[#0a1628] flex justify-end gap-3 shrink-0'>
          <button onClick={onClose} className='px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-colors'>
            İPTAL
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className='px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-xl text-xs font-black flex items-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-cyan-500/20'
          >
            {loading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Save className='w-4 h-4' />} KAYDET
          </button>
        </div>
      </div>
    </div>
  );
}
