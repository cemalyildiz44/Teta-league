'use client';

import { useState, useTransition } from 'react';
import {
  createTrophyAction,
  updateTrophyAction,
  deleteTrophyAction,
  addTrophyWinnerAction,
  removeTrophyWinnerAction
} from './actions';
import {
  Trophy,
  Plus,
  Search,
  Users,
  Edit3,
  Trash2,
  X,
  Shield,
  Calendar,
  Upload,
  CheckCircle2,
  AlertTriangle,
  User,
  Layers,
  Sparkles
} from 'lucide-react';
import Image from 'next/image';

interface TrophyItem {
  id: string;
  title: string;
  description?: string | null;
  image_url: string;
  category: string;
  target_type: 'PLAYER' | 'TEAM' | 'BOTH';
  season_id?: string | null;
  season_name?: string | null;
  display_order: number;
  season?: { name: string } | null;
  winners?: TrophyWinnerItem[];
}

interface TrophyWinnerItem {
  id: string;
  winner_type: 'PLAYER' | 'TEAM';
  player_id?: string | null;
  team_id?: string | null;
  awarded_at: string;
  notes?: string | null;
  profile?: { id: string; username: string; full_name?: string | null; avatar_url?: string | null } | null;
  team?: { id: string; name: string; logo_url?: string | null } | null;
}

const COMMON_CATEGORIES = [
  'Bireysel Ödüller',
  'Takım Kupaları',
  'Sezon Ödülleri',
  'Haftalık / Aylık Ödüller',
  'Turnuva Şampiyonlukları',
  'Özel Başarılar'
];

export default function AchievementsClient({
  trophies = [],
  profiles = [],
  teams = [],
  seasons = [],
  isSchemaPending = false
}: {
  trophies: TrophyItem[];
  profiles: any[];
  teams: any[];
  seasons: any[];
  isSchemaPending?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [targetTypeFilter, setTargetTypeFilter] = useState('ALL');

  // Modal States
  const [isTrophyModalOpen, setIsTrophyModalOpen] = useState(false);
  const [editingTrophy, setEditingTrophy] = useState<TrophyItem | null>(null);
  const [managingTrophy, setManagingTrophy] = useState<TrophyItem | null>(null);
  const [deletingTrophy, setDeletingTrophy] = useState<TrophyItem | null>(null);

  // Transitions & Feedback
  const [isPending, startTransition] = useTransition();
  const [actionMsg, setActionMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Winner Form State inside Manage Modal
  const [winnerType, setWinnerType] = useState<'PLAYER' | 'TEAM'>('PLAYER');
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [winnerNotes, setWinnerNotes] = useState('');
  const [entitySearch, setEntitySearch] = useState('');

  // Trophy Form Preview
  const [previewImageUrl, setPreviewImageUrl] = useState('');

  // ── Filtreleme ─────────────────────────────────────────────────────────────
  const filteredTrophies = trophies.filter((t) => {
    if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
    if (targetTypeFilter !== 'ALL' && t.target_type !== targetTypeFilter) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    const title = t.title?.toLowerCase() || '';
    const desc = t.description?.toLowerCase() || '';
    const cat = t.category?.toLowerCase() || '';
    const season = (t.season_name || t.season?.name || '').toLowerCase();
    const hasMatchingWinner = t.winners?.some((w) => {
      const uName = w.profile?.username?.toLowerCase() || '';
      const tName = w.team?.name?.toLowerCase() || '';
      return uName.includes(q) || tName.includes(q);
    });

    return title.includes(q) || desc.includes(q) || cat.includes(q) || season.includes(q) || hasMatchingWinner;
  });

  // ── Modal Açma İşleyicileri ───────────────────────────────────────────────
  const openCreateModal = () => {
    setEditingTrophy(null);
    setPreviewImageUrl('');
    setActionMsg(null);
    setIsTrophyModalOpen(true);
  };

  const openEditModal = (trophy: TrophyItem) => {
    setEditingTrophy(trophy);
    setPreviewImageUrl(trophy.image_url);
    setActionMsg(null);
    setIsTrophyModalOpen(true);
  };

  const openManageModal = (trophy: TrophyItem) => {
    setManagingTrophy(trophy);
    setActionMsg(null);
    setEntitySearch('');
    setSelectedEntityId('');
    setWinnerNotes('');
    setWinnerType(trophy.target_type === 'TEAM' ? 'TEAM' : 'PLAYER');
  };

  // ── Kupa Formu Gönderme ───────────────────────────────────────────────────
  const handleTrophyFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionMsg(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      let res;
      if (editingTrophy) {
        res = await updateTrophyAction(editingTrophy.id, null, formData);
      } else {
        res = await createTrophyAction(null, formData);
      }

      if (res?.error) {
        setActionMsg({ type: 'error', text: res.error });
      } else {
        setActionMsg({ type: 'success', text: res.success || 'İşlem başarılı.' });
        setIsTrophyModalOpen(false);
      }
    });
  };

  // ── Kupa Silme ────────────────────────────────────────────────────────────
  const handleDeleteTrophy = () => {
    if (!deletingTrophy) return;
    setActionMsg(null);

    startTransition(async () => {
      const res = await deleteTrophyAction(deletingTrophy.id);
      if (res?.error) {
        setActionMsg({ type: 'error', text: res.error });
      } else {
        setActionMsg({ type: 'success', text: 'Kupa silindi.' });
        setDeletingTrophy(null);
        if (managingTrophy?.id === deletingTrophy.id) setManagingTrophy(null);
      }
    });
  };

  // ── Kazanan Ekleme ────────────────────────────────────────────────────────
  const handleAddWinner = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!managingTrophy || !selectedEntityId) return;
    setActionMsg(null);

    const formData = new FormData();
    formData.append('trophy_id', managingTrophy.id);
    formData.append('winner_type', winnerType);
    if (winnerType === 'PLAYER') {
      formData.append('player_id', selectedEntityId);
    } else {
      formData.append('team_id', selectedEntityId);
    }
    if (winnerNotes) {
      formData.append('notes', winnerNotes);
    }

    startTransition(async () => {
      const res = await addTrophyWinnerAction(null, formData);
      if (res?.error) {
        setActionMsg({ type: 'error', text: res.error });
      } else {
        setActionMsg({ type: 'success', text: res.success || 'Kazanan eklendi.' });
        setSelectedEntityId('');
        setWinnerNotes('');
        setEntitySearch('');
      }
    });
  };

  // ── Kazanan Kaldırma ──────────────────────────────────────────────────────
  const handleRemoveWinner = (winnerId: string) => {
    if (!confirm('Bu kazananı kupadan kaldırmak istediğinize emin misiniz?')) return;
    setActionMsg(null);

    startTransition(async () => {
      const res = await removeTrophyWinnerAction(winnerId);
      if (res?.error) {
        setActionMsg({ type: 'error', text: res.error });
      } else {
        setActionMsg({ type: 'success', text: 'Kazanan kaldırıldı.' });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Şema Bilgilendirmesi (Migration henüz canlıya uygulanmadıysa) */}
      {isSchemaPending && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
          <div>
            <span className="font-bold">Yeni Kupa Veri Modeli Hazırlandı:</span>{' '}
            Canlı veritabanı migration dosyası (<code className="bg-black/50 px-1 py-0.5 rounded">20261014100000_dynamic_trophies_and_winners.sql</code>) oluşturuldu. Canlıya uygulama onayınız sonrasında tablolar aktif olacaktır.
          </div>
        </div>
      )}

      {/* Global Bildirim */}
      {actionMsg && (
        <div className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between border ${
          actionMsg.type === 'error'
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        }`}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Üst Başlık & Eylem Çubuğu */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-500/5 flex items-center justify-center border border-yellow-500/30 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
            <Trophy className="w-6 h-6 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-[900] text-white tracking-tight uppercase flex items-center gap-2">
              Kupa ve Başarı Yönetimi
            </h1>
            <p className="text-gray-400 text-xs font-medium mt-0.5">
              Oyuncu ve takımlar için tamamen dinamik kupa ve ödül tanımlama sistemi
            </p>
          </div>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#00e5ff] hover:bg-[#00b8d4] text-black font-[900] text-xs tracking-wider uppercase rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.25)] hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>YENİ KUPA EKLE</span>
        </button>
      </div>

      {/* Arama ve Filtreler */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative md:col-span-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Kupa, kategori veya kazanan ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
          />
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
          >
            <option value="ALL">Tüm Kategoriler</option>
            {COMMON_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
          >
            <option value="ALL">Tüm Hedef Türleri (Oyuncu / Takım)</option>
            <option value="PLAYER">Yalnızca Oyuncular</option>
            <option value="TEAM">Yalnızca Takımlar</option>
            <option value="BOTH">Hem Oyuncu Hem Takım</option>
          </select>
        </div>
      </div>

      {/* Kupa Kartları Listesi */}
      {filteredTrophies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTrophies.map((trophy) => {
            const winnerCount = trophy.winners?.length || 0;
            const seasonLabel = trophy.season_name || trophy.season?.name || 'Genel / Tüm Sezonlar';

            return (
              <div
                key={trophy.id}
                className="card-surface bg-[#03070c] border border-white/5 hover:border-white/20 rounded-2xl p-5 flex flex-col justify-between transition-all group"
              >
                <div>
                  {/* Kart Üst Bilgileri */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl bg-black/60 border border-white/10 p-2 flex items-center justify-center flex-shrink-0 relative overflow-hidden group-hover:border-[#00e5ff]/30 transition-colors">
                        <img
                          src={trophy.image_url}
                          alt={trophy.title}
                          className="w-full h-full object-contain select-none transition-transform group-hover:scale-110 duration-300"
                          onError={(e) => {
                            // Fallback to emoji if image URL is invalid
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-[900] tracking-widest uppercase text-cyan-400/90 block mb-0.5">
                          {trophy.category}
                        </span>
                        <h3 className="text-base font-black text-white tracking-wide uppercase line-clamp-1">
                          {trophy.title}
                        </h3>
                        <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1.5 mt-0.5">
                          <Calendar className="w-3 h-3 text-zinc-500" />
                          {seasonLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Açıklama */}
                  {trophy.description && (
                    <p className="text-xs text-zinc-400 line-clamp-2 mb-4 leading-relaxed bg-white/[0.01] p-2.5 rounded-lg border border-white/[0.03]">
                      {trophy.description}
                    </p>
                  )}

                  {/* Rozetler */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-white/5 border border-white/10 text-zinc-300">
                      {trophy.target_type === 'PLAYER' ? 'OYUNCU' : trophy.target_type === 'TEAM' ? 'TAKIM' : 'OYUNCU & TAKIM'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase border ${
                      winnerCount > 0
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500'
                    }`}>
                      {winnerCount > 0 ? `${winnerCount} KAZANAN` : 'HENÜZ ATANMADI'}
                    </span>
                  </div>
                </div>

                {/* Buton Eylemleri */}
                <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                  <button
                    onClick={() => openManageModal(trophy)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-white/5 hover:bg-[#00e5ff]/10 text-zinc-200 hover:text-[#00e5ff] border border-white/10 hover:border-[#00e5ff]/30 rounded-lg text-xs font-black tracking-wide uppercase transition-colors"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>KAZANANLAR ({winnerCount})</span>
                  </button>

                  <button
                    onClick={() => openEditModal(trophy)}
                    className="p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
                    title="Kupayı Düzenle"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setDeletingTrophy(trophy)}
                    className="p-2 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors"
                    title="Kupayı Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-[#03070c] border border-white/5 rounded-2xl space-y-3">
          <Trophy className="w-10 h-10 text-zinc-600 mx-auto" />
          <h3 className="text-sm font-black text-zinc-400 uppercase tracking-wider">
            {search || categoryFilter !== 'ALL' || targetTypeFilter !== 'ALL'
              ? 'Arama kriterlerine uygun kupa bulunamadı.'
              : 'Henüz kupa veya başarı oluşturulmamış.'}
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Yukarıdaki "YENİ KUPA EKLE" butonunu kullanarak Ballon d'Or, Sezon Şampiyonu veya TOTS gibi dinamik kupalar oluşturabilirsiniz.
          </p>
        </div>
      )}

      {/* ── KUPA EKLE / DÜZENLE MODAL ─────────────────────────────────────── */}
      {isTrophyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="card-surface bg-[#03070c] border border-white/10 rounded-2xl w-full max-w-lg p-6 relative glow-cyan my-8">
            <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5">
              <h2 className="text-base font-black text-white tracking-wide uppercase flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#00e5ff]" />
                {editingTrophy ? 'KUPAYI DÜZENLE' : 'YENİ KUPA OLUŞTUR'}
              </h2>
              <button
                onClick={() => setIsTrophyModalOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTrophyFormSubmit} className="space-y-4">
              {/* Kupa Adı */}
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  KUPA / BAŞARI ADI *
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  defaultValue={editingTrophy?.title || ''}
                  placeholder="Örn: Ballon d'Or, Sezon Şampiyonu, TOTS"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
                />
              </div>

              {/* Görsel Yükleme / URL */}
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  KUPA GÖRSELİ * (Storage veya Doğrudan URL)
                </label>
                <div className="flex items-center gap-3 mb-2">
                  {previewImageUrl ? (
                    <div className="w-14 h-14 rounded-xl bg-black border border-white/10 p-1 flex items-center justify-center flex-shrink-0">
                      <img
                        src={previewImageUrl}
                        alt="Önizleme"
                        className="w-full h-full object-contain"
                        onError={() => setPreviewImageUrl('')}
                      />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-black/40 border border-dashed border-white/20 flex items-center justify-center text-zinc-600 flex-shrink-0">
                      <Trophy className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1 space-y-1.5">
                    <input
                      type="file"
                      name="image_file"
                      accept="image/webp,image/png,image/jpeg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPreviewImageUrl(URL.createObjectURL(file));
                        }
                      }}
                      className="block w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-white/10 file:text-white hover:file:bg-[#00e5ff]/20 transition-all cursor-pointer"
                    />
                    <input
                      type="url"
                      name="image_url"
                      defaultValue={editingTrophy?.image_url || ''}
                      placeholder="veya https://... görsel bağlantısı"
                      onChange={(e) => {
                        if (e.target.value.startsWith('http')) {
                          setPreviewImageUrl(e.target.value);
                        }
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Kategori & Hedef Türü */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                    KATEGORİ
                  </label>
                  <input
                    type="text"
                    name="category"
                    list="category-suggestions"
                    defaultValue={editingTrophy?.category || 'Bireysel Ödüller'}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
                  />
                  <datalist id="category-suggestions">
                    {COMMON_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                    KAZANAN HEDEF TÜRÜ
                  </label>
                  <select
                    name="target_type"
                    defaultValue={editingTrophy?.target_type || 'PLAYER'}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
                  >
                    <option value="PLAYER">Yalnızca Oyuncu</option>
                    <option value="TEAM">Yalnızca Takım</option>
                    <option value="BOTH">Hem Oyuncu Hem Takım</option>
                  </select>
                </div>
              </div>

              {/* Sezon Seçimi */}
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  SEZON / DÖNEM (OPSİYONEL)
                </label>
                <select
                  name="season_id"
                  defaultValue={
                    editingTrophy?.season_name
                      ? `HISTORICAL:${editingTrophy.season_name}`
                      : editingTrophy?.season_id || ''
                  }
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
                >
                  <option value="">Genel / Sezon Belirtilmedi</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Açıklama */}
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  AÇIKLAMA (OPSİYONEL)
                </label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={editingTrophy?.description || ''}
                  placeholder="Kupanın veriliş gerekçesi veya kriterleri..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#00e5ff]/50 transition-colors resize-none"
                />
              </div>

              {/* Sıralama */}
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                  GÖRÜNTÜLENME SIRASI (ÖRN: 0, 1, 2)
                </label>
                <input
                  type="number"
                  name="display_order"
                  defaultValue={editingTrophy?.display_order || 0}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
                />
              </div>

              {/* Butonlar */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTrophyModalOpen(false)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
                >
                  İPTAL
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-[#00e5ff] hover:bg-[#00b8d4] text-black font-[900] text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_15px_rgba(0,229,255,0.25)] disabled:opacity-50"
                >
                  {isPending ? 'KAYDEDİLİYOR...' : editingTrophy ? 'GÜNCELLE' : 'OLUŞTUR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── KAZANANLARI YÖNET MODAL / ÇEKMECE ──────────────────────────────── */}
      {managingTrophy && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="card-surface bg-[#03070c] border border-white/10 rounded-2xl w-full max-w-2xl p-6 relative glow-cyan my-8 max-h-[90vh] flex flex-col">
            {/* Modal Başlığı */}
            <div className="flex items-center justify-between pb-4 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-black border border-white/10 p-1 flex items-center justify-center">
                  <img src={managingTrophy.image_url} alt="" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white tracking-wide uppercase">
                    {managingTrophy.title} — KAZANANLARI YÖNET
                  </h2>
                  <span className="text-[11px] text-zinc-400">
                    Toplam {managingTrophy.winners?.length || 0} kazanan kayıtlı
                  </span>
                </div>
              </div>

              <button
                onClick={() => setManagingTrophy(null)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal İçeriği (Kaydırılabilir) */}
            <div className="overflow-y-auto py-5 space-y-6 flex-1 pr-1 custom-scrollbar">
              {/* 1. Yeni Kazanan Ekle Formu */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                <h3 className="text-xs font-black text-[#00e5ff] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 stroke-[3]" /> YENİ KAZANAN ATA
                </h3>

                <form onSubmit={handleAddWinner} className="space-y-3">
                  {/* Kazanan Türü (Hedef tip BOTH ise seçilebilir) */}
                  {managingTrophy.target_type === 'BOTH' && (
                    <div className="flex items-center gap-4 text-xs font-bold text-zinc-300">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="wt"
                          checked={winnerType === 'PLAYER'}
                          onChange={() => {
                            setWinnerType('PLAYER');
                            setSelectedEntityId('');
                          }}
                        />
                        <span>Oyuncu Ekle</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="wt"
                          checked={winnerType === 'TEAM'}
                          onChange={() => {
                            setWinnerType('TEAM');
                            setSelectedEntityId('');
                          }}
                        />
                        <span>Takım Ekle</span>
                      </label>
                    </div>
                  )}

                  {/* Oyuncu veya Takım Arama ve Seçim */}
                  <div>
                    <input
                      type="text"
                      placeholder={winnerType === 'PLAYER' ? 'Oyuncu ara (@kullanıcı adı veya isim)...' : 'Takım ara (takım adı)...'}
                      value={entitySearch}
                      onChange={(e) => setEntitySearch(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#00e5ff]/50 transition-colors mb-2"
                    />

                    <select
                      required
                      value={selectedEntityId}
                      onChange={(e) => setSelectedEntityId(e.target.value)}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
                    >
                      <option value="">
                        {winnerType === 'PLAYER' ? 'Oyuncu Seçin...' : 'Takım Seçin...'}
                      </option>
                      {winnerType === 'PLAYER' ? (
                        profiles
                          .filter((p) => {
                            if (!entitySearch.trim()) return true;
                            const q = entitySearch.toLowerCase().trim();
                            return p.username?.toLowerCase().includes(q) || p.full_name?.toLowerCase().includes(q);
                          })
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              @{p.username} {p.full_name ? `(${p.full_name})` : ''}
                            </option>
                          ))
                      ) : (
                        teams
                          .filter((t) => {
                            if (!entitySearch.trim()) return true;
                            return t.name?.toLowerCase().includes(entitySearch.toLowerCase().trim());
                          })
                          .map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))
                      )}
                    </select>
                  </div>

                  {/* Opsiyonel Not */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Opsiyonel Not (Örn: Sol Kanat, Şampiyon, vb.)"
                      value={winnerNotes}
                      onChange={(e) => setWinnerNotes(e.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={isPending || !selectedEntityId}
                      className="px-4 py-2 bg-[#00e5ff] hover:bg-[#00b8d4] text-black font-[900] text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_10px_rgba(0,229,255,0.2)] disabled:opacity-50"
                    >
                      {isPending ? 'EKLENİYOR...' : 'EKLE'}
                    </button>
                  </div>
                </form>
              </div>

              {/* 2. Mevcut Kazananlar Tablosu */}
              <div>
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-3">
                  MEVCUT KAZANANLAR ({managingTrophy.winners?.length || 0})
                </h3>

                {managingTrophy.winners && managingTrophy.winners.length > 0 ? (
                  <div className="space-y-2">
                    {managingTrophy.winners.map((winner) => {
                      const isPlayer = winner.winner_type === 'PLAYER';
                      const label = isPlayer
                        ? `@${winner.profile?.username || 'Oyuncu'}`
                        : winner.team?.name || 'Takım';
                      const subLabel = isPlayer ? winner.profile?.full_name : null;
                      const avatar = isPlayer ? winner.profile?.avatar_url : winner.team?.logo_url;

                      return (
                        <div
                          key={winner.id}
                          className="flex items-center justify-between p-3 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-xl transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {avatar ? (
                                <img src={avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <User className="w-4 h-4 text-zinc-500" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-white">{label}</span>
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-white/5 border border-white/10 text-zinc-400">
                                  {winner.winner_type}
                                </span>
                              </div>
                              <div className="text-[10px] text-zinc-400 flex items-center gap-2 mt-0.5">
                                {subLabel && <span>{subLabel} •</span>}
                                {winner.notes && <span className="text-cyan-400 font-bold">{winner.notes} •</span>}
                                <span>{new Date(winner.awarded_at).toLocaleDateString('tr-TR')}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleRemoveWinner(winner.id)}
                            disabled={isPending}
                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20 disabled:opacity-50"
                            title="Kazananı Kaldır"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-zinc-500 border border-dashed border-white/5 rounded-xl">
                    Bu kupaya henüz bir kazanan atanmamış.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Alt Kapat */}
            <div className="pt-4 border-t border-white/5 flex justify-end flex-shrink-0">
              <button
                onClick={() => setManagingTrophy(null)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
              >
                TAMAM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SİLME ONAY MODALI ─────────────────────────────────────────────── */}
      {deletingTrophy && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card-surface bg-[#03070c] border border-red-500/30 rounded-2xl w-full max-w-md p-6 relative">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-500 mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-black text-white text-center uppercase tracking-wide mb-2">
              KUPAYI SİLMEK İSTEDİĞİNİZE EMİN MİSİNİZ?
            </h3>
            <p className="text-xs text-zinc-400 text-center leading-relaxed mb-6">
              <strong className="text-white">"{deletingTrophy.title}"</strong> kupası ve buna bağlı tüm kazanan atamaları kalıcı olarak silinecektir. Bu işlem geri alınamaz.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setDeletingTrophy(null)}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
              >
                İPTAL
              </button>
              <button
                onClick={handleDeleteTrophy}
                disabled={isPending}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-[900] text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] disabled:opacity-50"
              >
                {isPending ? 'SİLİNİYOR...' : 'EVET, SİL'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
