'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Camera,
  ExternalLink,
  Users,
  Clock,
  FileText,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';
import { approveTeamMatchReportAction, rejectTeamMatchReportAction } from './actions';
import { detectReportScoreMismatch, type ReportStatus } from '@/lib/match-reporting';

export interface ReportPlayerRow {
  id: string;
  player_id: string;
  team_id: string;
  position: string;
  goals?: number;
  assists?: number;
  rating?: number | null;
  shots?: number;
  passes_made?: number;
  pass_attempts?: number;
  tackles_made?: number;
  tackle_attempts?: number;
  saves?: number;
  goals_conceded?: number;
  cleansheets_gk?: number;
  cleansheets_def?: number;
  red_cards?: number;
  is_mom?: boolean;
  profiles?:
    | { id?: string; username?: string | null; full_name?: string | null }
    | Array<{ id?: string; username?: string | null; full_name?: string | null }>
    | null;
}

export interface TeamMatchReportRecord {
  id: string;
  fixture_id: string;
  match_id?: string | null;
  team_id: string;
  home_score: number;
  away_score: number;
  played_at: string;
  screenshot_url?: string | null;
  notes?: string | null;
  status: ReportStatus;
  rejection_reason?: string | null;
  is_stats_applied?: boolean;
  created_at: string;
  submitter?:
    | { id?: string; username?: string | null; full_name?: string | null }
    | Array<{ id?: string; username?: string | null; full_name?: string | null }>
    | null;
  report_players?: ReportPlayerRow[] | null;
}

export interface TeamInfo {
  id?: string;
  name?: string | null;
  logo_url?: string | null;
}

export interface MatchWithDualReports {
  id: string;
  fixture_id?: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  status: ReportStatus;
  source?: string | null;
  fixtures?: { id?: string; week_number?: number | null } | null;
  home?: TeamInfo | null;
  away?: TeamInfo | null;
  home_report?: TeamMatchReportRecord | null;
  away_report?: TeamMatchReportRecord | null;
}

interface DualTeamReportsSectionProps {
  match: MatchWithDualReports;
  onUpdated: () => void;
  showFeedback: (msg: string, type: 'success' | 'error') => void;
}

export function DualTeamReportsSection({
  match,
  onUpdated,
  showFeedback,
}: DualTeamReportsSectionProps) {
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const [rejectingReportId, setRejectingReportId] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [mismatchConfirmReportId, setMismatchConfirmReportId] = useState<string | null>(null);

  const homeReport = match.home_report || null;
  const awayReport = match.away_report || null;

  const hasAnyReport = Boolean(homeReport || awayReport);
  const isManualOrDraw =
    match.source === 'MANUAL' ||
    (typeof match.home_score === 'number' &&
      typeof match.away_score === 'number' &&
      match.home_score === match.away_score);

  if (!hasAnyReport && !isManualOrDraw) {
    return null;
  }

  // Detect score mismatch between the two reports or against the approved match score
  const bothReportsExist = Boolean(homeReport && awayReport);
  const scoresBetweenReportsMismatch =
    bothReportsExist &&
    homeReport !== null &&
    awayReport !== null &&
    (homeReport.home_score !== awayReport.home_score ||
      homeReport.away_score !== awayReport.away_score);

  const handleApproveReport = async (
    report: TeamMatchReportRecord,
    forceAllowMismatch = false
  ) => {
    const otherReport = report.team_id === match.home_team_id ? awayReport : homeReport;
    const mismatchCheck = detectReportScoreMismatch({
      targetReport: {
        home_score: report.home_score,
        away_score: report.away_score,
        team_id: report.team_id,
      },
      otherReport: otherReport || null,
      currentMatch: {
        home_score: match.home_score,
        away_score: match.away_score,
        status: match.status,
      },
    });

    if (mismatchCheck.hasMismatch && !forceAllowMismatch) {
      setMismatchConfirmReportId(report.id);
      return;
    }

    setLoadingReportId(report.id);
    const res = await approveTeamMatchReportAction(report.id, {
      allowScoreMismatch: forceAllowMismatch,
    });
    setLoadingReportId(null);

    if (res.error) {
      if ('requiresMismatchConfirmation' in res && res.requiresMismatchConfirmation) {
        setMismatchConfirmReportId(report.id);
      }
      showFeedback(res.error, 'error');
      return;
    }

    setMismatchConfirmReportId(null);
    showFeedback(res.success || 'Takım raporu onaylandı.', 'success');
    onUpdated();
  };

  const handleRejectReport = async (reportId: string) => {
    setLoadingReportId(reportId);
    const reason = rejectionReasons[reportId] || '';
    const res = await rejectTeamMatchReportAction(reportId, reason);
    setLoadingReportId(null);

    if (res.error) {
      showFeedback(res.error, 'error');
      return;
    }

    setRejectingReportId(null);
    showFeedback(res.success || 'Takım raporu reddedildi.', 'success');
    onUpdated();
  };

  const renderSingleReportCard = (
    report: TeamMatchReportRecord | null,
    team: TeamInfo | null | undefined,
    isHome: boolean
  ) => {
    const teamName = team?.name || (isHome ? 'Ev Sahibi' : 'Deplasman');
    const roleLabel = isHome ? 'EV SAHİBİ TAKIM RAPORU' : 'DEPLASMAN TAKIM RAPORU';
    const otherReport = isHome ? awayReport : homeReport;

    if (!report) {
      return (
        <div className="bg-[#060d18] rounded-xl border border-dashed border-white/10 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
            <div className="flex items-center gap-2.5">
              <TeamLogo src={team?.logo_url} name={teamName} size="sm" className="w-6 h-6" />
              <div>
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  {roleLabel}
                </div>
                <div className="text-sm font-black text-white">{teamName}</div>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
              RAPOR BEKLENİYOR
            </span>
          </div>
          <div className="py-8 text-center text-xs text-zinc-500 italic">
            {teamName} kaptanı bu maç için henüz rapor göndermedi.
            {otherReport?.status === 'APPROVED' && (
              <div className="mt-2 text-amber-400 font-bold not-italic">
                Diğer takımın raporu onaylandı; bu takımın oyuncu istatistikleri için rapor beklenmeye devam ediyor.
              </div>
            )}
          </div>
        </div>
      );
    }

    const players: ReportPlayerRow[] = Array.isArray(report.report_players)
      ? report.report_players
      : [];
    const submitter = Array.isArray(report.submitter) ? report.submitter[0] : report.submitter;
    const isBusy = loadingReportId === report.id;

    const mismatchInfo = detectReportScoreMismatch({
      targetReport: {
        home_score: report.home_score,
        away_score: report.away_score,
        team_id: report.team_id,
      },
      otherReport: otherReport || null,
      currentMatch: {
        home_score: match.home_score,
        away_score: match.away_score,
        status: match.status,
      },
    });

    return (
      <div className="bg-[#060d18] rounded-xl border border-white/10 overflow-hidden flex flex-col shadow-lg">
        {/* Card Header */}
        <div className="p-4 bg-[#0a1628] border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <TeamLogo src={team?.logo_url} name={teamName} size="sm" className="w-7 h-7" />
            <div>
              <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                {roleLabel}
              </div>
              <div className="text-sm font-black text-white">{teamName}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {report.is_stats_applied && (
              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                İstatistikler İşlendi
              </span>
            )}
            <span
              className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider border ${
                report.status === 'APPROVED'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : report.status === 'REJECTED'
                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              }`}
            >
              {report.status === 'APPROVED'
                ? 'ONAYLANDI'
                : report.status === 'REJECTED'
                ? 'REDDEDİLDİ'
                : 'ONAY BEKLİYOR'}
            </span>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-4 space-y-4 flex-1">
          {/* Metadata Grid: Match/Week, Captain, Reported Score, Timestamp */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#0a1628]/70 p-3 rounded-lg border border-white/5 text-xs">
            <div>
              <span className="text-[9px] font-black text-zinc-500 uppercase block">
                Maç / Hafta
              </span>
              <span className="font-bold text-white">
                Hafta {match.fixtures?.week_number || '-'}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-black text-zinc-500 uppercase block">
                Raporlayan Kaptan
              </span>
              <span className="font-bold text-cyan-400 truncate block">
                @{submitter?.username || 'Kaptan'}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-black text-zinc-500 uppercase block">
                Bildirilen Skor
              </span>
              <span
                className={`font-mono font-black text-sm ${
                  mismatchInfo.hasMismatch ? 'text-amber-400' : 'text-white'
                }`}
              >
                {report.home_score} - {report.away_score}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-black text-zinc-500 uppercase block">
                Gönderim Tarihi
              </span>
              <span className="text-[11px] font-medium text-zinc-300 flex items-center gap-1">
                <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
                {new Date(report.created_at).toLocaleString('tr-TR')}
              </span>
            </div>
          </div>

          {/* Notes */}
          {report.notes && (
            <div className="bg-[#0a1628]/60 border border-white/5 rounded-lg p-3 text-xs text-zinc-300">
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3 text-cyan-400" /> Kaptan Açıklaması:
              </div>
              <p>{report.notes}</p>
            </div>
          )}

          {/* Rejection Reason if rejected */}
          {report.status === 'REJECTED' && report.rejection_reason && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
              <span className="font-black uppercase text-[10px] block mb-0.5">Red Gerekçesi:</span>
              {report.rejection_reason}
            </div>
          )}

          {/* Proof Screenshot */}
          <div>
            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Camera className="w-3 h-3 text-cyan-400" /> Kanıt Ekran Görüntüsü
              </span>
              {report.screenshot_url && (
                <a
                  href={report.screenshot_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline inline-flex items-center gap-1 text-[10px]"
                >
                  <ExternalLink className="w-3 h-3" /> Tam Boyut Aç
                </a>
              )}
            </div>
            {report.screenshot_url ? (
              <div className="max-h-48 rounded-lg overflow-hidden border border-white/10 bg-black/50 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={report.screenshot_url}
                  alt={`${teamName} Kanıt Görseli`}
                  className="max-h-48 w-auto object-contain"
                />
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-[#0a1628]/40 border border-dashed border-white/10 text-center text-[11px] text-zinc-500">
                Kanıt ekran görüntüsü yüklenmemiş.
              </div>
            )}
          </div>

          {/* Starting 11 Players & Statistics Table */}
          <div>
            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-cyan-400" /> Seçilen İlk 11 ve Oyuncu İstatistikleri
              </span>
              <span className="text-cyan-400 font-mono">{players.length} Oyuncu</span>
            </div>

            {players.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-white/5 bg-[#081220]">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-[#0a1628] text-[9px] uppercase font-black text-zinc-400 border-b border-white/5">
                    <tr>
                      <th className="px-2.5 py-2">Oyuncu</th>
                      <th className="px-1.5 py-2 text-center">Mev</th>
                      <th className="px-1.5 py-2 text-center" title="Gol">
                        G
                      </th>
                      <th className="px-1.5 py-2 text-center" title="Asist">
                        A
                      </th>
                      <th className="px-1.5 py-2 text-center" title="Reyting">
                        Rtg
                      </th>
                      <th className="px-1.5 py-2 text-center" title="Şut">
                        Şut
                      </th>
                      <th className="px-1.5 py-2 text-center" title="İsabetli / Toplam Pas">
                        Pas
                      </th>
                      <th className="px-1.5 py-2 text-center" title="Başarılı / Toplam Çalma">
                        Çalma
                      </th>
                      <th className="px-1.5 py-2 text-center" title="Kurtarış">
                        Kur
                      </th>
                      <th className="px-1.5 py-2 text-center" title="Gol Yememe (GK/DEF)">
                        CS
                      </th>
                      <th className="px-1.5 py-2 text-center" title="Kırmızı Kart">
                        KK
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-zinc-300">
                    {players.map((rp) => {
                      const prof = Array.isArray(rp.profiles) ? rp.profiles[0] : rp.profiles;
                      return (
                        <tr key={rp.id} className="hover:bg-white/5">
                          <td className="px-2.5 py-1.5 font-bold text-white truncate max-w-[140px]">
                            @{prof?.username || 'Oyuncu'}
                            {rp.is_mom && (
                              <span className="ml-1 text-amber-400" title="Maçın Oyuncusu">
                                ★
                              </span>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5 text-center font-mono text-[10px] text-cyan-400">
                            {rp.position}
                          </td>
                          <td className="px-1.5 py-1.5 text-center font-bold text-emerald-400">
                            {rp.goals || 0}
                          </td>
                          <td className="px-1.5 py-1.5 text-center font-bold text-sky-400">
                            {rp.assists || 0}
                          </td>
                          <td className="px-1.5 py-1.5 text-center font-mono font-bold text-amber-400">
                            {rp.rating ?? '-'}
                          </td>
                          <td className="px-1.5 py-1.5 text-center">{rp.shots || 0}</td>
                          <td className="px-1.5 py-1.5 text-center font-mono text-[10px]">
                            {rp.passes_made || 0}/{rp.pass_attempts || 0}
                          </td>
                          <td className="px-1.5 py-1.5 text-center font-mono text-[10px]">
                            {rp.tackles_made || 0}/{rp.tackle_attempts || 0}
                          </td>
                          <td className="px-1.5 py-1.5 text-center">{rp.saves || 0}</td>
                          <td className="px-1.5 py-1.5 text-center">
                            {(rp.cleansheets_gk || 0) + (rp.cleansheets_def || 0)}
                          </td>
                          <td className="px-1.5 py-1.5 text-center text-red-400 font-bold">
                            {rp.red_cards || 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-[#081220] text-center text-xs text-zinc-500">
                Bu raporda kayıtlı ilk 11 oyuncusu bulunmuyor.
              </div>
            )}
          </div>

          {/* Score Mismatch Manual Confirmation Box */}
          {mismatchConfirmReportId === report.id && (
            <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs space-y-2.5">
              <div className="flex items-start gap-2 text-amber-300 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="uppercase tracking-wider text-[11px] font-black">
                    SKOR UYUŞMAZLIĞI — MANUEL KARAR GEREKİYOR
                  </div>
                  <p className="text-[11px] text-zinc-200 font-normal mt-0.5">
                    {mismatchInfo.reason}{' '}
                    {match.status === 'APPROVED'
                      ? `İlk raporda onaylanan resmi maç skoru (${match.home_score} - ${match.away_score}) değiştirilmeyecek, yalnızca ${teamName} takımının oyuncu istatistikleri kaydedilecektir.`
                      : `Onaylarsanız bu raporun skoru (${report.home_score} - ${report.away_score}) resmi maç skoru olarak işlenecektir.`}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMismatchConfirmReportId(null)}
                  className="px-3 py-1.5 rounded bg-white/10 text-white text-[10px] font-bold hover:bg-white/20"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleApproveReport(report, true)}
                  className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-wider"
                >
                  Manuel Kararla Onayla
                </button>
              </div>
            </div>
          )}

          {/* Rejection Reason Input Box */}
          {rejectingReportId === report.id && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 space-y-2">
              <label className="block text-[10px] font-black text-red-300 uppercase tracking-wider">
                Red Gerekçesi (Kaptana Gösterilir)
              </label>
              <input
                type="text"
                value={rejectionReasons[report.id] || ''}
                onChange={(e) =>
                  setRejectionReasons((prev) => ({ ...prev, [report.id]: e.target.value }))
                }
                placeholder="Örn: Kanıt görseli eksik veya istatistikler hatalı..."
                className="w-full bg-[#060d18] border border-red-500/30 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-red-400"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingReportId(null)}
                  className="px-2.5 py-1 rounded bg-white/10 text-zinc-300 text-[10px] font-bold"
                >
                  İptal
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleRejectReport(report.id)}
                  className="px-3 py-1 rounded bg-red-500 hover:bg-red-600 text-white text-[10px] font-black uppercase"
                >
                  Raporu Reddet
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Card Footer: Independent Approve / Reject Buttons */}
        <div className="p-3.5 bg-[#0a1628] border-t border-white/10 flex items-center justify-between gap-2">
          <div className="text-[10px] text-zinc-400 font-medium">
            {report.status === 'APPROVED'
              ? '✓ Bu takımın raporu ve oyuncu istatistikleri onaylandı.'
              : match.status === 'APPROVED'
              ? 'Onaylandığında resmi skor korunur, sadece bu takımın istatistikleri eklenir.'
              : 'Onaylandığında maç skoru ve bu takımın istatistikleri işlenir.'}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {report.status !== 'REJECTED' && rejectingReportId !== report.id && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setRejectingReportId(report.id)}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reddet
              </button>
            )}

            {report.status !== 'APPROVED' && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleApproveReport(report, false)}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
              >
                {isBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {match.status === 'APPROVED' ? 'İstatistikleri Onayla' : 'Raporu Onayla'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
        <h3 className="text-xs font-black text-cyan-400 tracking-widest uppercase flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> ÇİFT TARAFLI KAPTAN MAÇ RAPORLARI (BAĞIMSIZ ONAY SİSTEMİ)
        </h3>
        <span className="text-[10px] text-zinc-400 font-medium">
          Her iki takımın raporu ayrı ayrı incelenir ve onaylanır.
        </span>
      </div>

      {/* Global Score Mismatch Warning Banner */}
      {scoresBetweenReportsMismatch && homeReport && awayReport && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/40 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-black text-red-400 uppercase tracking-wider">
              İKİ KAPTANIN BİLDİRDİĞİ SKORLAR UYUŞMUYOR!
            </div>
            <p className="text-zinc-300">
              Ev sahibi kaptanı <strong>{homeReport.home_score} - {homeReport.away_score}</strong>, deplasman kaptanı ise{' '}
              <strong>{awayReport.home_score} - {awayReport.away_score}</strong> skorunu bildirdi. İkinci rapor otomatik onaylanmaz; lütfen kanıt ekran görüntülerini inceleyerek manuel karar verin.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderSingleReportCard(homeReport, match.home, true)}
        {renderSingleReportCard(awayReport, match.away, false)}
      </div>
    </div>
  );
}
