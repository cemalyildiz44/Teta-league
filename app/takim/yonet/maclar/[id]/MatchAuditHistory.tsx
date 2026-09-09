'use client';

import { History, User, ArrowRight, Image as ImageIcon, FileText, CheckCircle } from 'lucide-react';

export interface MatchAuditRecord {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data: any;
  new_data: any;
  created_at: string;
  actor?: {
    username: string;
    avatar_url: string | null;
  } | null;
}

interface MatchAuditHistoryProps {
  logs: MatchAuditRecord[];
}

export function MatchAuditHistory({ logs }: MatchAuditHistoryProps) {
  if (!logs || logs.length === 0) {
    return (
      <div className="card-surface p-6 rounded-xl border border-white/5 mb-8">
        <h4 className="text-xs font-black text-gray-400 tracking-widest uppercase mb-2 flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" />
          DÜZENLEME GEÇMİŞİ (AUDIT LOGS)
        </h4>
        <p className="text-xs text-gray-500 italic">
          Bu maç için henüz kayıtlı bir düzenleme geçmişi bulunmuyor.
        </p>
      </div>
    );
  }

  return (
    <div className="card-surface rounded-xl border border-white/5 overflow-hidden mb-8">
      <div className="p-4 bg-[#0a1628] border-b border-white/5 flex items-center justify-between">
        <h4 className="text-xs font-black text-white tracking-widest uppercase flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" />
          DÜZENLEME GEÇMİŞİ ({logs.length})
        </h4>
        <span className="text-[10px] text-zinc-500 font-mono">
          Otomatik Sistem Denetim Kayıtları
        </span>
      </div>

      <div className="divide-y divide-white/5 max-h-80 overflow-y-auto custom-scrollbar bg-[#060d18]">
        {logs.map((log) => {
          const isInsert = log.action === 'INSERT';
          const isUpdate = log.action === 'UPDATE';

          const oldScore = log.old_data
            ? `${log.old_data.home_score ?? '-'} - ${log.old_data.away_score ?? '-'}`
            : null;
          const newScore = log.new_data
            ? `${log.new_data.home_score ?? '-'} - ${log.new_data.away_score ?? '-'}`
            : null;

          const isScoreChanged = isUpdate && oldScore && newScore && oldScore !== newScore;
          const isScreenshotChanged = isUpdate && log.old_data?.screenshot_url !== log.new_data?.screenshot_url;
          const isStatusChanged = isUpdate && log.old_data?.status !== log.new_data?.status;

          return (
            <div key={log.id} className="p-4 hover:bg-white/[0.01] transition-colors space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    {log.actor?.avatar_url ? (
                      <img src={log.actor.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white">
                      {log.actor?.username ? `@${log.actor.username}` : 'Sistem / Kaptan'}
                    </span>
                    <span className="text-[10px] text-zinc-500 ml-2">
                      {new Date(log.created_at).toLocaleString('tr-TR')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                    isInsert ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                    isUpdate ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {isInsert ? 'İLK GÖNDERİM' : isUpdate ? 'DÜZENLENDİ' : log.action}
                  </span>
                </div>
              </div>

              {/* Changes Breakdown */}
              <div className="pl-9 space-y-1 text-xs">
                {isScoreChanged && (
                  <div className="flex items-center gap-2 text-zinc-300">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Skor Değişimi:</span>
                    <span className="font-mono line-through text-zinc-500">{oldScore}</span>
                    <ArrowRight className="w-3 h-3 text-amber-400" />
                    <span className="font-mono font-bold text-emerald-400">{newScore}</span>
                  </div>
                )}

                {isInsert && newScore && (
                  <div className="text-zinc-400">
                    Girilen İlk Skor: <strong className="text-white font-mono">{newScore}</strong>
                  </div>
                )}

                {isScreenshotChanged && (
                  <div className="flex items-center gap-1.5 text-cyan-400 text-[11px]">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Kanıt ekran görüntüsü güncellendi.</span>
                  </div>
                )}

                {isStatusChanged && (
                  <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
                    <CheckCircle className="w-3 h-3 text-cyan-400" />
                    <span>Durum: <strong className="text-zinc-300">{log.old_data?.status}</strong> ➔ <strong className="text-white">{log.new_data?.status}</strong></span>
                  </div>
                )}

                {log.new_data?.notes && (
                  <div className="text-[11px] text-zinc-400 flex items-start gap-1.5 mt-1">
                    <FileText className="w-3 h-3 text-zinc-500 shrink-0 mt-0.5" />
                    <span className="italic">&ldquo;{log.new_data.notes}&rdquo;</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
