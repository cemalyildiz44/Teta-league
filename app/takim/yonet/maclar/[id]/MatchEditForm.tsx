'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit3, CheckCircle2, AlertCircle, Loader2, Save, X } from 'lucide-react';
import { MatchScreenshotUpload } from '../yeni/MatchScreenshotUpload';
import { editMatchAction } from '../actions';

interface MatchEditFormProps {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  initialHomeScore: number | null;
  initialAwayScore: number | null;
  initialScreenshotUrl: string | null;
  initialNotes: string | null;
}

export function MatchEditForm({
  matchId,
  homeTeamName,
  awayTeamName,
  initialHomeScore,
  initialAwayScore,
  initialScreenshotUrl,
  initialNotes
}: MatchEditFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [homeScore, setHomeScore] = useState<number | string>(initialHomeScore ?? 0);
  const [awayScore, setAwayScore] = useState<number | string>(initialAwayScore ?? 0);
  const [screenshotUrl, setScreenshotUrl] = useState<string>(initialScreenshotUrl ?? '');
  const [notes, setNotes] = useState<string>(initialNotes ?? '');
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) return;

    setLoading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append('home_score', String(homeScore));
    formData.append('away_score', String(awayScore));
    formData.append('screenshot_url', screenshotUrl);
    formData.append('notes', notes);

    const res = await editMatchAction(matchId, formData);
    setLoading(false);

    if (res.error) {
      setFeedback({ msg: res.error, type: 'error' });
    } else {
      setFeedback({ msg: res.success || 'Maç başarıyla güncellendi.', type: 'success' });
      router.refresh();
      setTimeout(() => {
        setIsOpen(false);
        setFeedback(null);
      }, 1500);
    }
  };

  return (
    <div className="card-surface rounded-xl border border-white/5 overflow-hidden mb-8">
      {/* Header / Toggle Button */}
      <div className="p-4 bg-[#0a1628] border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Edit3 className="w-4 h-4 text-[#00e5ff]" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            MAÇ SKORU VE KANIT DÜZENLEME
          </h3>
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            ONAY BEKLİYOR
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="text-xs font-bold text-[#00e5ff] hover:text-[#00e5ff]/80 transition-colors uppercase tracking-wider px-2 py-1 rounded bg-[#00e5ff]/10 border border-[#00e5ff]/20"
        >
          {isOpen ? 'Formu Gizle' : 'Düzenle'}
        </button>
      </div>

      {/* Collapsible Edit Form */}
      {isOpen && (
        <form onSubmit={handleSubmit} className="p-6 space-y-6 bg-[#060d18]">
          {feedback && (
            <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${
              feedback.type === 'error'
                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}>
              {feedback.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>{feedback.msg}</span>
            </div>
          )}

          {/* Score Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#0a1628] p-4 rounded-xl border border-white/5">
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                {homeTeamName} (Ev Sahibi Skor)
              </label>
              <input
                type="number"
                min="0"
                required
                value={homeScore}
                onChange={(e) => setHomeScore(Math.max(0, parseInt(e.target.value) || 0))}
                className="input-field text-2xl font-black text-center py-2"
              />
            </div>

            <div className="bg-[#0a1628] p-4 rounded-xl border border-white/5">
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                {awayTeamName} (Deplasman Skor)
              </label>
              <input
                type="number"
                min="0"
                required
                value={awayScore}
                onChange={(e) => setAwayScore(Math.max(0, parseInt(e.target.value) || 0))}
                className="input-field text-2xl font-black text-center py-2"
              />
            </div>
          </div>

          {/* Screenshot Upload Reuse */}
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Kanıt Görseli (Ekran Görüntüsü)
            </label>
            <MatchScreenshotUpload
              value={screenshotUrl}
              onChange={setScreenshotUrl}
              onUploadingChange={setIsUploading}
              disabled={loading}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Düzenleme / Maç Notu
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn: İkinci yarı kural ihlali kanıtı eklendi / skor düzeltildi"
              rows={3}
              className="input-field resize-none text-xs"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={loading || isUploading}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-lg transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || isUploading}
              className="btn-primary px-6 py-2.5 text-xs font-black flex items-center gap-2 uppercase tracking-widest"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  GÜNCELLENİYOR...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  GÜNCELLEMEYİ KAYDET
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
