'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Newspaper, Plus, Trash2, Edit3, Eye, EyeOff, Loader2, 
  ExternalLink, Search, CheckCircle2, AlertCircle, X, Image as ImageIcon
} from 'lucide-react';
import { 
  createNewsAction, 
  updateNewsAction, 
  deleteNewsAction, 
  togglePublishNewsAction 
} from './actions';
import { NewsArticle } from '@/types/news';

interface NewsManagerProps {
  initialNews: NewsArticle[];
}

const CATEGORIES = [
  'LİG HABERİ',
  'BİLGİLENDİRME',
  'TRANSFER',
  'TURNUVA',
  'DUYURU',
  'ÖZEL HABER',
];

export function NewsManager({ initialNews }: NewsManagerProps) {
  const router = useRouter();

  const [newsList, setNewsList] = useState<NewsArticle[]>(initialNews);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<NewsArticle | null>(null);
  const [deleteConfirmNews, setDeleteConfirmNews] = useState<NewsArticle | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4500);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await createNewsAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Haber oluşturuldu.', 'success');
      setCreateModalOpen(false);
      router.refresh();
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await updateNewsAction(formData);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Haber güncellendi.', 'success');
      setEditingNews(null);
      router.refresh();
    }
  };

  const handleDelete = async (news: NewsArticle) => {
    setLoading(true);
    const res = await deleteNewsAction(news.id);
    setLoading(false);
    setDeleteConfirmNews(null);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Haber silindi.', 'success');
      router.refresh();
    }
  };

  const handleTogglePublish = async (news: NewsArticle) => {
    setLoading(true);
    const res = await togglePublishNewsAction(news.id, !news.is_published);
    setLoading(false);

    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || 'Durum güncellendi.', 'success');
      router.refresh();
    }
  };

  const filteredNews = newsList.filter((item) => {
    const matchesSearch = 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.summary && item.summary.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = categoryFilter === 'ALL' || item.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {/* Feedback Alert */}
      {feedback && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border ${
          feedback.type === 'success' 
            ? 'bg-green-500/10 border-green-500/30 text-green-400' 
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-semibold">{feedback.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0a1628] p-6 rounded-2xl border border-white/5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 flex items-center justify-center text-[#00e5ff]">
              <Newspaper className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white uppercase tracking-wider">Haber Yönetimi</h1>
              <p className="text-xs text-gray-400 font-medium">TETA League duyuruları, lig haberleri ve içerik yayını</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#00e5ff] text-black font-black text-sm uppercase tracking-wider hover:bg-[#00e5ff]/90 transition-all shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Yeni Haber Ekle
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Başlık, kategori veya özete göre ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0a1628] border border-white/5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00e5ff]/50"
          />
        </div>
        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a1628] border border-white/5 text-sm text-white focus:outline-none focus:border-[#00e5ff]/50"
          >
            <option value="ALL">Tüm Kategoriler</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* News List Table / Cards */}
      <div className="bg-[#0a1628] rounded-2xl border border-white/5 overflow-hidden">
        {filteredNews.length === 0 ? (
          <div className="p-12 text-center">
            <Newspaper className="w-12 h-12 text-gray-600 mx-auto mb-3 opacity-50" />
            <h3 className="text-white font-bold text-base mb-1">Henüz haber bulunmuyor</h3>
            <p className="text-gray-400 text-xs">
              {searchQuery || categoryFilter !== 'ALL' 
                ? 'Arama kriterlerinize uygun haber bulunamadı.' 
                : 'Yeni haber ekleyerek lig duyurularını buradan yönetebilirsiniz.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[11px] font-black uppercase tracking-wider text-gray-400 bg-black/20">
                  <th className="py-3.5 px-4">Görsel / Başlık</th>
                  <th className="py-3.5 px-4">Kategori</th>
                  <th className="py-3.5 px-4">Durum</th>
                  <th className="py-3.5 px-4">Tarih</th>
                  <th className="py-3.5 px-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredNews.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-10 rounded-lg overflow-hidden bg-black/40 shrink-0 border border-white/5 relative">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 max-w-[340px]">
                          <div className="text-sm font-bold text-white truncate hover:text-[#00e5ff] transition-colors">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-gray-400 truncate">
                            /{item.slug}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20">
                        {item.category}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {item.is_published ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-green-400 bg-green-500/10 px-2.5 py-1 rounded border border-green-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          Yayında
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 bg-zinc-500/10 px-2.5 py-1 rounded border border-zinc-500/20">
                          Taslak
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(item.published_at || item.created_at).toLocaleDateString('tr-TR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Public Link */}
                        <Link
                          href={`/haberler/${item.slug}`}
                          target="_blank"
                          title="Habere Git"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#00e5ff] hover:bg-white/5 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>

                        {/* Publish/Unpublish Toggle */}
                        <button
                          onClick={() => handleTogglePublish(item)}
                          disabled={loading}
                          title={item.is_published ? 'Yayından Kaldır' : 'Yayınla'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            item.is_published 
                              ? 'text-green-400 hover:bg-green-500/10' 
                              : 'text-gray-400 hover:bg-white/5'
                          }`}
                        >
                          {item.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => setEditingNews(item)}
                          disabled={loading}
                          title="Düzenle"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => setDeleteConfirmNews(item)}
                          disabled={loading}
                          title="Sil"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5">
              <div className="flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-[#00e5ff]" />
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">Yeni Haber Oluştur</h2>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Başlık *
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="Örn: 2026 Sezonu Başlıyor!"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    Kategori
                  </label>
                  <select
                    name="category"
                    defaultValue="LİG HABERİ"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    URL Slug (İsteğe bağlı)
                  </label>
                  <input
                    type="text"
                    name="slug"
                    placeholder="Boş bırakılırsa başlıktan üretilir"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Özet (Kısa Açıklama)
                </label>
                <textarea
                  name="summary"
                  rows={2}
                  placeholder="Ana sayfa ve kartlarda gösterilecek kısa özet..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Haber İçeriği *
                </label>
                <textarea
                  name="content"
                  rows={8}
                  required
                  placeholder="Haberin tam detayları..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    Kapak Görseli Yükle
                  </label>
                  <input
                    type="file"
                    name="image_file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="w-full text-xs text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#00e5ff]/20 file:text-[#00e5ff] hover:file:bg-[#00e5ff]/30 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    veya Görsel URL
                  </label>
                  <input
                    type="url"
                    name="image_url"
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_published"
                  name="is_published"
                  defaultChecked
                  className="w-4 h-4 rounded border-white/10 bg-black/40 text-[#00e5ff] focus:ring-[#00e5ff]"
                />
                <label htmlFor="is_published" className="text-sm font-semibold text-white cursor-pointer">
                  Hemen Yayına Al
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-sm font-bold hover:bg-white/10 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-[#00e5ff] text-black text-sm font-black uppercase tracking-wider hover:bg-[#00e5ff]/90 transition-colors disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Kaydet ve Yayınla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingNews && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-yellow-400" />
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">Haberi Düzenle</h2>
              </div>
              <button
                onClick={() => setEditingNews(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              <input type="hidden" name="id" value={editingNews.id} />
              <input type="hidden" name="existing_image_url" value={editingNews.image_url || ''} />

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Başlık *
                </label>
                <input
                  type="text"
                  name="title"
                  defaultValue={editingNews.title}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    Kategori
                  </label>
                  <select
                    name="category"
                    defaultValue={editingNews.category}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    URL Slug
                  </label>
                  <input
                    type="text"
                    name="slug"
                    defaultValue={editingNews.slug}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Özet (Kısa Açıklama)
                </label>
                <textarea
                  name="summary"
                  rows={2}
                  defaultValue={editingNews.summary || ''}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Haber İçeriği *
                </label>
                <textarea
                  name="content"
                  rows={8}
                  defaultValue={editingNews.content}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                />
              </div>

              {editingNews.image_url && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-white/5">
                  <img src={editingNews.image_url} alt="Mevcut görsel" className="w-16 h-12 object-cover rounded-lg" />
                  <div className="text-xs text-gray-400 truncate">
                    Mevcut Görsel: <span className="text-white truncate">{editingNews.image_url}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    Yeni Görsel Yükle (Opsiyonel)
                  </label>
                  <input
                    type="file"
                    name="image_file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="w-full text-xs text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#00e5ff]/20 file:text-[#00e5ff] hover:file:bg-[#00e5ff]/30 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    veya Yeni Görsel URL
                  </label>
                  <input
                    type="url"
                    name="image_url"
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00e5ff]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="edit_is_published"
                  name="is_published"
                  defaultChecked={editingNews.is_published}
                  className="w-4 h-4 rounded border-white/10 bg-black/40 text-[#00e5ff] focus:ring-[#00e5ff]"
                />
                <label htmlFor="edit_is_published" className="text-sm font-semibold text-white cursor-pointer">
                  Yayında Tut
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setEditingNews(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-sm font-bold hover:bg-white/10 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-yellow-400 text-black text-sm font-black uppercase tracking-wider hover:bg-yellow-300 transition-colors disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Güncelle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmNews && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0a1628] border border-red-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Haberi Sil</h3>
            </div>
            <p className="text-sm text-gray-300 mb-6">
              &quot;<span className="text-white font-semibold">{deleteConfirmNews.title}</span>&quot; başlıklı haberi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmNews(null)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-sm font-bold hover:bg-white/10 transition-colors"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmNews)}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
