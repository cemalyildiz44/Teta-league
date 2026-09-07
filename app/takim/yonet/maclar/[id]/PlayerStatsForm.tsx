'use client';
import { useState, useActionState } from 'react';
import { submitPlayerStatsAction } from '../actions';

export function PlayerStatsForm({ matchId, roster, existingStats }: { matchId: string, roster: any[], existingStats: any[] }) {
  const [state, formAction, isPending] = useActionState(async (prevState: any, formData: FormData) => {
    const payloadStr = formData.get('payload') as string;
    const payload = JSON.parse(payloadStr);
    return submitPlayerStatsAction(matchId, payload);
  }, { error: '', success: '' } as any);

  // Initialize form state
  const [stats, setStats] = useState(() => {
    const initial: Record<string, any> = {};
    roster.forEach(p => {
      const existing = existingStats.find(s => s.player_id === p.id);
      initial[p.id] = existing || {
        player_id: p.id,
        goals: 0,
        assists: 0,
        rating: 0,
        shots: 0,
        passes_made: 0,
        pass_attempts: 0,
        tackles_made: 0,
        tackle_attempts: 0,
        saves: 0,
        goals_conceded: 0,
        cleansheets_gk: 0,
        cleansheets_def: 0,
        red_cards: 0,
        is_mom: false
      };
    });
    return initial;
  });

  const handleChange = (playerId: string, field: string, value: any) => {
    setStats(prev => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [field]: value
      }
    }));
  };

  const payload = Object.values(stats);

  return (
    <form action={formAction} className="card-surface p-6 rounded-xl border border-white/5 space-y-6">
      <h3 className="text-[#00e5ff] text-sm font-black tracking-widest uppercase mb-4">Oyuncu İstatistikleri</h3>
      
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <div className="overflow-x-auto custom-scrollbar pb-4">
        <table className="w-full text-left text-[10px] md:text-xs">
          <thead className="text-gray-500 font-bold uppercase tracking-widest border-b border-white/10">
            <tr>
              <th className="pb-3 pr-4 min-w-[150px]">Oyuncu</th>
              <th className="pb-3 px-2 text-center" title="Gol">GOL</th>
              <th className="pb-3 px-2 text-center" title="Asist">AST</th>
              <th className="pb-3 px-2 text-center" title="Rating">RTG</th>
              <th className="pb-3 px-2 text-center" title="Şut">ŞUT</th>
              <th className="pb-3 px-2 text-center" title="Pas (İsabetli)">PAS</th>
              <th className="pb-3 px-2 text-center" title="Pas (Deneme)">PAS(D)</th>
              <th className="pb-3 px-2 text-center" title="Müdahale">MÜD</th>
              <th className="pb-3 px-2 text-center" title="Müdahale (Deneme)">MÜD(D)</th>
              <th className="pb-3 px-2 text-center" title="Kurtarış">KUR</th>
              <th className="pb-3 px-2 text-center" title="Yenilen Gol">YG</th>
              <th className="pb-3 px-2 text-center" title="Clean Sheet (Defans)">CS(D)</th>
              <th className="pb-3 px-2 text-center" title="Kırmızı Kart">KIR</th>
              <th className="pb-3 pl-4 text-center">Maçın Adamı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-gray-300">
            {roster.map(p => {
              const row = stats[p.id];
              return (
                <tr key={p.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-3 pr-4 font-bold text-white truncate max-w-[150px]">{p.username}</td>
                  <td className="py-3 px-1"><input type="number" min="0" value={row.goals} onChange={e => handleChange(p.id, 'goals', Number(e.target.value))} className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" value={row.assists} onChange={e => handleChange(p.id, 'assists', Number(e.target.value))} className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" max="10" step="0.1" value={row.rating} onChange={e => handleChange(p.id, 'rating', Number(e.target.value))} className="w-12 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" value={row.shots} onChange={e => handleChange(p.id, 'shots', Number(e.target.value))} className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" value={row.passes_made} onChange={e => handleChange(p.id, 'passes_made', Number(e.target.value))} className="w-12 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" value={row.pass_attempts} onChange={e => handleChange(p.id, 'pass_attempts', Number(e.target.value))} className="w-12 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" value={row.tackles_made} onChange={e => handleChange(p.id, 'tackles_made', Number(e.target.value))} className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" value={row.tackle_attempts} onChange={e => handleChange(p.id, 'tackle_attempts', Number(e.target.value))} className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" value={row.saves} onChange={e => handleChange(p.id, 'saves', Number(e.target.value))} className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" value={row.goals_conceded} onChange={e => handleChange(p.id, 'goals_conceded', Number(e.target.value))} className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" max="1" value={row.cleansheets_def} onChange={e => handleChange(p.id, 'cleansheets_def', Number(e.target.value))} className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 px-1"><input type="number" min="0" value={row.red_cards} onChange={e => handleChange(p.id, 'red_cards', Number(e.target.value))} className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center focus:border-[#00e5ff]" /></td>
                  <td className="py-3 pl-4 text-center">
                    <input type="checkbox" checked={row.is_mom} onChange={e => handleChange(p.id, 'is_mom', e.target.checked)} className="w-4 h-4 accent-[#00e5ff] bg-[#060d18]" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state?.error && <div className="text-red-500 text-xs font-bold p-3 bg-red-500/10 border border-red-500/30 rounded">{state.error}</div>}
      {state?.success && <div className="text-emerald-500 text-xs font-bold p-3 bg-emerald-500/10 border border-emerald-500/30 rounded">{state.success}</div>}

      <div className="pt-4 flex justify-end">
        <button disabled={isPending} type="submit" className="px-8 py-3.5 bg-[#00e5ff] text-black text-xs font-black rounded-lg tracking-widest hover:bg-[#00b8d4] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(0,229,255,0.3)]">
          {isPending ? 'KAYDEDİLİYOR...' : 'İSTATİSTİKLERİ KAYDET'}
        </button>
      </div>
    </form>
  );
}
