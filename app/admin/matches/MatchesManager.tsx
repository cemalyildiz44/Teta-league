
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Search, Shield, X, AlertTriangle, CheckCircle2, Loader2, Trash2, Edit2, Check, XCircle
} from 'lucide-react';
import { 
  reviewMatchAction, deleteMatchAction, updateMatchScoreAction
} from './actions';

export function MatchesManager({ initialMatches, seasons, leagues }: any) {
  const router = useRouter();
  
  const [filterSeason, setFilterSeason] = useState(seasons[0]?.id || '');
  const [filterLeague, setFilterLeague] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  
  // Modals
  const [detailModal, setDetailModal] = useState<any>(null); // holds match info
  const [editScoreModal, setEditScoreModal] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<any>({ isOpen: false });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };
  const closeConfirm = () => setConfirmModal({ ...confirmModal, isOpen: false });

  // Filtered
  const filteredMatches = useMemo(() => {
    return initialMatches.filter((m: any) => {
      if (filterSeason && m.season_id !== filterSeason) return false;
      if (filterLeague !== 'ALL' && m.league_id !== filterLeague) return false;
      if (filterStatus !== 'ALL' && m.status !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!m.home?.name?.toLowerCase().includes(s) && !m.away?.name?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [initialMatches, filterSeason, filterLeague, filterStatus, search]);

  const total = initialMatches.length;
  const pending = initialMatches.filter((m:any) => m.status === 'PENDING_REVIEW').length;
  const approved = initialMatches.filter((m:any) => m.status === 'APPROVED').length;
  const rejected = initialMatches.filter((m:any) => ['REJECTED', 'CANCELLED'].includes(m.status)).length;

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: any = {
      PENDING_REVIEW: 'bg-amber-500/10 text-amber-400 ring-amber-500/30',
      APPROVED: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
      REJECTED: 'bg-red-500/10 text-red-400 ring-red-500/30',
      CANCELLED: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30'
    };
    return <span className={'inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold ring-1 inset-ring ' + (styles[status] || 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30')}>{status}</span>;
  };

  const handleStatus = (m: any, status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW' | 'CANCELLED') => {
    setConfirmModal({
      isOpen: true,
      title: 'Maç Durumunu Değiştir',
      message: 'Maçı ' + status + ' olarak işaretlemek istediğinize emin misiniz? Bu işlem puan durumu ve istatistik hesaplamalarını doğrudan etkileyecektir.',
      type: status === 'REJECTED' || status === 'CANCELLED' ? 'danger' : status === 'APPROVED' ? 'success' : 'warning',
      action: async () => {
        setLoading(true);
        const res = await reviewMatchAction(m.id, status);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || '', 'success'); setDetailModal(null); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const handleDelete = (m: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Maçı Sil',
      message: 'Bu maç kaydını ve bağlı oyuncu istatistiklerini tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      type: 'danger',
      action: async () => {
        setLoading(true);
        const res = await deleteMatchAction(m.id);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || '', 'success'); setDetailModal(null); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const handleEditScore = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await updateMatchScoreAction(editScoreModal.id, parseInt(fd.get('home_score') as string), parseInt(fd.get('away_score') as string));
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); setEditScoreModal(null); setDetailModal(null); router.refresh(); }
    setLoading(false);
  };

  return (
    <div className='space-y-6'>
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
          <p className='text-xs text-zinc-400 font-medium mb-1'>TOPLAM MAÇ</p>
          <p className='text-2xl font-black text-white'>{total}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-amber-400 font-medium mb-1'>BEKLEYEN ONAY</p>
          <p className='text-2xl font-black text-white'>{pending}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-emerald-400 font-medium mb-1'>ONAYLANAN</p>
          <p className='text-2xl font-black text-white'>{approved}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-red-400 font-medium mb-1'>İPTAL / GEÇERSİZ</p>
          <p className='text-2xl font-black text-white'>{rejected}</p>
        </div>
      </div>

      {/* Filters */}
      <div className='card-surface p-4 rounded-xl border border-white/5 flex flex-wrap gap-4'>
        <div className='relative flex-1 min-w-[200px]'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500' />
          <input 
            type='text' placeholder='Takım Ara...' value={search} onChange={e => setSearch(e.target.value)}
            className='w-full pl-9 pr-4 py-2 bg-[#060d18] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50'
          />
        </div>
        <select value={filterSeason} onChange={e => { setFilterSeason(e.target.value); setFilterLeague('ALL'); }} className='bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
          {seasons.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterLeague} onChange={e => setFilterLeague(e.target.value)} className='bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
          <option value='ALL'>Tüm Ligler</option>
          {leagues.filter((l:any) => l.season_id === filterSeason).map((l:any) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className='bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
          <option value='ALL'>Tüm Durumlar</option>
          <option value='PENDING_REVIEW'>Onay Bekleyen</option>
          <option value='APPROVED'>Onaylanmış</option>
          <option value='REJECTED'>Reddedilmiş</option>
        </select>
      </div>

      {/* List */}
      <div className='card-surface rounded-xl border border-white/5 overflow-x-auto'>
        <table className='w-full text-left text-sm text-zinc-400'>
          <thead className='bg-[#0a1628] border-b border-white/5 text-xs uppercase font-black text-cyan-400'>
            <tr>
              <th className='px-4 py-4'>Hafta / Tarih</th>
              <th className='px-4 py-4'>Lig</th>
              <th className='px-4 py-4'>Ev Sahibi</th>
              <th className='px-4 py-4 text-center'>Skor</th>
              <th className='px-4 py-4 text-right'>Deplasman</th>
              <th className='px-4 py-4'>Durum</th>
              <th className='px-4 py-4 text-right'>İşlemler</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-white/5'>
            {filteredMatches.map((m: any) => (
              <tr key={m.id} className='hover:bg-white/5 transition-colors group cursor-pointer' onClick={(e) => { if ((e.target as any).tagName !== 'BUTTON') setDetailModal(m); }}>
                <td className='px-4 py-3'>
                  <div className='font-bold text-white'>Hafta {m.fixtures?.week_number || '?'}</div>
                  <div className='text-[10px] text-zinc-500'>{new Date(m.played_at).toLocaleString('tr-TR')}</div>
                </td>
                <td className='px-4 py-3 text-xs'>{m.leagues?.name}</td>
                <td className='px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <div className='w-6 h-6 rounded-full border border-white/10 bg-[#060d18] overflow-hidden flex items-center justify-center'>
                      {m.home?.logo_url ? <img src={m.home.logo_url} className='w-full h-full object-cover' /> : <Shield className='w-3 h-3 text-zinc-600' />}
                    </div>
                    <span className='font-bold text-white'>{m.home?.name || 'Unknown'}</span>
                  </div>
                </td>
                <td className='px-4 py-3 text-center'>
                  {m.home_score !== null && m.away_score !== null ? (
                    <span className='font-black text-white bg-[#060d18] px-2 py-1 border border-white/10 rounded'>
                      {m.home_score} - {m.away_score}
                    </span>
                  ) : (
                    <span className='text-[10px] text-zinc-500'>-</span>
                  )}
                </td>
                <td className='px-4 py-3'>
                  <div className='flex items-center justify-end gap-2'>
                    <span className='font-bold text-white'>{m.away?.name || 'Unknown'}</span>
                    <div className='w-6 h-6 rounded-full border border-white/10 bg-[#060d18] overflow-hidden flex items-center justify-center'>
                      {m.away?.logo_url ? <img src={m.away.logo_url} className='w-full h-full object-cover' /> : <Shield className='w-3 h-3 text-zinc-600' />}
                    </div>
                  </div>
                </td>
                <td className='px-4 py-3'>
                  <StatusBadge status={m.status} />
                </td>
                <td className='px-4 py-3 text-right'>
                  <button onClick={(e) => { e.stopPropagation(); setDetailModal(m); }} className='px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold rounded transition-colors'>
                    DETAY
                  </button>
                </td>
              </tr>
            ))}
            {filteredMatches.length === 0 && (
              <tr>
                <td colSpan={7} className='px-4 py-12 text-center text-zinc-500'>Bu filtrelerle eşleşen maç bulunamadı.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detailModal && (
        <div className='fixed inset-0 z-50 flex justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto'>
          <div className='card-surface w-full max-w-4xl rounded-2xl border border-white/10 flex flex-col my-auto max-h-[90vh]'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628] shrink-0'>
              <h2 className='text-sm font-black text-white tracking-widest'>MAÇ DETAYI</h2>
              <button onClick={() => setDetailModal(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            
            <div className='flex-1 overflow-y-auto p-6 space-y-8'>
              {/* Header Info */}
              <div className='flex flex-col items-center justify-center gap-4 bg-[#060d18] p-6 rounded-xl border border-white/5'>
                <div className='text-xs font-bold text-zinc-400 uppercase tracking-widest text-center'>
                  {detailModal.seasons?.name} • {detailModal.leagues?.name} • Hafta {detailModal.fixtures?.week_number || '?'}
                  <br/>
                  <span className='text-[10px]'>{new Date(detailModal.played_at).toLocaleString('tr-TR')}</span>
                </div>
                
                <div className='flex items-center gap-8'>
                  <div className='flex flex-col items-center gap-2 w-32'>
                    <div className='w-16 h-16 rounded-full border border-white/10 bg-[#0a1628] overflow-hidden flex items-center justify-center'>
                      {detailModal.home?.logo_url ? <img src={detailModal.home.logo_url} className='w-full h-full object-cover' /> : <Shield className='w-8 h-8 text-zinc-600' />}
                    </div>
                    <span className='font-bold text-white text-center'>{detailModal.home?.name || 'Unknown'}</span>
                  </div>
                  
                  <div className='flex flex-col items-center gap-2'>
                    {detailModal.home_score !== null && detailModal.away_score !== null ? (
                      <div className='text-4xl font-black text-white px-6 py-2 bg-[#0a1628] border border-white/10 rounded-lg shadow-xl flex items-center gap-4'>
                        <span>{detailModal.home_score}</span>
                        <span className='text-zinc-600'>-</span>
                        <span>{detailModal.away_score}</span>
                      </div>
                    ) : (
                      <span className='text-sm text-zinc-500 italic'>Skor Yok</span>
                    )}
                    <StatusBadge status={detailModal.status} />
                  </div>

                  <div className='flex flex-col items-center gap-2 w-32'>
                    <div className='w-16 h-16 rounded-full border border-white/10 bg-[#0a1628] overflow-hidden flex items-center justify-center'>
                      {detailModal.away?.logo_url ? <img src={detailModal.away.logo_url} className='w-full h-full object-cover' /> : <Shield className='w-8 h-8 text-zinc-600' />}
                    </div>
                    <span className='font-bold text-white text-center'>{detailModal.away?.name || 'Unknown'}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className='flex flex-wrap gap-3 justify-center'>
                <Link href={'/mac/' + detailModal.id} target='_blank' className='px-4 py-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-lg text-xs font-bold transition-colors'>
                  Public Sayfayı Aç
                </Link>
                <button onClick={() => setEditScoreModal(detailModal)} className='px-4 py-2 bg-zinc-500/10 text-zinc-300 hover:bg-zinc-500/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-2'>
                  <Edit2 className='w-4 h-4' /> Skoru Düzenle
                </button>
                {detailModal.status !== 'APPROVED' && (
                  <button onClick={() => handleStatus(detailModal, 'APPROVED')} className='px-4 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-2'>
                    <CheckCircle2 className='w-4 h-4' /> Maçı Onayla
                  </button>
                )}
                {detailModal.status !== 'REJECTED' && (
                  <button onClick={() => handleStatus(detailModal, 'REJECTED')} className='px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-2'>
                    <XCircle className='w-4 h-4' /> Reddet / Geçersiz Kıl
                  </button>
                )}
                <button onClick={() => handleDelete(detailModal)} className='px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ml-auto border border-red-500/30'>
                  <Trash2 className='w-4 h-4' /> Maçı Sil
                </button>
              </div>

              {/* Player Stats */}
              <div>
                <h3 className='text-xs font-black text-cyan-400 tracking-widest uppercase mb-4 border-b border-white/5 pb-2'>Oyuncu İstatistikleri</h3>
                {detailModal.stats && detailModal.stats.length > 0 ? (
                  <div className='overflow-x-auto rounded-lg border border-white/5'>
                    <table className='w-full text-left text-sm text-zinc-400'>
                      <thead className='bg-[#0a1628] text-[10px] uppercase font-black text-zinc-500'>
                        <tr>
                          <th className='px-3 py-2'>Oyuncu</th>
                          <th className='px-3 py-2'>Takım</th>
                          <th className='px-3 py-2'>Poz</th>
                          <th className='px-3 py-2 text-center'>Gol</th>
                          <th className='px-3 py-2 text-center'>Asist</th>
                          <th className='px-3 py-2 text-center'>Rating</th>
                          <th className='px-3 py-2 text-center'>Şut</th>
                          <th className='px-3 py-2 text-center'>Pas</th>
                          <th className='px-3 py-2 text-center'>MOM</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-white/5 bg-[#060d18]'>
                        {detailModal.stats.map((s:any) => (
                          <tr key={s.id} className='hover:bg-white/5'>
                            <td className='px-3 py-2 font-bold text-white'>
                              {s.profiles?.username || s.ea_player_name || 'Bilinmiyor'}
                            </td>
                            <td className='px-3 py-2 text-xs'>
                              {s.team_id === detailModal.home_team_id ? detailModal.home?.name : detailModal.away?.name}
                            </td>
                            <td className='px-3 py-2 text-[10px] font-mono'>{s.position}</td>
                            <td className='px-3 py-2 text-center font-bold text-white'>{s.goals}</td>
                            <td className='px-3 py-2 text-center font-bold text-white'>{s.assists}</td>
                            <td className='px-3 py-2 text-center text-amber-400 font-mono'>{s.rating}</td>
                            <td className='px-3 py-2 text-center'>{s.shots}</td>
                            <td className='px-3 py-2 text-center'>{s.passes_made}/{s.pass_attempts}</td>
                            <td className='px-3 py-2 text-center'>{s.is_mom ? <span className='text-amber-400'>⭐</span> : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className='p-8 bg-[#060d18] rounded-xl border border-white/5 text-center text-zinc-500 text-sm'>
                    Bu maç için oyuncu istatistiği bulunmuyor.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Score Modal */}
      {editScoreModal && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden flex flex-col'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest'>SKOR DÜZENLE</h2>
              <button onClick={() => setEditScoreModal(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleEditScore} className='p-6 space-y-6'>
              <div className='flex items-center justify-between gap-4'>
                <div className='flex flex-col items-center flex-1'>
                  <span className='text-xs font-bold text-zinc-400 mb-2 truncate max-w-[100px]'>{editScoreModal.home?.name}</span>
                  <input name='home_score' type='number' defaultValue={editScoreModal.home_score} required min='0' className='w-20 text-center text-2xl font-black bg-[#060d18] border border-white/10 rounded-lg py-2 text-white' />
                </div>
                <span className='text-xl font-black text-zinc-600'>-</span>
                <div className='flex flex-col items-center flex-1'>
                  <span className='text-xs font-bold text-zinc-400 mb-2 truncate max-w-[100px]'>{editScoreModal.away?.name}</span>
                  <input name='away_score' type='number' defaultValue={editScoreModal.away_score} required min='0' className='w-20 text-center text-2xl font-black bg-[#060d18] border border-white/10 rounded-lg py-2 text-white' />
                </div>
              </div>
              
              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => setEditScoreModal(null)} className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold'>İPTAL</button>
                <button type='submit' disabled={loading} className='flex-1 py-2 bg-cyan-500 text-black rounded-lg text-xs font-black flex justify-center items-center gap-2'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} KAYDET
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className='fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden'>
            <div className={'flex p-4 border-b border-white/5 ' + (confirmModal.type === 'danger' ? 'bg-red-500/10' : confirmModal.type === 'warning' ? 'bg-amber-500/10' : 'bg-emerald-500/10')}>
              <h2 className={'text-sm font-black tracking-widest ' + (confirmModal.type === 'danger' ? 'text-red-400' : confirmModal.type === 'warning' ? 'text-amber-400' : 'text-emerald-400')}>
                {confirmModal.title}
              </h2>
            </div>
            <div className='p-6'>
              <p className='text-sm text-zinc-300 leading-relaxed mb-6'>{confirmModal.message}</p>
              <div className='flex gap-2'>
                <button onClick={closeConfirm} className='flex-1 py-2.5 bg-white/5 text-white rounded-lg text-xs font-bold'>Vazgeç</button>
                <button onClick={confirmModal.action} disabled={loading} className={'flex-1 py-2.5 rounded-lg text-xs font-black flex justify-center items-center gap-2 ' + (confirmModal.type === 'danger' ? 'bg-red-500 text-white' : confirmModal.type === 'warning' ? 'bg-amber-500 text-black' : 'bg-emerald-500 text-black')}>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} Onayla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

