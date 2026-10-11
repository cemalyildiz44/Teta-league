'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { submitMatchAction } from '../actions';

interface SubmitMatchFormProps {
  fixture: {
    id: string;
    scheduled_at?: string | null;
  };
  homeTeam: {
    name: string;
  } | null;
  awayTeam: {
    name: string;
  } | null;
  teamId: string;
}

export function SubmitMatchForm({ fixture, homeTeam, awayTeam }: SubmitMatchFormProps) {
  const [state, formAction, isPending] = useActionState(submitMatchAction as any, { error: '', success: '', matchId: '' } as any);
  const [isConfirmed, setIsConfirmed] = useState(false);

  return (
    <div className="card-surface p-6 sm:p-8 rounded-xl border border-white/5 shadow-2xl">
      {state?.success ? (
        <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-5 text-center">
          <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-1">
              Skor Başarıyla Kaydedildi
            </h3>
            <p className="text-sm text-emerald-400/90 font-medium">
              {state.success}
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/takim/yonet/maclar"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#00e5ff] text-black text-xs font-black rounded-lg tracking-widest hover:bg-[#00b8d4] transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>MAÇ LİSTESİNE DÖN</span>
            </Link>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-6">
          <input type="hidden" name="fixture_id" value={fixture.id} />

          {/* Scoreboard Input */}
          <div className="bg-[#0a1628] p-6 rounded-xl border border-white/5">
            <div className="text-center text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">
              Karşılaşma Skoru
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              {/* Home Team */}
              <div className="flex flex-col items-center flex-1 text-center w-full">
                <span className="text-[10px] font-bold text-[#00e5ff] uppercase tracking-wider mb-1">
                  Ev Sahibi
                </span>
                <span className="font-bold text-white text-base sm:text-lg mb-3">
                  {homeTeam?.name || 'Ev Sahibi Takım'}
                </span>
                <input
                  type="number"
                  name="home_score"
                  min="0"
                  max="50"
                  step="1"
                  required
                  placeholder="0"
                  disabled={isPending}
                  className="w-20 h-20 text-center text-3xl font-black bg-[#060d18] border-2 border-white/10 rounded-2xl text-white focus:outline-none focus:border-[#00e5ff] focus:shadow-[0_0_20px_rgba(0,229,255,0.25)] transition-all disabled:opacity-50"
                />
              </div>

              {/* Separator */}
              <div className="text-2xl font-black text-gray-600 px-2 select-none">
                -
              </div>

              {/* Away Team */}
              <div className="flex flex-col items-center flex-1 text-center w-full">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Deplasman
                </span>
                <span className="font-bold text-white text-base sm:text-lg mb-3">
                  {awayTeam?.name || 'Deplasman Takım'}
                </span>
                <input
                  type="number"
                  name="away_score"
                  min="0"
                  max="50"
                  step="1"
                  required
                  placeholder="0"
                  disabled={isPending}
                  className="w-20 h-20 text-center text-3xl font-black bg-[#060d18] border-2 border-white/10 rounded-2xl text-white focus:outline-none focus:border-[#00e5ff] focus:shadow-[0_0_20px_rgba(0,229,255,0.25)] transition-all disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Disciplinary Warning Banner */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs font-black text-amber-300 uppercase tracking-wider">
                DİSİPLİN VE DOĞRULUK UYARISI
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
                Hatalı veya gerçeğe aykırı skor bildirimi disiplin yaptırımlarına neden olabilir.
                Bildirdiğiniz skor diğer takım ve lig yönetimi tarafından görüntülenebilmektedir.
              </p>
            </div>
          </div>

          {/* Mandatory Confirmation Checkbox */}
          <div className="p-4 bg-[#0a1628]/60 border border-white/10 rounded-xl hover:border-white/20 transition-colors">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                name="confirmed"
                value="true"
                required
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
                disabled={isPending}
                className="w-4 h-4 mt-0.5 rounded border border-white/20 bg-[#060d18] text-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] focus:ring-offset-0 cursor-pointer disabled:opacity-50"
              />
              <span className="text-xs text-gray-300 font-medium leading-relaxed">
                Girdiğim skorun doğru olduğunu ve hatalı bildirim durumunda uygulanabilecek yaptırımları kabul ediyorum.
              </span>
            </label>
          </div>

          {/* Error Message */}
          {state?.error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-bold leading-normal">
              {state.error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
            <Link
              href="/takim/yonet/maclar"
              className="w-full sm:w-auto px-5 py-3 text-center bg-white/5 border border-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/10 transition-colors"
            >
              Vazgeç
            </Link>
            <button
              type="submit"
              disabled={isPending || !isConfirmed}
              className="w-full sm:w-auto px-8 py-3.5 bg-[#00e5ff] text-black text-xs font-black rounded-lg tracking-widest hover:bg-[#00b8d4] transition-all disabled:opacity-40 disabled:hover:bg-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.3)] cursor-pointer disabled:cursor-not-allowed"
            >
              {isPending ? 'KAYDEDİLİYOR...' : 'SONUCU KAYDET'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
