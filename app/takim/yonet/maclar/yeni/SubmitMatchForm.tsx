'use client';
import { useActionState } from 'react';
import { submitMatchAction } from '../actions';

export function SubmitMatchForm({ fixture, homeTeam, awayTeam }: { fixture: any, homeTeam: any, awayTeam: any }) {
  const [state, formAction, isPending] = useActionState(submitMatchAction as any, { error: '', success: '' } as any);

  return (
    <form action={formAction} className="card-surface p-6 rounded-xl border border-white/5 space-y-6">
      <input type="hidden" name="fixture_id" value={fixture.id} />
      
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-8 bg-[#0a1628] p-6 rounded-xl border border-white/5">
        <div className="flex flex-col items-center">
          <div className="text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">Ev Sahibi</div>
          <div className="font-bold text-white text-lg">{homeTeam.name}</div>
        </div>
        
        <div className="flex items-center gap-4">
          <input type="number" name="home_score" min="0" required className="w-16 h-16 text-center text-2xl font-black bg-[#060d18] border border-[#00e5ff]/50 rounded-xl text-white focus:outline-none focus:border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)]" />
          <span className="text-xl font-black text-gray-600">-</span>
          <input type="number" name="away_score" min="0" required className="w-16 h-16 text-center text-2xl font-black bg-[#060d18] border border-[#00e5ff]/50 rounded-xl text-white focus:outline-none focus:border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)]" />
        </div>

        <div className="flex flex-col items-center">
          <div className="text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">Deplasman</div>
          <div className="font-bold text-white text-lg">{awayTeam.name}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Maç Tarihi / Saati</label>
          <input type="datetime-local" name="played_at" defaultValue={fixture.scheduled_at.slice(0,16)} required className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-3 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Kanıt Fotoğrafı URL (Opsiyonel)</label>
          <input type="url" name="screenshot_url" placeholder="https://..." className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-3 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none" />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Notlar / İtiraz (Opsiyonel)</label>
        <textarea name="notes" rows={3} className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-3 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none resize-none" placeholder="Maçla ilgili belirtmek istediğiniz bir şey varsa yazın..."></textarea>
      </div>

      {state?.error && <div className="text-red-500 text-xs font-bold p-3 bg-red-500/10 border border-red-500/30 rounded">{state.error}</div>}
      {state?.success && <div className="text-emerald-500 text-xs font-bold p-3 bg-emerald-500/10 border border-emerald-500/30 rounded">{state.success}</div>}

      <div className="pt-4 flex justify-end">
        <button disabled={isPending} type="submit" className="px-8 py-3.5 bg-[#00e5ff] text-black text-xs font-black rounded-lg tracking-widest hover:bg-[#00b8d4] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(0,229,255,0.3)]">
          {isPending ? 'GÖNDERİLİYOR...' : 'SONUCU GÖNDER'}
        </button>
      </div>
    </form>
  );
}
