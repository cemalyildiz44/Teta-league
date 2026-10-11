'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';
import { submitTournamentMatchScoreAction } from '../actions';

interface TournamentScoreReportModalProps {
  match: any;
  tournamentId: string;
  currentUser?: any;
  profiles?: any[];
  homePlayers?: any[];
  awayPlayers?: any[];
  onClose: () => void;
}

export default function TournamentScoreReportModal({
  match,
  tournamentId,
  onClose,
}: TournamentScoreReportModalProps) {
  const router = useRouter();

  const [homeScore, setHomeScore] = useState<string>('0');
  const [awayScore, setAwayScore] = useState<string>('0');
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Submit report
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isConfirmed) {
      setErrorMsg('Skor bildirimini tamamlamak için doğruluk ve disiplin onay kutucuğunu işaretlemelisiniz.');
      return;
    }

    const homeParsed = parseInt(homeScore, 10);
    const awayParsed = parseInt(awayScore, 10);

    if (isNaN(homeParsed) || isNaN(awayParsed)) {
      setErrorMsg('Lütfen geçerli bir ev sahibi ve deplasman skoru giriniz.');
      return;
    }

    if (homeParsed < 0 || awayParsed < 0) {
      setErrorMsg('Skorlar negatif bir sayı olamaz.');
      return;
    }

    if (homeParsed > 50 || awayParsed > 50) {
      setErrorMsg('Girilen skor geçerli bir futbol skoru aralığında olmalıdır (en fazla 50).');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('match_id', match.id);
      formData.append('tournament_id', tournamentId);
      formData.append('home_score', homeParsed.toString());
      formData.append('away_score', awayParsed.toString());
      formData.append('confirmed', 'true');

      const res = await submitTournamentMatchScoreAction(formData);
      setLoading(false);

      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(res.success || 'Maç skoru başarıyla iletildi. Yönetici onayına sunuldu.');
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 1500);
      }
    } catch (err: any) {
      setLoading(false);
      setErrorMsg('Beklenmeyen bir hata oluştu: ' + (err?.message || err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="bg-[#0a1628] w-full max-w-xl rounded-2xl sm:rounded-[2rem] border border-white/10 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#060d18]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-[#00e5ff] shadow-md shadow-cyan-500/10">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[#00e5ff] text-[10px] font-[900] tracking-widest uppercase block">
                RESMİ MAÇ SKOR BİLDİRİMİ
              </span>
              <h3 className="text-sm sm:text-base font-[900] text-white uppercase tracking-wider">
                {match.home?.team_name} vs {match.away?.team_name}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Rejection Warning if applicable */}
        {match.status === 'REJECTED' && match.rejection_reason && (
          <div className="p-4 bg-red-500/15 border-b border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-[900] uppercase text-red-400 mb-0.5">
                Önceki Bildirim Yönetici Tarafından Reddedildi:
              </strong>
              <span>{match.rejection_reason}</span>
            </div>
          </div>
        )}

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="p-3 bg-red-500/90 text-white text-xs font-[900] uppercase tracking-wider text-center">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-500/90 text-black text-xs font-[900] uppercase tracking-wider text-center flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Match Score Input */}
          <div className="p-5 sm:p-6 rounded-2xl bg-black/40 border border-white/5 space-y-4">
            <span className="text-[11px] font-[900] text-zinc-400 uppercase tracking-widest block text-center">
              MAÇ SKORU
            </span>

            <div className="flex items-center justify-center gap-4 sm:gap-6">
              {/* Home Team */}
              <div className="flex flex-col items-center gap-2 flex-1 max-w-[150px]">
                <TeamLogo src={match.home?.logo_url} name={match.home?.team_name} size="md" />
                <span className="text-xs font-[900] text-white uppercase text-center truncate w-full">
                  {match.home?.team_name}
                </span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  required
                  disabled={loading}
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  className="w-20 bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-2xl font-[900] text-center text-white focus:border-[#00e5ff] outline-none disabled:opacity-50"
                />
              </div>

              <span className="text-xl font-[900] text-zinc-500 mb-6">-</span>

              {/* Away Team */}
              <div className="flex flex-col items-center gap-2 flex-1 max-w-[150px]">
                <TeamLogo src={match.away?.logo_url} name={match.away?.team_name} size="md" />
                <span className="text-xs font-[900] text-white uppercase text-center truncate w-full">
                  {match.away?.team_name}
                </span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  required
                  disabled={loading}
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  className="w-20 bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-2xl font-[900] text-center text-white focus:border-[#00e5ff] outline-none disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Disciplinary Warning Banner */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs font-black text-amber-300 uppercase tracking-wider">
                DİSİPLİN VE DOĞRULUK UYARISI
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
                Hatalı veya gerçeğe aykırı skor bildirimi disiplin yaptırımlarına neden olabilir.
                Bildirdiğiniz skor diğer takım ve turnuva yönetimi tarafından görüntülenebilmektedir.
              </p>
            </div>
          </div>

          {/* Mandatory Confirmation Checkbox */}
          <div className="p-4 bg-[#060d18] border border-white/10 rounded-xl hover:border-white/20 transition-colors">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                required
                disabled={loading}
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border border-white/20 bg-black/60 text-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] focus:ring-offset-0 cursor-pointer disabled:opacity-50"
              />
              <span className="text-xs text-gray-300 font-medium leading-relaxed">
                Girdiğim skorun doğru olduğunu ve hatalı bildirim durumunda uygulanabilecek yaptırımları kabul ediyorum.
              </span>
            </label>
          </div>

          {/* Submit Actions */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 font-[900] uppercase text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              disabled={loading || !isConfirmed}
              type="submit"
              className="px-7 py-3 rounded-xl bg-gradient-to-r from-[#00e5ff] to-cyan-400 text-black font-[900] uppercase tracking-widest text-xs hover:brightness-110 hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>KAYDEDİLİYOR...</span>
                </>
              ) : (
                'SONUCU KAYDET'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
