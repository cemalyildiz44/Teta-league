'use client';

import { useState, useActionState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { submitMatchAction } from '../actions';
import { MatchScreenshotUpload } from './MatchScreenshotUpload';

interface SubmitMatchFormProps {
  fixture: any;
  homeTeam: any;
  awayTeam: any;
}

export function SubmitMatchForm({ fixture, homeTeam, awayTeam }: SubmitMatchFormProps) {
  const [state, formAction, isPending] = useActionState(submitMatchAction as any, { error: '', success: '', matchId: '' } as any);
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);

  return (
    <form action={formAction} className="card-surface p-6 rounded-xl border border-white/5 space-y-6">
      <input type="hidden" name="fixture_id" value={fixture.id} />
      <input type="hidden" name="screenshot_url" value={screenshotUrl} />
      
      {/* Scoreboard Input */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-8 bg-[#0a1628] p-6 rounded-xl border border-white/5">
        <div className="flex flex-col items-center flex-1 text-center">
          <div className="text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">Ev Sahibi</div>
          <div className="font-bold text-white text-lg">{homeTeam?.name}</div>
        </div>
        
        <div className="flex items-center gap-4">
          <input
            type="number"
            name="home_score"
            min="0"
            required
            placeholder="0"
            className="w-16 h-16 text-center text-2xl font-black bg-[#060d18] border border-[#00e5ff]/50 rounded-xl text-white focus:outline-none focus:border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)]"
          />
          <span className="text-xl font-black text-gray-600">-</span>
          <input
            type="number"
            name="away_score"
            min="0"
            required
            placeholder="0"
            className="w-16 h-16 text-center text-2xl font-black bg-[#060d18] border border-[#00e5ff]/50 rounded-xl text-white focus:outline-none focus:border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)]"
          />
        </div>

        <div className="flex flex-col items-center flex-1 text-center">
          <div className="text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">Deplasman</div>
          <div className="font-bold text-white text-lg">{awayTeam?.name}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
            Maç Tarihi / Saati
          </label>
          <input
            type="datetime-local"
            name="played_at"
            defaultValue={fixture.scheduled_at ? fixture.scheduled_at.slice(0, 16) : ''}
            required
            className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-3 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none"
          />
        </div>

        {/* Screenshot Upload Component */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Kanıt Ekran Görüntüsü
          </label>
          <MatchScreenshotUpload
            value={screenshotUrl}
            onChange={(url) => setScreenshotUrl(url)}
            onUploadingChange={(uploading) => setIsUploadingScreenshot(uploading)}
            disabled={isPending}
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
            Notlar / Açıklama (Opsiyonel)
          </label>
          <textarea
            name="notes"
            rows={3}
            className="w-full bg-[#060d18] border border-white/10 rounded px-3 py-3 text-white text-sm focus:border-[#00e5ff]/50 focus:outline-none resize-none"
            placeholder="Maçla ilgili belirtmek istediğiniz bir not veya itiraz konusu varsa yazın..."
          />
        </div>
      </div>

      {state?.error && (
        <div className="text-red-500 text-xs font-bold p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          {state.error}
        </div>
      )}

      {state?.success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{state.success}</span>
          </div>
          {state.matchId && (
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href={`/takim/yonet/maclar/${state.matchId}`}
                className="px-5 py-2.5 bg-[#00e5ff] text-black text-xs font-black rounded-lg tracking-widest hover:bg-[#00b8d4] transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] inline-flex items-center gap-2"
              >
                <span>OYUNCU İSTATİSTİKLERİNİ GİR</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/takim/yonet/maclar"
                className="px-4 py-2 bg-white/5 border border-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/10 transition-colors"
              >
                Maç Listesine Dön
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="pt-4 flex justify-end">
        <button
          disabled={isPending || isUploadingScreenshot}
          type="submit"
          className="px-8 py-3.5 bg-[#00e5ff] text-black text-xs font-black rounded-lg tracking-widest hover:bg-[#00b8d4] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(0,229,255,0.3)] cursor-pointer disabled:cursor-not-allowed"
        >
          {isPending
            ? 'GÖNDERİLİYOR...'
            : isUploadingScreenshot
            ? 'GÖRSEL YÜKLENİYOR...'
            : 'SONUCU GÖNDER'}
        </button>
      </div>
    </form>
  );
}
