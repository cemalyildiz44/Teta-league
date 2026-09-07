'use client';
import { useActionState } from 'react';
import { createLeagueAction } from '../actions';

export function LeagueForm({ seasons }: { seasons: any[] }) {
  const [state, formAction, isPending] = useActionState(createLeagueAction as any, { error: '', success: '' });

  return (
    <form action={formAction} className="card-surface p-6 rounded-xl border border-white/5 space-y-4 mb-8">
      <h3 className="text-[#00e5ff] text-sm font-black tracking-widest uppercase mb-4">Yeni Lig Ekle</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sezon Seç</label>
          <select name="season_id" required className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none">
            <option value="">-- Seçiniz --</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Lig Adı</label>
          <input name="name" required placeholder="Süper Lig" className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Seviye (Tier)</label>
          <input name="level" type="number" defaultValue={1} min={1} required className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Durum</label>
          <select name="status" className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none">
            <option value="UPCOMING">Yaklaşan (UPCOMING)</option>
            <option value="ACTIVE">Aktif (ACTIVE)</option>
            <option value="COMPLETED">Tamamlandı (COMPLETED)</option>
          </select>
        </div>
      </div>

      {state?.error && <div className="text-red-500 text-xs font-bold p-2 bg-red-500/10 rounded">{state.error}</div>}
      {state?.success && <div className="text-emerald-500 text-xs font-bold p-2 bg-emerald-500/10 rounded">{state.success}</div>}

      <button disabled={isPending} type="submit" className="px-6 py-2 bg-[#00e5ff] text-black text-xs font-black rounded tracking-widest hover:bg-[#00b8d4] disabled:opacity-50">
        {isPending ? 'EKLENİYOR...' : 'LİG OLUŞTUR'}
      </button>
    </form>
  );
}
