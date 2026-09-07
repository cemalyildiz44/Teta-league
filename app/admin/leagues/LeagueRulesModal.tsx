
'use client';
import { useState } from 'react';
import { X, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { saveLeagueRulesAction } from './actions';
import { useRouter } from 'next/navigation';

export function LeagueRulesModal({ league, onClose }: { league: any, onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Default rules structure
  const defaultRules = {
    description: '',
    participation: [],
    match_rules: [],
    points: { win: 3, draw: 1, loss: 0 },
    promotion_relegation: '',
    additional_rules: []
  };

  const [rules, setRules] = useState(league.rules || defaultRules);

  const handleArrayAdd = (key: 'participation' | 'match_rules' | 'additional_rules') => {
    setRules({ ...rules, [key]: [...rules[key], ''] });
  };
  
  const handleArrayChange = (key: 'participation' | 'match_rules' | 'additional_rules', index: number, val: string) => {
    const newArr = [...rules[key]];
    newArr[index] = val;
    setRules({ ...rules, [key]: newArr });
  };
  
  const handleArrayRemove = (key: 'participation' | 'match_rules' | 'additional_rules', index: number) => {
    const newArr = rules[key].filter((_: any, i: number) => i !== index);
    setRules({ ...rules, [key]: newArr });
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    
    // Clean empty strings
    const cleanRules = { ...rules };
    cleanRules.participation = cleanRules.participation.filter((x: string) => x.trim() !== '');
    cleanRules.match_rules = cleanRules.match_rules.filter((x: string) => x.trim() !== '');
    cleanRules.additional_rules = cleanRules.additional_rules.filter((x: string) => x.trim() !== '');

    const res = await saveLeagueRulesAction(league.id, cleanRules);
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
      <div className='card-surface w-full max-w-4xl my-8 rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]'>
        <div className='p-6 border-b border-white/5 flex items-center justify-between bg-[#0a1628] shrink-0'>
          <div>
            <h2 className='text-lg font-black text-white uppercase tracking-widest'>{league.name}</h2>
            <p className='text-[10px] text-cyan-400 font-bold uppercase tracking-widest mt-1'>Kuralları Düzenle</p>
          </div>
          <button onClick={onClose} className='p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors'><X className='w-5 h-5'/></button>
        </div>
        
        <div className='p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8 bg-[#060d18]'>
          {error && <div className='p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-lg'>{error}</div>}
          
          <div className='space-y-4'>
            <label className='text-xs font-black text-zinc-500 tracking-widest uppercase'>Genel Açıklama</label>
            <textarea 
              value={rules.description || ''} 
              onChange={e => setRules({...rules, description: e.target.value})} 
              className='w-full h-24 bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-cyan-500 outline-none resize-none'
              placeholder='Lig hakkında genel bilgi...'
            />
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-white/5 rounded-xl border border-white/5'>
            <div className='space-y-2'>
              <label className='text-[10px] font-black text-zinc-500 tracking-widest uppercase'>Galibiyet Puanı</label>
              <input type='number' value={rules.points?.win ?? 3} onChange={e => setRules({...rules, points: {...rules.points, win: parseInt(e.target.value)}})} className='w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
            </div>
            <div className='space-y-2'>
              <label className='text-[10px] font-black text-zinc-500 tracking-widest uppercase'>Beraberlik Puanı</label>
              <input type='number' value={rules.points?.draw ?? 1} onChange={e => setRules({...rules, points: {...rules.points, draw: parseInt(e.target.value)}})} className='w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
            </div>
            <div className='space-y-2'>
              <label className='text-[10px] font-black text-zinc-500 tracking-widest uppercase'>Mağlubiyet Puanı</label>
              <input type='number' value={rules.points?.loss ?? 0} onChange={e => setRules({...rules, points: {...rules.points, loss: parseInt(e.target.value)}})} className='w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
            </div>
          </div>

          <ArrayEditor title='Katılım Şartları' items={rules.participation || []} onAdd={() => handleArrayAdd('participation')} onChange={(i: number, v: string) => handleArrayChange('participation', i, v)} onRemove={(i: number) => handleArrayRemove('participation', i)} />
          <ArrayEditor title='Maç Kuralları' items={rules.match_rules || []} onAdd={() => handleArrayAdd('match_rules')} onChange={(i: number, v: string) => handleArrayChange('match_rules', i, v)} onRemove={(i: number) => handleArrayRemove('match_rules', i)} />
          
          <div className='space-y-4'>
            <label className='text-xs font-black text-zinc-500 tracking-widest uppercase'>Yükselme / Küme Düşme</label>
            <textarea 
              value={rules.promotion_relegation || ''} 
              onChange={e => setRules({...rules, promotion_relegation: e.target.value})} 
              className='w-full h-24 bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-cyan-500 outline-none resize-none'
              placeholder='Ligden çıkma ve düşme senaryoları...'
            />
          </div>

          <ArrayEditor title='Ek Kurallar' items={rules.additional_rules || []} onAdd={() => handleArrayAdd('additional_rules')} onChange={(i: number, v: string) => handleArrayChange('additional_rules', i, v)} onRemove={(i: number) => handleArrayRemove('additional_rules', i)} />
        </div>

        <div className='p-6 border-t border-white/5 bg-[#0a1628] flex justify-end gap-3 shrink-0'>
          <button onClick={onClose} className='px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors'>İPTAL</button>
          <button onClick={handleSave} disabled={loading} className='px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-xs font-black flex items-center gap-2 transition-colors disabled:opacity-50'>
            {loading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Save className='w-4 h-4' />} KAYDET
          </button>
        </div>
      </div>
    </div>
  );
}

function ArrayEditor({ title, items, onAdd, onChange, onRemove }: any) {
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <label className='text-xs font-black text-zinc-500 tracking-widest uppercase'>{title}</label>
        <button onClick={onAdd} className='px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold rounded flex items-center gap-1'><Plus className='w-3 h-3'/> EKLE</button>
      </div>
      <div className='space-y-3'>
        {items.length === 0 && <div className='text-xs text-zinc-600 font-mono'>Kayıt yok. Ekle butonunu kullanın.</div>}
        {items.map((item: string, i: number) => (
          <div key={i} className='flex gap-2'>
            <input 
              value={item} 
              onChange={e => onChange(i, e.target.value)} 
              className='flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none' 
              placeholder={(i+1) + '. kural...'}
            />
            <button onClick={() => onRemove(i)} className='p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors shrink-0'><Trash2 className='w-4 h-4'/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

