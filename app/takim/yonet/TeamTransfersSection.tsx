/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelInviteAction } from './actions';

export interface TransferProfile {
  id?: string;
  username?: string;
  avatar_url?: string | null;
  current_ea_player_id?: string | null;
  primary_position?: string | null;
}

export interface TransferTeam {
  id?: string;
  name?: string;
  logo_url?: string | null;
}

export interface TransferRecord {
  id: string;
  status: string;
  created_at: string;
  requested_by: string;
  player_id: string;
  profiles?: TransferProfile | TransferProfile[] | null;
  from_team?: TransferTeam | TransferTeam[] | null;
}

interface TeamTransfersSectionProps {
  transfers: TransferRecord[];
  isWindowOpen?: boolean;
}

export function TeamTransfersSection({ transfers, isWindowOpen = true }: TeamTransfersSectionProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'pending' | 'history' | 'all'>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getProfile = (tx: TransferRecord): TransferProfile | null => {
    if (!tx.profiles) return null;
    return Array.isArray(tx.profiles) ? tx.profiles[0] : tx.profiles;
  };

  const getFromTeam = (tx: TransferRecord): TransferTeam | null => {
    if (!tx.from_team) return null;
    return Array.isArray(tx.from_team) ? tx.from_team[0] : tx.from_team;
  };

  const pendingOffers = transfers.filter((t) => t.status === 'PENDING_PLAYER');
  const historyTransfers = transfers.filter((t) => t.status !== 'PENDING_PLAYER');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_PLAYER':
        return (
          <span className="px-2.5 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded text-[10px] font-black tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            OYUNCU ONAYI BEKLİYOR
          </span>
        );
      case 'PENDING_ADMIN':
        return (
          <span className="px-2.5 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded text-[10px] font-black tracking-wider">
            YÖNETİCİ ONAYI BEKLİYOR
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/30 rounded text-[10px] font-black tracking-wider">
            TAMAMLANDI
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded text-[10px] font-black tracking-wider">
            REDDEDİLDİ
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-1 bg-gray-500/10 text-gray-400 border border-gray-500/30 rounded text-[10px] font-black tracking-wider">
            İPTAL EDİLDİ
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-gray-500/10 text-gray-400 border border-gray-500/30 rounded text-[10px] font-black tracking-wider">
            {status}
          </span>
        );
    }
  };

  const handleCancelInvite = (transferId: string, playerName?: string) => {
    const confirmText = playerName
      ? `"${playerName}" adlı oyuncuya gönderilen transfer teklifini geri çekmek istediğinizden emin misiniz?\n\nBu işlem teklifi iptal edecek ve takımınızın transfer slotunu anında iade edecektir.`
      : 'Bu transfer teklifini geri çekmek istediğinizden emin misiniz? Transfer slotunuz iade edilecektir.';

    if (!confirm(confirmText)) return;

    setCancellingId(transferId);
    setSuccessMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append('transferId', transferId);
        const res = await cancelInviteAction(formData);

        if (res?.error) {
          setErrorMessage(res.error);
        } else {
          setSuccessMessage('Transfer teklifi başarıyla geri çekildi. 1 transfer slotu iade edildi.');
          router.refresh();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Beklenmedik bir hata oluştu.';
        setErrorMessage(msg);
      } finally {
        setCancellingId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider transition-all ${
              activeTab === 'all'
                ? 'bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/40 shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                : 'text-gray-400 hover:text-white bg-white/5 border border-white/5'
            }`}
          >
            TÜMÜ
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 shadow-[0_0_12px_rgba(234,179,8,0.2)]'
                : 'text-gray-400 hover:text-white bg-white/5 border border-white/5'
            }`}
          >
            <span>TEKLİF GÖNDERİLENLER</span>
            {pendingOffers.length > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-500/30 text-yellow-300 rounded text-[10px] font-bold">
                {pendingOffers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-white/20 text-white border border-white/40 shadow-[0_0_12px_rgba(255,255,255,0.1)]'
                : 'text-gray-400 hover:text-white bg-white/5 border border-white/5'
            }`}
          >
            <span>GEÇMİŞ</span>
            <span className="px-1.5 py-0.5 bg-white/10 text-gray-300 rounded text-[10px] font-bold">
              {historyTransfers.length}
            </span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="p-3.5 bg-green-500/10 border border-green-500/30 rounded-xl text-xs font-bold text-green-400 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-base">✓</span>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-green-400 hover:text-white text-xs px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs font-bold text-red-400 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠</span>
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-white text-xs px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* SECTION 1: TRANSFER GEÇMİŞİ */}
      {(activeTab === 'history' || activeTab === 'all') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-lg font-black text-white tracking-widest uppercase">TRANSFER GEÇMİŞİ</h3>
            <span className="text-xs font-bold text-gray-500 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/5">
              {historyTransfers.length} Kayıt
            </span>
          </div>

          <div className="card-surface rounded-xl border border-white/5 overflow-hidden">
            {historyTransfers.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500 italic font-medium">
                Henüz tamamlanan veya sonuçlanan transfer kaydı bulunmuyor.
              </div>
            ) : (
              <div className="divide-y divide-white/5 max-h-[380px] overflow-y-auto custom-scrollbar">
                {historyTransfers.map((tx) => {
                  const profile = getProfile(tx);
                  const fromTeam = getFromTeam(tx);
                  return (
                    <div key={tx.id} className="p-4 bg-[#060d18] hover:bg-[#0a1628] transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {profile?.avatar_url ? (
                                                        <img
                              src={profile.avatar_url}
                              alt=""
                              className="w-9 h-9 rounded-full object-cover border border-white/10"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-[#0a1628] border border-white/10 flex items-center justify-center text-xs font-bold text-gray-400">
                              {(profile?.username || 'OY').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-white text-sm">
                              {profile?.username || 'Bilinmeyen Oyuncu'}
                            </div>
                            <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
                              {profile?.current_ea_player_id && (
                                <span className="text-[#00e5ff] font-mono text-[10px]">
                                  {profile.current_ea_player_id}
                                </span>
                              )}
                              {fromTeam?.name && (
                                <span className="text-gray-500 text-[10px]">
                                  • {fromTeam.name} takımından
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end gap-1">
                          {getStatusBadge(tx.status)}
                          <span className="text-[10px] text-gray-500 font-medium">
                            {new Date(tx.created_at).toLocaleDateString('tr-TR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: TRANSFER GEÇMİŞİNİN ALTINDA YENİ SEKME: TEKLİF GÖNDERİLEN OYUNCULAR */}
      {(activeTab === 'pending' || activeTab === 'all') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-white tracking-widest uppercase">
                TEKLİF GÖNDERİLEN OYUNCULAR
              </h3>
              {pendingOffers.length > 0 && (
                <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full text-xs font-black animate-pulse">
                  {pendingOffers.length} Bekleyen
                </span>
              )}
            </div>
          </div>

          <div className="card-surface rounded-xl border border-white/5 overflow-hidden">
            {pendingOffers.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="text-2xl text-gray-600">✉</div>
                <div className="text-sm text-gray-400 font-bold">Bekleyen Transfer Teklifi Yok</div>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  Takımınızın şu anda oyuncu onayı bekleyen aktif bir daveti bulunmuyor. Yeni bir oyuncu davet ettiğinizde burada listelenecektir.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {pendingOffers.map((tx) => {
                  const profile = getProfile(tx);
                  const isProcessing = (cancellingId === tx.id) || isPending;

                  return (
                    <div
                      key={tx.id}
                      className="p-4 bg-[#060d18] hover:bg-[#0a1628] transition-colors flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {profile?.avatar_url ? (
                            <img
                              src={profile.avatar_url}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover border border-yellow-500/30"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-xs font-black text-yellow-400">
                              {(profile?.username || 'OY').slice(0, 2).toUpperCase()}
                            </div>
                          )}

                          <div>
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              <span>{profile?.username || 'Bilinmeyen Oyuncu'}</span>
                              {profile?.primary_position && (
                                <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 text-gray-300 rounded text-[9px] font-bold">
                                  {profile.primary_position}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 flex items-center gap-2">
                              <span className="text-[#00e5ff] font-mono text-[10px]">
                                {profile?.current_ea_player_id || 'EA ID Belirtilmedi'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          {getStatusBadge(tx.status)}
                        </div>
                      </div>

                      {/* Card Footer: Date & Cancel Action Button */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                        <span className="text-[10px] text-gray-500 font-medium">
                          Teklif Tarihi: {new Date(tx.created_at).toLocaleDateString('tr-TR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleCancelInvite(tx.id, profile?.username)}
                          className="px-3.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg text-xs font-black tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
                        >
                          {isProcessing ? (
                            <>
                              <svg
                                className="animate-spin h-3.5 w-3.5 text-red-400"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              <span>Geri Çekiliyor...</span>
                            </>
                          ) : (
                            <>
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                              <span>Teklifi Geri Çek</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-2">
            <p className="text-[11px] text-gray-500 italic">
              ℹ Teklif geri çekildiğinde oyuncuya iletilen davet iptal edilir ve takımınızın transfer kotası anında serbest kalır (+1). {!isWindowOpen && "(Transfer dönemi kapalı olsa bile bekleyen tekliflerinizi geri çekebilirsiniz.)"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
