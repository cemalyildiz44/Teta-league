
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Search, Plus, Filter, MoreVertical, 
  Edit2, CheckCircle2, Archive, Trash2, 
  AlertTriangle, X, Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { 
  createSeason, editSeason, 
  updateSeasonStatus, forceUpdateSeasonStatus, deleteSeason 
} from './actions';

type Season = {
  id: string;
  name: string;
  slug: string;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  roster_min: number;
  roster_max: number;
  created_at: string;
};

export function SeasonsManager({ initialSeasons }: { initialSeasons: Season[] }) {
  const router = useRouter();
  const [seasons, setSeasons] = useState(initialSeasons);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  
  useEffect(() => {
    setSeasons(initialSeasons);
  }, [initialSeasons]);
  
  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [editSeasonData, setEditSeasonData] = useState<Season | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
    type: 'danger' | 'warning' | 'info';
  }>({ isOpen: false, title: '', message: '', action: async () => {}, type: 'info' });

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  // Derived state
  const filteredSeasons = seasons.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.slug.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'ALL' || s.status === filter;
    return matchesSearch && matchesFilter;
  });

  const activeCount = seasons.filter(s => s.status === 'ACTIVE').length;
  const upcomingCount = seasons.filter(s => s.status === 'UPCOMING').length;
  const completedCount = seasons.filter(s => s.status === 'COMPLETED').length;

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  // Form Handlers
  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await createSeason(formData);
    if (res.error) showFeedback(res.error, 'error');
    else {
      showFeedback(res.success || "", 'success');
      setCreateModal(false);
      router.refresh(); // Simple refresh to sync state
    }
    setLoading(false);
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await editSeason(formData);
    if (res.error) showFeedback(res.error, 'error');
    else {
      showFeedback(res.success || "", 'success');
      setEditSeasonData(null);
      router.refresh();
    }
    setLoading(false);
  };

  // Actions
  const handleActivate = (s: Season) => {
    if (activeCount > 0 && !seasons.find(x => x.id === s.id && x.status === 'ACTIVE')) {
      setConfirmModal({
        isOpen: true,
        title: 'Aktif Sezonu Değiştir',
        message: 'Şu anda aktif bir sezon bulunuyor. Yeni sezonu aktif yapmak mevcut aktif sezonu etkileyecektir (Tamamlandı olarak işaretlenir). Devam etmek istiyor musunuz?',
        type: 'warning',
        action: async () => {
          setLoading(true);
          const res = await forceUpdateSeasonStatus(s.id, 'ACTIVE');
          if (res.error) showFeedback(res.error, 'error');
          else { showFeedback(res.success || "", 'success'); router.refresh(); }
          setLoading(false);
          closeConfirm();
        }
      });
    } else {
      setConfirmModal({
        isOpen: true,
        title: 'Sezonu Aktif Yap',
        message: 'Bu sezonu aktif yapmak istediğinize emin misiniz?',
        type: 'info',
        action: async () => {
          setLoading(true);
          const res = await updateSeasonStatus(s.id, 'ACTIVE');
          if (res.error) showFeedback(res.error, 'error');
          else { showFeedback(res.success || "", 'success'); router.refresh(); }
          setLoading(false);
          closeConfirm();
        }
      });
    }
  };

  const handleComplete = (s: Season) => {
    setConfirmModal({
      isOpen: true,
      title: 'Sezonu Tamamla',
      message: s.name + ' tamamlamak istediğinize emin misiniz? Bu işlem sezon durumunu COMPLETED yapacaktır.',
      type: 'warning',
      action: async () => {
        setLoading(true);
        const res = await updateSeasonStatus(s.id, 'COMPLETED');
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || "", 'success'); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const handleArchive = (s: Season) => {
    setConfirmModal({
      isOpen: true,
      title: 'Sezonu Arşivle',
      message: s.name + ' adlı sezonu arşivlemek istediğinize emin misiniz? Arşivlenen sezonlar genel listelerde daha az görünür olur.',
      type: 'info',
      action: async () => {
        setLoading(true);
        const res = await updateSeasonStatus(s.id, 'ARCHIVED');
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || "", 'success'); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const handleDelete = (s: Season) => {
    setConfirmModal({
      isOpen: true,
      title: 'Sezonu Sil',
      message: s.name + ' adlı sezonu silmek istediğinize emin misiniz? Eğer bu sezona ait lig, takım veya maç verisi varsa silme işlemi engellenecektir.',
      type: 'danger',
      action: async () => {
        setLoading(true);
        const res = await deleteSeason(s.id);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || "", 'success'); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
      ACTIVE: 'bg-cyan-500/10 text-cyan-400 ring-cyan-500/30',
      UPCOMING: 'bg-amber-500/10 text-amber-400 ring-amber-500/30',
      COMPLETED: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30',
      ARCHIVED: 'bg-gray-800 text-gray-500 ring-gray-700'
    }[status] || 'bg-gray-500/10 text-gray-400 ring-gray-500/30';
    
    const labels = { ACTIVE: 'AKTİF', UPCOMING: 'YAKLAŞAN', COMPLETED: 'TAMAMLANDI', ARCHIVED: 'ARŞİVLENDİ' } as any;
    return <span className={'inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold ring-1 inset-ring ' + styles}>{labels[status] || status}</span>;
  };

  return (
    <div className='space-y-6'>
      {/* Feedback Toast */}
      {feedback && (
        <div className={'fixed top-4 right-4 z-50 p-4 rounded-xl border shadow-xl flex items-center gap-3 transition-all ' + 
          (feedback.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400')}>
          {feedback.type === 'error' ? <AlertTriangle className='w-5 h-5' /> : <CheckCircle2 className='w-5 h-5' />}
          <p className='text-sm font-medium'>{feedback.msg}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-zinc-400 font-medium mb-1'>TOPLAM SEZON</p>
          <p className='text-2xl font-black text-white'>{seasons.length}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-cyan-400 font-medium mb-1'>AKTİF SEZON</p>
          <p className='text-2xl font-black text-white'>{activeCount}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-amber-400 font-medium mb-1'>YAKLAŞAN</p>
          <p className='text-2xl font-black text-white'>{upcomingCount}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-zinc-400 font-medium mb-1'>TAMAMLANAN</p>
          <p className='text-2xl font-black text-white'>{completedCount}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className='flex flex-col md:flex-row gap-4 items-start md:items-center justify-between'>
        <div className='flex items-center gap-2 w-full md:w-auto'>
          <div className='relative w-full md:w-64'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500' />
            <input 
              type='text' placeholder='Sezon Ara...' 
              value={search} onChange={e => setSearch(e.target.value)}
              className='w-full pl-9 pr-4 py-2 bg-[#060d18] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50'
            />
          </div>
          <div className='flex bg-[#060d18] rounded-lg border border-white/10 p-1'>
            {['ALL', 'ACTIVE', 'UPCOMING', 'COMPLETED', 'ARCHIVED'].map(f => (
              <button 
                key={f} onClick={() => setFilter(f)}
                className={'px-3 py-1.5 text-[10px] font-bold rounded-md transition-colors ' + 
                  (filter === f ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300')}
              >
                {f === 'ALL' ? 'TÜMÜ' : f === 'ACTIVE' ? 'AKTİF' : f === 'UPCOMING' ? 'YAKLAŞAN' : f === 'COMPLETED' ? 'TAMAMLANAN' : 'ARŞİV'}
              </button>
            ))}
          </div>
        </div>
        
        <button onClick={() => setCreateModal(true)} className='flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg text-sm font-black transition-colors w-full md:w-auto justify-center'>
          <Plus className='w-4 h-4' /> YENİ SEZON EKLE
        </button>
      </div>

      {/* Table */}
      <div className='card-surface rounded-xl border border-white/5 overflow-x-auto'>
        <table className='w-full text-left text-sm text-zinc-400'>
          <thead className='bg-[#0a1628] border-b border-white/5 text-xs uppercase font-black text-cyan-400'>
            <tr>
              <th className='px-4 py-4'>Sezon</th>
              <th className='px-4 py-4'>Slug</th>
              <th className='px-4 py-4'>Durum</th>
              <th className='px-4 py-4'>Kadro Lm.</th>
              <th className='px-4 py-4'>Oluşturulma</th>
              <th className='px-4 py-4 text-right'>İşlemler</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-white/5'>
            {filteredSeasons.map(s => (
              <tr key={s.id} className='hover:bg-white/5 transition-colors group'>
                <td className='px-4 py-4'>
                  <Link href={'/admin/seasons/' + s.id} className='font-bold text-white hover:text-cyan-400 transition-colors'>
                    {s.name}
                  </Link>
                </td>
                <td className='px-4 py-4 font-mono text-xs'>{s.slug}</td>
                <td className='px-4 py-4'><StatusBadge status={s.status} /></td>
                <td className='px-4 py-4'>{s.roster_min} - {s.roster_max}</td>
                <td className='px-4 py-4'>{new Date(s.created_at).toLocaleDateString('tr-TR')}</td>
                <td className='px-4 py-4'>
                  <div className='flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                    <button onClick={() => setEditSeasonData(s)} className='p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-zinc-300' title='Düzenle'>
                      <Edit2 className='w-4 h-4' />
                    </button>
                    {(s.status === 'UPCOMING' || s.status === 'COMPLETED') && (
                      <button onClick={() => handleActivate(s)} className='p-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-md text-cyan-400' title='Aktif Yap'>
                        <CheckCircle2 className='w-4 h-4' />
                      </button>
                    )}
                    {s.status === 'ACTIVE' && (
                      <button onClick={() => handleComplete(s)} className='p-1.5 bg-zinc-500/10 hover:bg-zinc-500/20 rounded-md text-zinc-400' title='Sezonu Tamamla'>
                        <Archive className='w-4 h-4' />
                      </button>
                    )}
                    {s.status === 'COMPLETED' && (
                      <button onClick={() => handleArchive(s)} className='p-1.5 bg-gray-700 hover:bg-gray-600 rounded-md text-gray-300' title='Arşivle'>
                        <Archive className='w-4 h-4' />
                      </button>
                    )}
                    <button onClick={() => handleDelete(s)} className='p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-md text-red-400' title='Sil'>
                      <Trash2 className='w-4 h-4' />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredSeasons.length === 0 && (
              <tr>
                <td colSpan={6} className='px-4 py-12 text-center text-zinc-500'>
                  {seasons.length === 0 ? 'Henüz sezon oluşturulmadı.' : 'Arama kriterlerine uygun sezon bulunamadı.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {createModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-md rounded-2xl border border-white/10 overflow-hidden'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest'>YENİ SEZON EKLE</h2>
              <button onClick={() => setCreateModal(false)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleCreate} className='p-6 space-y-4'>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Sezon Adı</label>
                <input name='name' required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none' placeholder='Örn: TETA League 7. Sezon' />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Slug</label>
                <input name='slug' required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none' placeholder='sezon-7' />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Durum</label>
                <select name='status' className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
                  <option value='UPCOMING'>YAKLAŞAN (UPCOMING)</option>
                  <option value='ACTIVE'>AKTİF (ACTIVE)</option>
                  <option value='COMPLETED'>TAMAMLANDI (COMPLETED)</option>
                  <option value='ARCHIVED'>ARŞİVLENDİ (ARCHIVED)</option>
                </select>
              </div>
              <div className='flex gap-4'>
                <div className='flex-1'>
                  <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Min Kadro</label>
                  <input name='roster_min' type='number' defaultValue={7} min={1} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none' />
                </div>
                <div className='flex-1'>
                  <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Max Kadro</label>
                  <input name='roster_max' type='number' defaultValue={30} min={1} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none' />
                </div>
              </div>
              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => setCreateModal(false)} className='flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors'>İPTAL</button>
                <button type='submit' disabled={loading} className='flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-xs font-black transition-colors disabled:opacity-50 flex justify-center items-center gap-2'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />}
                  OLUŞTUR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editSeasonData && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-md rounded-2xl border border-white/10 overflow-hidden'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest'>SEZONU DÜZENLE</h2>
              <button onClick={() => setEditSeasonData(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleEdit} className='p-6 space-y-4'>
              <input type='hidden' name='id' value={editSeasonData.id} />
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Sezon Adı</label>
                <input name='name' defaultValue={editSeasonData.name} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none' />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Slug</label>
                <input name='slug' defaultValue={editSeasonData.slug} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none' />
              </div>
              <div className='flex gap-4'>
                <div className='flex-1'>
                  <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Min Kadro</label>
                  <input name='roster_min' type='number' defaultValue={editSeasonData.roster_min} min={1} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none' />
                </div>
                <div className='flex-1'>
                  <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Max Kadro</label>
                  <input name='roster_max' type='number' defaultValue={editSeasonData.roster_max} min={1} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none' />
                </div>
              </div>
              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => setEditSeasonData(null)} className='flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors'>İPTAL</button>
                <button type='submit' disabled={loading} className='flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-xs font-black transition-colors disabled:opacity-50 flex justify-center items-center gap-2'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />}
                  GÜNCELLE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden'>
            <div className={'flex justify-between items-center p-4 border-b border-white/5 ' + 
              (confirmModal.type === 'danger' ? 'bg-red-500/10' : confirmModal.type === 'warning' ? 'bg-amber-500/10' : 'bg-[#0a1628]')}>
              <h2 className={'text-sm font-black tracking-widest ' + 
                (confirmModal.type === 'danger' ? 'text-red-400' : confirmModal.type === 'warning' ? 'text-amber-400' : 'text-cyan-400')}>
                {confirmModal.title}
              </h2>
            </div>
            <div className='p-6'>
              <p className='text-sm text-zinc-300 leading-relaxed mb-6'>{confirmModal.message}</p>
              <div className='flex gap-2'>
                <button onClick={closeConfirm} className='flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors'>Vazgeç</button>
                <button onClick={confirmModal.action} disabled={loading} className={'flex-1 py-2.5 rounded-lg text-xs font-black transition-colors disabled:opacity-50 flex justify-center items-center gap-2 ' + 
                  (confirmModal.type === 'danger' ? 'bg-red-500 hover:bg-red-400 text-white' : 
                   confirmModal.type === 'warning' ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-cyan-500 hover:bg-cyan-400 text-black')}>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />}
                  Onayla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

