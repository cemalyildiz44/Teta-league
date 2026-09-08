'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Plus, Search, Edit2, Trash2, Calendar, Clock, 
  AlertTriangle, X, Loader2, CheckCircle2, Lock, Unlock
} from 'lucide-react';
import { 
  createTransferWindow, 
  updateTransferWindow, 
  toggleTransferWindow, 
  deleteTransferWindow 
} from './actions';

export type TransferWindow = {
  id: string;
  season_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_open: boolean;
  created_at: string;
  seasons?: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export type Season = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

interface Props {
  initialWindows: TransferWindow[];
  seasons: Season[];
}

function toLocalDatetimeInput(isoStr: string) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTimeTR(dateStr: string) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

function getWindowStatus(w: TransferWindow) {
  const now = new Date();
  const start = new Date(w.start_date);
  const end = new Date(w.end_date);

  if (!w.is_open) {
    return {
      label: 'KAPALI',
      color: 'bg-zinc-800 text-zinc-400 border-zinc-700',
      icon: Lock
    };
  }

  if (now < start) {
    return {
      label: 'BAŞLAMADI',
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      icon: Clock
    };
  }

  if (now > end) {
    return {
      label: 'SÜRESİ DOLMUŞ',
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      icon: AlertTriangle
    };
  }

  return {
    label: 'AKTİF / AÇIK',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    icon: Unlock
  };
}

export function TransferWindowsManager({ initialWindows, seasons }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filterSeason, setFilterSeason] = useState('ALL');
  const [createModal, setCreateModal] = useState(false);
  const [editWindow, setEditWindow] = useState<TransferWindow | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({ isOpen: false, title: '', message: '', action: async () => {} });

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const filteredWindows = initialWindows.filter((w) => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.seasons?.name || '').toLowerCase().includes(search.toLowerCase());
    const matchesSeason = filterSeason === 'ALL' || w.season_id === filterSeason;
    return matchesSearch && matchesSeason;
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await createTransferWindow(formData);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Oluşturuldu', 'success');
      setCreateModal(false);
      router.refresh();
    }
    setLoading(false);
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await updateTransferWindow(formData);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Güncellendi', 'success');
      setEditWindow(null);
      router.refresh();
    }
    setLoading(false);
  };

  const handleToggle = async (w: TransferWindow) => {
    setLoading(true);
    const res = await toggleTransferWindow(w.id, !w.is_open);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Durum güncellendi', 'success');
      router.refresh();
    }
    setLoading(false);
  };

  const handleDeletePrompt = (w: TransferWindow) => {
    setConfirmModal({
      isOpen: true,
      title: 'Transfer Penceresini Sil',
      message: `"${w.name}" penceresini silmek istediğinize emin misiniz? Varsa bağlı transferler kontrol edilecektir.`,
      action: async () => {
        setLoading(true);
        const res = await deleteTransferWindow(w.id);
        if (res.error) {
          showFeedback(res.error, 'error');
        } else {
          showFeedback(res.success || 'Silindi', 'success');
          router.refresh();
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setLoading(false);
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`p-4 rounded-xl text-sm font-bold flex items-center justify-between border ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span>{feedback.msg}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Transfer penceresi ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#03070c] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#00e5ff]"
            />
          </div>

          <select
            value={filterSeason}
            onChange={(e) => setFilterSeason(e.target.value)}
            className="bg-[#03070c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-[#00e5ff]"
          >
            <option value="ALL">Tüm Sezonlar</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setCreateModal(true)}
          className="flex items-center justify-center gap-2 bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-black font-black text-sm px-5 py-2.5 rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.2)]"
        >
          <Plus className="w-4 h-4" />
          <span>YENİ PENCERE</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#03070c] border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="text-[10px] text-gray-500 uppercase font-[900] tracking-widest border-b border-white/5 bg-[#01060b]">
              <tr>
                <th className="py-4 pl-6 pr-3">PENCERE ADI</th>
                <th className="px-3 py-4">SEZON</th>
                <th className="px-3 py-4">BAŞLANGIÇ</th>
                <th className="px-3 py-4">BİTİŞ</th>
                <th className="px-3 py-4 text-center">DURUM</th>
                <th className="pr-6 pl-3 py-4 text-right">İŞLEMLER</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {filteredWindows.length > 0 ? (
                filteredWindows.map((w) => {
                  const status = getWindowStatus(w);
                  const StatusIcon = status.icon;
                  return (
                    <tr key={w.id} className="hover:bg-white/[0.02] transition-colors text-sm">
                      <td className="py-4 pl-6 pr-3 font-bold text-white">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 text-cyan-400 shrink-0">
                            <Calendar className="w-4 h-4" />
                          </div>
                          <span className="font-extrabold">{w.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-gray-300 font-medium">
                        {w.seasons?.name || '-'}
                      </td>
                      <td className="px-3 py-4 text-gray-400 font-mono text-xs">
                        {formatDateTimeTR(w.start_date)}
                      </td>
                      <td className="px-3 py-4 text-gray-400 font-mono text-xs">
                        {formatDateTimeTR(w.end_date)}
                      </td>
                      <td className="px-3 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase border ${status.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                      </td>
                      <td className="pr-6 pl-3 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggle(w)}
                            disabled={loading}
                            title={w.is_open ? 'Pencereyi Kapat' : 'Pencereyi Aç'}
                            className={`p-2 rounded-lg border transition-colors ${
                              w.is_open
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            }`}
                          >
                            {w.is_open ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                          </button>

                          <button
                            onClick={() => setEditWindow(w)}
                            disabled={loading}
                            title="Düzenle"
                            className="p-2 rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeletePrompt(w)}
                            disabled={loading}
                            title="Sil"
                            className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-600 font-bold text-sm">
                    Kayıtlı transfer penceresi bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {createModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-lg font-black text-white tracking-wide">YENİ TRANSFER PENCERESİ</h2>
              <button onClick={() => setCreateModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Sezon</label>
                <select
                  name="season_id"
                  required
                  className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00e5ff]"
                >
                  <option value="">Sezon Seçiniz</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Pencere Adı</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Örn: 1. Transfer & Tescil Dönemi"
                  className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00e5ff]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Başlangıç Tarihi</label>
                  <input
                    type="datetime-local"
                    name="start_date"
                    required
                    className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00e5ff]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Bitiş Tarihi</label>
                  <input
                    type="datetime-local"
                    name="end_date"
                    required
                    className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00e5ff]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="is_open_create"
                  name="is_open"
                  value="true"
                  defaultChecked={true}
                  className="w-4 h-4 rounded bg-[#03070c] border-white/20 text-[#00e5ff] focus:ring-0"
                />
                <label htmlFor="is_open_create" className="text-sm font-bold text-gray-300">
                  Pencereyi doğrudan AÇIK olarak başlat
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm font-bold transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-black font-black text-sm px-6 py-2.5 rounded-xl transition-all"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Oluştur</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editWindow && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-lg font-black text-white tracking-wide">PENCEREYİ DÜZENLE</h2>
              <button onClick={() => setEditWindow(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEdit} className="space-y-4">
              <input type="hidden" name="id" value={editWindow.id} />

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Sezon</label>
                <select
                  name="season_id"
                  required
                  defaultValue={editWindow.season_id}
                  className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00e5ff]"
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Pencere Adı</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editWindow.name}
                  className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00e5ff]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Başlangıç Tarihi</label>
                  <input
                    type="datetime-local"
                    name="start_date"
                    required
                    defaultValue={toLocalDatetimeInput(editWindow.start_date)}
                    className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00e5ff]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Bitiş Tarihi</label>
                  <input
                    type="datetime-local"
                    name="end_date"
                    required
                    defaultValue={toLocalDatetimeInput(editWindow.end_date)}
                    className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00e5ff]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="is_open_edit"
                  name="is_open"
                  value="true"
                  defaultChecked={editWindow.is_open}
                  className="w-4 h-4 rounded bg-[#03070c] border-white/20 text-[#00e5ff] focus:ring-0"
                />
                <label htmlFor="is_open_edit" className="text-sm font-bold text-gray-300">
                  Transfer Penceresi Açık (Aktif)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setEditWindow(null)}
                  className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm font-bold transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-black font-black text-sm px-6 py-2.5 rounded-xl transition-all"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DIALOG */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-black text-white">{confirmModal.title}</h3>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{confirmModal.message}</p>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm font-bold transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={confirmModal.action}
                disabled={loading}
                className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-black text-sm px-6 py-2.5 rounded-xl transition-all"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Evet, Sil</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
