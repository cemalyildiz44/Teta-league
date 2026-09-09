'use client';

import { useActionState, useState } from 'react';
import { addAchievementAction, deleteAchievementAction } from './actions';
import { Trophy, Trash2, Shield, Calendar, Hash, Star } from 'lucide-react';

export default function AchievementsClient({ profiles, seasons, matches, achievements }: any) {
  const [state, formAction, pending] = useActionState(addAchievementAction, null);
  const [selectedType, setSelectedType] = useState('TOTW');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Bu başarımı silmek istediğinize emin misiniz?')) return;
    setIsDeleting(id);
    const res = await deleteAchievementAction(id);
    setIsDeleting(null);
    if (res.error) alert(res.error);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
          <Trophy className="w-5 h-5 text-yellow-500" />
        </div>
        <div>
          <h1 className="text-2xl font-[900] text-white tracking-tight uppercase">Oyuncu Başarımları</h1>
          <p className="text-gray-400 text-sm font-medium mt-1">TOTW, POTM ve POTS ödüllerini yönet</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#03070c] border border-white/5 rounded-2xl p-6">
            <h2 className="text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-6 flex items-center gap-2">
              <Star className="w-4 h-4" /> YENİ BAŞARIM EKLE
            </h2>
            
            {state?.success && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-6">
                {state.success}
              </div>
            )}
            
            {state?.error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold mb-6">
                {state.error}
              </div>
            )}

            <form action={formAction} className="space-y-4">
              <div>
                <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">OYUNCU</label>
                <select name="player_id" required className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors">
                  <option value="">Oyuncu Seçin...</option>
                  {profiles.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.username}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">BAŞARIM TÜRÜ</label>
                <select 
                  name="achievement_type" 
                  required 
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
                >
                  <option value="TOTW">Haftanın Takımı (TOTW)</option>
                  <option value="MATCH_POTM">Maçın Oyuncusu (POTM)</option>
                  <option value="MONTH_POTM">Ayın Oyuncusu (POTM)</option>
                  <option value="POTS">Sezonun Oyuncusu (POTS)</option>
                  <option value="KARMA_WINNER">KARMA WINNER</option>
                  <option value="1V1_WINNER">1V1 WINNER</option>
                  <option value="NIGHT_CUP_WINNER">NIGHT CUP WINNER</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">SEZON (OPSİYONEL/ÖNERİLEN)</label>
                <select name="season_id" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors">
                  <option value="">Sezon Seçin (Zorunlu Değil)...</option>
                  {seasons.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {selectedType === 'MATCH_POTM' && (
                <div>
                  <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">İLGİLİ MAÇ</label>
                  <select name="match_id" required className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors">
                    <option value="">Maç Seçin...</option>
                    {matches.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {new Date(m.played_at).toLocaleDateString()} - {m.home_team?.name} vs {m.away_team?.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedType === 'TOTW' && (
                <div>
                  <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">HAFTA NO</label>
                  <input type="number" name="week_number" min="1" required className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors" placeholder="Örn: 1" />
                </div>
              )}

              {selectedType === 'MONTH_POTM' && (
                <div>
                  <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">AY NO (1-12)</label>
                  <input type="number" name="month_number" min="1" max="12" required className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors" placeholder="Örn: 9" />
                </div>
              )}

              <button type="submit" disabled={pending} className="w-full mt-4 px-6 py-3 bg-[#00e5ff]/10 text-[#00e5ff] hover:bg-[#00e5ff]/20 border border-[#00e5ff]/20 text-[11px] font-[900] tracking-[0.2em] uppercase rounded-xl transition-colors disabled:opacity-50">
                {pending ? 'Ekleniyor...' : 'Başarım Ekle'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-[#03070c] border border-white/5 rounded-2xl p-6">
            <h2 className="text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-6 flex items-center gap-2">
              <Shield className="w-4 h-4" /> VERİLEN BAŞARIMLAR (SON 100)
            </h2>
            
            {achievements.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="py-3 px-4 text-[10px] font-[900] text-gray-500 tracking-widest uppercase">Oyuncu</th>
                      <th className="py-3 px-4 text-[10px] font-[900] text-gray-500 tracking-widest uppercase">Başarım</th>
                      <th className="py-3 px-4 text-[10px] font-[900] text-gray-500 tracking-widest uppercase">Detay</th>
                      <th className="py-3 px-4 text-[10px] font-[900] text-gray-500 tracking-widest uppercase text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {achievements.map((a: any) => (
                      <tr key={a.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 px-4">
                          <span className="text-[14px] font-[700] text-white">{a.profile?.username}</span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex px-2 py-1 rounded text-[10px] font-[900] tracking-wider uppercase border 
                            ${a.achievement_type === 'TOTW' ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-[#00e5ff]/20' : ''}
                            ${a.achievement_type === 'MATCH_POTM' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : ''}
                            ${a.achievement_type === 'MONTH_POTM' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : ''}
                            ${a.achievement_type === 'POTS' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : ''}
                            ${a.achievement_type === 'KARMA_WINNER' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}
                            ${a.achievement_type === '1V1_WINNER' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : ''}
                            ${a.achievement_type === 'NIGHT_CUP_WINNER' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : ''}
                          `}>
                            {a.achievement_type === 'KARMA_WINNER' ? 'KARMA WINNER' :
                             a.achievement_type === '1V1_WINNER' ? '1V1 WINNER' :
                             a.achievement_type === 'NIGHT_CUP_WINNER' ? 'NIGHT CUP WINNER' :
                             a.achievement_type}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-xs font-medium text-gray-400">
                          {a.season?.name && <span className="block">{a.season.name}</span>}
                          {a.week_number && <span>Hafta {a.week_number} </span>}
                          {a.month_number && <span>Ay {a.month_number} </span>}
                          {a.match && <span className="block mt-1 truncate max-w-[200px]">{a.match.home_team?.name} vs {a.match.away_team?.name}</span>}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button 
                            onClick={() => handleDelete(a.id)}
                            disabled={isDeleting === a.id}
                            className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors border border-red-500/20 disabled:opacity-50"
                            title="Başarımı İptal Et"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-sm font-bold text-gray-500">
                Henüz verilmiş bir başarım yok.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
