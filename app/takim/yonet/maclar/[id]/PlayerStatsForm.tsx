'use client';

import { useState, useActionState } from 'react';
import { submitPlayerStatsAction } from '../actions';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { STARTING_LINEUP_COUNT, getRequiredLineupCount } from '@/lib/match-reporting';

export function PlayerStatsForm({
  matchId,
  roster,
  existingStats,
}: {
  matchId: string;
  roster: any[];
  existingStats: any[];
}) {
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
      const payloadStr = formData.get('payload') as string;
      const payload = JSON.parse(payloadStr);
      return submitPlayerStatsAction(matchId, payload);
    },
    { error: '', success: '' } as any
  );

  // Initialize form state
  const [stats, setStats] = useState(() => {
    const initial: Record<string, any> = {};
    const hasAnyExisting = existingStats && existingStats.length > 0;

    roster.forEach((p, idx) => {
      const existing = existingStats?.find((s) => s.player_id === p.id);
      if (existing) {
        initial[p.id] = {
          ...existing,
          position: existing.position || p.primary_position || 'MID',
          played: true,
        };
      } else {
        initial[p.id] = {
          player_id: p.id,
          position: p.primary_position || 'MID',
          // Default to first 11 selected if no existing stats yet
          played: hasAnyExisting ? false : idx < STARTING_LINEUP_COUNT,
          goals: 0,
          assists: 0,
          rating: '',
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
          is_mom: false,
        };
      }
    });
    return initial;
  });

  const handleChange = (playerId: string, field: string, value: any) => {
    setStats((prev) => {
      const next = { ...prev };
      // Single MOM rule: If true, uncheck others
      if (field === 'is_mom' && value === true) {
        Object.keys(next).forEach((id) => {
          if (id !== playerId) {
            next[id] = { ...next[id], is_mom: false };
          }
        });
      }
      next[playerId] = {
        ...next[playerId],
        [field]: value,
      };
      return next;
    });
  };

  const payload = Object.values(stats);
  const selectedCount = payload.filter((r: any) => r.played !== false).length;
  const requiredLineupCount = getRequiredLineupCount(roster.length || STARTING_LINEUP_COUNT);

  if (!roster || roster.length === 0) {
    return (
      <div className="card-surface p-6 rounded-xl border border-white/5 text-center text-gray-400 text-sm">
        Bu takım için aktif kadroda oyuncu bulunamadı.
      </div>
    );
  }

  return (
    <form action={formAction} className="card-surface p-6 rounded-xl border border-white/5 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <h3 className="text-[#00e5ff] text-sm font-black tracking-widest uppercase">
            İlk 11 Oyuncu İstatistikleri Girişi
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Maçta ilk 11 oynayan tam {STARTING_LINEUP_COUNT} oyuncuyu işaretleyip istatistiklerini girin.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <span
            className={`text-[10px] font-black px-2.5 py-1 rounded border uppercase tracking-wider ${
              selectedCount === requiredLineupCount
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400'
            }`}
          >
            Seçilen İlk 11: {selectedCount} / {requiredLineupCount}
          </span>
          <span className="text-[10px] font-bold text-gray-500 bg-[#0a1628] px-2.5 py-1 rounded border border-white/5">
            Kadro: {roster.length} Oyuncu
          </span>
        </div>
      </div>

      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <div className="overflow-x-auto custom-scrollbar pb-4">
        <table className="w-full text-left text-[11px] md:text-xs">
          <thead className="text-gray-500 font-bold uppercase tracking-widest border-b border-white/10 bg-[#0a1628]/50">
            <tr>
              <th className="py-2.5 px-3 text-center w-12" title="İlk 11 Oynadı mı?">
                İLK 11
              </th>
              <th className="py-2.5 pr-4 min-w-[140px]">Oyuncu</th>
              <th className="py-2.5 px-1.5 text-center" title="Mevki">
                MEV
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Gol">
                GOL
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Asist">
                AST
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Maç Reytingi (0-10)">
                RTG
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Toplam Şut">
                ŞUT
              </th>
              <th className="py-2.5 px-1.5 text-center" title="İsabetli Pas">
                PAS
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Toplam Pas Denemesi">
                PAS(D)
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Başarılı Müdahale">
                MÜD
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Müdahale Denemesi">
                MÜD(D)
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Kurtarış (Kaleci)">
                KUR
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Yenilen Gol">
                YG
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Gol Yememe (Kaleci)">
                CS(GK)
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Gol Yememe (Defans)">
                CS(DEF)
              </th>
              <th className="py-2.5 px-1.5 text-center" title="Kırmızı Kart">
                KIR
              </th>
              <th className="py-2.5 px-3 text-center" title="Maçın Adamı">
                MOM
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-gray-300">
            {roster.map((p) => {
              const row = stats[p.id] || {};
              const isPlayed = row.played !== false;

              return (
                <tr
                  key={p.id}
                  className={`transition-colors ${
                    isPlayed ? 'hover:bg-white/5' : 'opacity-40 bg-black/20'
                  }`}
                >
                  {/* Played Checkbox */}
                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="checkbox"
                      checked={isPlayed}
                      onChange={(e) => handleChange(p.id, 'played', e.target.checked)}
                      title={isPlayed ? 'İlk 11 oynadı' : 'Yedek / Oynamadı'}
                      className="w-4 h-4 accent-[#00e5ff] rounded cursor-pointer"
                    />
                  </td>

                  {/* Player Name */}
                  <td className="py-2.5 pr-4 font-bold text-white truncate max-w-[160px]">
                    <div>@{p.username}</div>
                    {p.full_name && (
                      <div className="text-[10px] font-normal text-gray-400 truncate">
                        {p.full_name}
                      </div>
                    )}
                  </td>

                  {/* Position */}
                  <td className="py-2.5 px-1">
                    <select
                      disabled={!isPlayed}
                      value={row.position || p.primary_position || 'MID'}
                      onChange={(e) => handleChange(p.id, 'position', e.target.value)}
                      className="bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-[#00e5ff] font-black text-[10px] focus:border-[#00e5ff] disabled:opacity-30"
                    >
                      <option value="GK">GK</option>
                      <option value="DEF">DEF</option>
                      <option value="MID">MID</option>
                      <option value="FWD">FWD</option>
                    </select>
                  </td>

                  {/* Goals */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      disabled={!isPlayed}
                      value={row.goals ?? 0}
                      onChange={(e) => handleChange(p.id, 'goals', Number(e.target.value))}
                      className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Assists */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      disabled={!isPlayed}
                      value={row.assists ?? 0}
                      onChange={(e) => handleChange(p.id, 'assists', Number(e.target.value))}
                      className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Rating */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      placeholder="-"
                      disabled={!isPlayed}
                      value={row.rating ?? ''}
                      onChange={(e) =>
                        handleChange(p.id, 'rating', e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className="w-12 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30 font-mono"
                    />
                  </td>

                  {/* Shots */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      disabled={!isPlayed}
                      value={row.shots ?? 0}
                      onChange={(e) => handleChange(p.id, 'shots', Number(e.target.value))}
                      className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Passes Made */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      disabled={!isPlayed}
                      value={row.passes_made ?? 0}
                      onChange={(e) => handleChange(p.id, 'passes_made', Number(e.target.value))}
                      className="w-11 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Pass Attempts */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      disabled={!isPlayed}
                      value={row.pass_attempts ?? 0}
                      onChange={(e) => handleChange(p.id, 'pass_attempts', Number(e.target.value))}
                      className="w-11 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Tackles Made */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      disabled={!isPlayed}
                      value={row.tackles_made ?? 0}
                      onChange={(e) => handleChange(p.id, 'tackles_made', Number(e.target.value))}
                      className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Tackle Attempts */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      disabled={!isPlayed}
                      value={row.tackle_attempts ?? 0}
                      onChange={(e) => handleChange(p.id, 'tackle_attempts', Number(e.target.value))}
                      className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Saves */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      disabled={!isPlayed}
                      value={row.saves ?? 0}
                      onChange={(e) => handleChange(p.id, 'saves', Number(e.target.value))}
                      className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Goals Conceded */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      disabled={!isPlayed}
                      value={row.goals_conceded ?? 0}
                      onChange={(e) => handleChange(p.id, 'goals_conceded', Number(e.target.value))}
                      className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Clean Sheet GK */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      max="1"
                      disabled={!isPlayed}
                      value={row.cleansheets_gk ?? 0}
                      onChange={(e) => handleChange(p.id, 'cleansheets_gk', Number(e.target.value))}
                      className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Clean Sheet DEF */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      max="1"
                      disabled={!isPlayed}
                      value={row.cleansheets_def ?? 0}
                      onChange={(e) => handleChange(p.id, 'cleansheets_def', Number(e.target.value))}
                      className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* Red Cards */}
                  <td className="py-2.5 px-1">
                    <input
                      type="number"
                      min="0"
                      max="1"
                      disabled={!isPlayed}
                      value={row.red_cards ?? 0}
                      onChange={(e) => handleChange(p.id, 'red_cards', Number(e.target.value))}
                      className="w-10 bg-[#060d18] border border-white/10 rounded px-1 py-1 text-center text-white focus:border-[#00e5ff] disabled:opacity-30"
                    />
                  </td>

                  {/* MOM Checkbox */}
                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="checkbox"
                      disabled={!isPlayed}
                      checked={Boolean(row.is_mom)}
                      onChange={(e) => handleChange(p.id, 'is_mom', e.target.checked)}
                      title="Maçın Adamı"
                      className="w-4 h-4 accent-[#00e5ff] rounded cursor-pointer disabled:opacity-30"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state?.error && (
        <div className="flex items-center gap-2 text-red-500 text-xs font-bold p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {state?.success && (
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{state.success}</span>
        </div>
      )}

      <div className="pt-2 flex justify-end">
        <button
          disabled={isPending}
          type="submit"
          className="px-8 py-3.5 bg-[#00e5ff] text-black text-xs font-black rounded-lg tracking-widest hover:bg-[#00b8d4] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(0,229,255,0.3)] cursor-pointer disabled:cursor-not-allowed"
        >
          {isPending ? 'KAYDEDİLİYOR...' : 'İSTATİSTİKLERİ KAYDET'}
        </button>
      </div>
    </form>
  );
}
