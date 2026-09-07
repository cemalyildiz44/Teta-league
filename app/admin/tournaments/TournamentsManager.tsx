
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Trophy, Plus, Trash2, ShieldAlert, X, Loader2, Image as ImageIcon, Users, CheckCircle2, XCircle, User
} from 'lucide-react';
import { 
  create1V1WinnerAction, createKarmaWinnerAction, createNightCupAction, 
  deleteTournamentAction, updateNightCupApplicationStatusAction, assignNightCupWinnerAction
} from './actions';

export function TournamentsManager({ tournaments, winners, applications, seasons, profiles }: any) {
  const router = useRouter();
  
  const [tab, setTab] = useState('1V1');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const [create1V1Modal, setCreate1V1Modal] = useState(false);
  const [createKarmaModal, setCreateKarmaModal] = useState(false);
  const [createNightCupModal, setCreateNightCupModal] = useState(false);
  
  const [confirmModal, setConfirmModal] = useState<any>({ isOpen: false });
  const [karmaProfiles, setKarmaProfiles] = useState<string[]>([]);
  const [selectedNightCup, setSelectedNightCup] = useState<string | null>(null);

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleCreate1V1 = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const res = await create1V1WinnerAction(new FormData(e.target));
    setLoading(false);
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); setCreate1V1Modal(false); router.refresh(); }
  };

  const handleCreateKarma = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.target);
    formData.append('profiles', JSON.stringify(karmaProfiles));
    const res = await createKarmaWinnerAction(formData);
    setLoading(false);
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); setCreateKarmaModal(false); setKarmaProfiles([]); router.refresh(); }
  };

  const handleCreateNightCup = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const res = await createNightCupAction(new FormData(e.target));
    setLoading(false);
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); setCreateNightCupModal(false); router.refresh(); }
  };

  const handleAction = async (actionFn: any, ...args: any[]) => {
    setLoading(true);
    const res = await actionFn(...args);
    setLoading(false);
    setConfirmModal({ isOpen: false });
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); router.refresh(); }
  };

  const toggleKarmaProfile = (id: string) => {
    if (karmaProfiles.includes(id)) {
      setKarmaProfiles(karmaProfiles.filter(p => p !== id));
    } else {
      if (karmaProfiles.length >= 11) return showFeedback('En fazla 11 oyuncu seçebilirsiniz.', 'error');
      setKarmaProfiles([...karmaProfiles, id]);
    }
  };

  const filteredTournaments = tournaments.filter((t: any) => t.type === tab);

  return (
    <div className='space-y-6'>
      {feedback && (
        <div className={`p-4 rounded-xl text-sm font-bold flex items-center gap-2 ${feedback.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
          <ShieldAlert className='w-5 h-5'/> {feedback.msg}
        </div>
      )}

      {/* Tabs */}
      <div className='flex items-center gap-2 bg-[#060d18] p-1.5 rounded-xl border border-white/5'>
        {['1V1', 'KARMA', 'NIGHT_CUP'].map(t => (
          <button 
            key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-zinc-500 hover:text-white'}`}
          >
            {t.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className='space-y-4'>
        <div className='flex justify-end'>
          {tab === '1V1' && (
            <button onClick={() => setCreate1V1Modal(true)} className='btn-primary px-4 py-2 text-sm flex items-center gap-2'>
              <Plus className='w-4 h-4'/> YENİ 1V1 ŞAMPİYONU
            </button>
          )}
          {tab === 'KARMA' && (
            <button onClick={() => setCreateKarmaModal(true)} className='btn-primary px-4 py-2 text-sm flex items-center gap-2'>
              <Plus className='w-4 h-4'/> YENİ KARMA ŞAMPİYONU
            </button>
          )}
          {tab === 'NIGHT_CUP' && (
            <button onClick={() => setCreateNightCupModal(true)} className='btn-primary px-4 py-2 text-sm flex items-center gap-2'>
              <Plus className='w-4 h-4'/> YENİ NIGHT CUP
            </button>
          )}
        </div>

        {filteredTournaments.length === 0 ? (
          <div className='py-24 text-center text-zinc-500 font-mono text-sm'>
            {tab} turnuvası bulunamadı.
          </div>
        ) : (
          filteredTournaments.map((tour: any) => {
            const tourWinners = winners.filter((w: any) => w.tournament_id === tour.id);
            const tourApps = applications.filter((a: any) => a.tournament_id === tour.id);
            const hasWinner = tourWinners.length > 0;

            return (
              <div key={tour.id} className='bg-[#0a1628] rounded-2xl border border-white/5 overflow-hidden'>
                <div className='p-6 flex items-start gap-6 border-b border-white/5'>
                  <div className='w-16 h-16 rounded-2xl bg-zinc-800 overflow-hidden shrink-0 border border-white/10'>
                    {tour.image_url ? <img src={tour.image_url} className='w-full h-full object-cover'/> : <Trophy className='w-8 h-8 text-zinc-500 m-auto mt-4'/>}
                  </div>
                  <div className='flex-1'>
                    <h3 className='text-xl font-black text-white uppercase tracking-widest'>{tour.name}</h3>
                    <p className='text-sm text-zinc-400 mt-1'>{tour.description}</p>
                    {tab === 'NIGHT_CUP' && (
                      <div className='mt-3 flex items-center gap-4 text-xs font-bold text-zinc-500'>
                        <span className={tour.is_registration_open ? 'text-emerald-400' : 'text-red-400'}>
                          BAŞVURULAR: {tour.is_registration_open ? 'AÇIK' : 'KAPALI'}
                        </span>
                        {tour.max_teams && <span>KONTENJAN: {tour.max_teams}</span>}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setConfirmModal({ action: () => handleAction(deleteTournamentAction, tour.id), title: 'Turnuvayı Sil', type: 'danger', message: 'Bu turnuvayı silmek istiyor musunuz?' })} className='p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/10'>
                    <Trash2 className='w-5 h-5'/>
                  </button>
                </div>

                {tab === '1V1' && tourWinners[0] && (
                  <div className='p-4 bg-emerald-500/5 flex items-center gap-4'>
                    <Trophy className='w-5 h-5 text-emerald-400'/>
                    <span className='text-sm font-bold text-emerald-400 uppercase tracking-widest'>ŞAMPİYON:</span>
                    <div className='flex items-center gap-2'>
                      {tourWinners[0].profiles?.avatar_url && <img src={tourWinners[0].profiles.avatar_url} className='w-6 h-6 rounded-full'/>}
                      <span className='text-white font-bold'>@{tourWinners[0].profiles?.username}</span>
                    </div>
                  </div>
                )}

                {tab === 'KARMA' && (
                  <div className='p-4 bg-emerald-500/5'>
                    <div className='flex items-center gap-4 mb-4'>
                      <Trophy className='w-5 h-5 text-emerald-400'/>
                      <span className='text-sm font-bold text-emerald-400 uppercase tracking-widest'>ŞAMPİYON KADRO (11):</span>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      {tourWinners.map((w: any) => (
                        <div key={w.id} className='px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 flex items-center gap-2'>
                          {w.profiles?.avatar_url && <img src={w.profiles.avatar_url} className='w-4 h-4 rounded-full'/>}
                          <span className='text-xs font-bold text-white'>@{w.profiles?.username}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'NIGHT_CUP' && (
                  <div className='bg-black/20'>
                    <div className='p-4 border-b border-white/5 flex justify-between items-center'>
                      <span className='text-sm font-bold text-zinc-400 uppercase tracking-widest'>BAŞVURULAR ({tourApps.length})</span>
                      <button onClick={() => setSelectedNightCup(selectedNightCup === tour.id ? null : tour.id)} className='text-xs text-cyan-400 font-bold uppercase'>
                        {selectedNightCup === tour.id ? 'GİZLE' : 'GÖSTER'}
                      </button>
                    </div>
                    
                    {hasWinner && (
                      <div className='p-4 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-4'>
                        <Trophy className='w-6 h-6 text-emerald-400'/>
                        <div>
                          <span className='text-xs font-bold text-emerald-500 uppercase tracking-widest block'>ŞAMPİYON TAKIM</span>
                          <span className='text-lg font-black text-emerald-400 uppercase tracking-widest'>{tourWinners[0].tournament_applications?.team_name}</span>
                        </div>
                      </div>
                    )}

                    {selectedNightCup === tour.id && (
                      <div className='p-4 space-y-4'>
                        {tourApps.map((app: any) => (
                          <div key={app.id} className='bg-[#0a1628] border border-white/5 rounded-xl p-4'>
                            <div className='flex justify-between items-start mb-4'>
                              <div className='flex items-center gap-4'>
                                <div className='w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden'>
                                  {app.logo_url ? <img src={app.logo_url} className='w-full h-full object-cover'/> : <Users className='w-6 h-6 text-zinc-500 m-auto mt-3'/>}
                                </div>
                                <div>
                                  <h4 className='text-lg font-black text-white uppercase'>{app.team_name}</h4>
                                  <span className='text-[10px] text-zinc-500 uppercase'>Başvuru: @{app.profiles?.username}</span>
                                </div>
                              </div>
                              <div className='flex items-center gap-2'>
                                {app.status === 'PENDING' && (
                                  <>
                                    <button onClick={() => handleAction(updateNightCupApplicationStatusAction, app.id, 'APPROVED')} className='p-2 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20' title='Onayla'><CheckCircle2 className='w-4 h-4'/></button>
                                    <button onClick={() => handleAction(updateNightCupApplicationStatusAction, app.id, 'REJECTED')} className='p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20' title='Reddet'><XCircle className='w-4 h-4'/></button>
                                  </>
                                )}
                                {app.status === 'APPROVED' && (
                                  <span className='px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-black rounded uppercase'>Onaylandı</span>
                                )}
                                {app.status === 'REJECTED' && (
                                  <span className='px-3 py-1 bg-red-500/20 text-red-400 text-xs font-black rounded uppercase'>Reddedildi</span>
                                )}
                                {app.status === 'APPROVED' && !hasWinner && (
                                  <button onClick={() => setConfirmModal({ action: () => handleAction(assignNightCupWinnerAction, tour.id, app.id), title: 'Şampiyon İlan Et', type: 'warning', message: `${app.team_name} takımını bu Night Cup'ın kazananı olarak belirlemek istiyor musunuz?` })} className='ml-2 px-3 py-1 bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 text-xs font-black rounded uppercase'>
                                    <Trophy className='w-3 h-3 inline mr-1'/> Şampiyon Yap
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className='grid grid-cols-2 md:grid-cols-4 gap-2'>
                              {app.tournament_application_players?.map((p: any, i: number) => (
                                <div key={i} className='bg-black/40 px-2 py-1.5 rounded flex items-center gap-2'>
                                  {p.profiles?.avatar_url ? <img src={p.profiles.avatar_url} className='w-4 h-4 rounded-full'/> : <User className='w-3 h-3 text-zinc-500'/>}
                                  <span className='text-[10px] font-bold text-zinc-300'>@{p.profiles?.username}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 1V1 Modal */}
      {create1V1Modal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-md rounded-2xl border border-white/10 overflow-hidden shadow-2xl'>
            <div className='p-6 border-b border-white/5 flex justify-between items-center'>
              <h3 className='text-lg font-black text-white uppercase tracking-widest'>YENİ 1V1 ŞAMPİYONU</h3>
              <button onClick={() => setCreate1V1Modal(false)} className='text-zinc-500 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleCreate1V1} className='p-6 space-y-4'>
              <div><label className='block text-xs font-bold text-zinc-400 mb-1'>KUPA ADI</label><input required name='name' type='text' className='input-field'/></div>
              <div>
                <label className='block text-xs font-bold text-zinc-400 mb-1'>SEZON</label>
                <select required name='season_id' className='input-field'>
                  <option value=''>Seçiniz</option>
                  {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className='block text-xs font-bold text-zinc-400 mb-1'>ŞAMPİYON OYUNCU</label>
                <select required name='profile_id' className='input-field'>
                  <option value=''>Seçiniz</option>
                  {profiles.map((p: any) => <option key={p.id} value={p.id}>@{p.username}</option>)}
                </select>
              </div>
              <div><label className='block text-xs font-bold text-zinc-400 mb-1'>AÇIKLAMA</label><input name='description' type='text' className='input-field'/></div>
              <div><label className='block text-xs font-bold text-zinc-400 mb-1'>GÖRSEL</label><input name='image_file' type='file' accept='image/*' className='input-field text-sm'/></div>
              <button disabled={loading} className='btn-primary w-full py-3 mt-4'>KAYDET</button>
            </form>
          </div>
        </div>
      )}

      {/* Karma Modal */}
      {createKarmaModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-2xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]'>
            <div className='p-6 border-b border-white/5 flex justify-between items-center shrink-0'>
              <h3 className='text-lg font-black text-white uppercase tracking-widest'>YENİ KARMA ŞAMPİYONU</h3>
              <button onClick={() => setCreateKarmaModal(false)} className='text-zinc-500 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleCreateKarma} className='flex-1 overflow-y-auto p-6 space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <div><label className='block text-xs font-bold text-zinc-400 mb-1'>TURNUVA ADI</label><input required name='name' type='text' className='input-field'/></div>
                <div>
                  <label className='block text-xs font-bold text-zinc-400 mb-1'>SEZON</label>
                  <select required name='season_id' className='input-field'>
                    <option value=''>Seçiniz</option>
                    {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              
              <div>
                <label className='block text-xs font-bold text-zinc-400 mb-2'>KAZANAN KADRO (11 KİŞİ SEÇİN: {karmaProfiles.length}/11)</label>
                <div className='grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-2 bg-black/20 rounded-xl border border-white/5'>
                  {profiles.map((p: any) => (
                    <div 
                      key={p.id} 
                      onClick={() => toggleKarmaProfile(p.id)}
                      className={`p-2 rounded-lg border text-sm cursor-pointer flex items-center gap-2 transition-all ${karmaProfiles.includes(p.id) ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 font-bold' : 'bg-[#060d18] border-white/5 text-zinc-400 hover:bg-white/5'}`}
                    >
                      {p.avatar_url ? <img src={p.avatar_url} className='w-5 h-5 rounded-full'/> : <User className='w-4 h-4'/>}
                      <span className='truncate'>@{p.username}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button disabled={loading || karmaProfiles.length !== 11} className='btn-primary w-full py-3 mt-4'>
                {karmaProfiles.length === 11 ? 'KAYDET' : `${11 - karmaProfiles.length} OYUNCU DAHA SEÇİN`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Night Cup Modal */}
      {createNightCupModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-md rounded-2xl border border-white/10 overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto'>
            <div className='p-6 border-b border-white/5 flex justify-between items-center shrink-0'>
              <h3 className='text-lg font-black text-white uppercase tracking-widest'>YENİ NIGHT CUP</h3>
              <button onClick={() => setCreateNightCupModal(false)} className='text-zinc-500 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleCreateNightCup} className='p-6 space-y-4'>
              <div><label className='block text-xs font-bold text-zinc-400 mb-1'>KUPA ADI</label><input required name='name' type='text' className='input-field'/></div>
              <div>
                <label className='block text-xs font-bold text-zinc-400 mb-1'>SEZON</label>
                <select required name='season_id' className='input-field'>
                  <option value=''>Seçiniz</option>
                  {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className='flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5'>
                <input type='checkbox' name='is_registration_open' value='true' id='reg_open' className='w-5 h-5 accent-cyan-500'/>
                <label htmlFor='reg_open' className='text-sm font-bold text-white uppercase tracking-widest cursor-pointer'>BAŞVURULARI AÇ</label>
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <div><label className='block text-xs font-bold text-zinc-400 mb-1'>BAŞVURU BAŞLANGIÇ</label><input name='registration_start' type='datetime-local' className='input-field text-xs'/></div>
                <div><label className='block text-xs font-bold text-zinc-400 mb-1'>BAŞVURU BİTİŞ</label><input name='registration_end' type='datetime-local' className='input-field text-xs'/></div>
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <div><label className='block text-xs font-bold text-zinc-400 mb-1'>MAÇ TARİHİ</label><input name='tournament_date' type='datetime-local' className='input-field text-xs'/></div>
                <div><label className='block text-xs font-bold text-zinc-400 mb-1'>KONTENJAN</label><input name='max_teams' type='number' placeholder='Sınırsız' className='input-field'/></div>
              </div>
              <div><label className='block text-xs font-bold text-zinc-400 mb-1'>AÇIKLAMA</label><input name='description' type='text' className='input-field'/></div>
              <div><label className='block text-xs font-bold text-zinc-400 mb-1'>GÖRSEL</label><input name='image_file' type='file' accept='image/*' className='input-field text-sm'/></div>
              <button disabled={loading} className='btn-primary w-full py-3 mt-4'>KAYDET</button>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden shadow-2xl'>
            <div className='p-6'>
              <h3 className={`text-lg font-black uppercase tracking-widest mb-2 ${confirmModal.type === 'danger' ? 'text-red-500' : 'text-amber-500'}`}>
                {confirmModal.title}
              </h3>
              <p className='text-sm text-zinc-400 mb-6'>{confirmModal.message}</p>
              <div className='flex gap-3'>
                <button disabled={loading} onClick={() => setConfirmModal({ isOpen: false })} className='flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm transition-colors'>İPTAL</button>
                <button disabled={loading} onClick={confirmModal.action} className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-black transition-colors ${confirmModal.type === 'danger' ? 'bg-red-500 hover:bg-red-400' : 'bg-amber-500 hover:bg-amber-400'}`}>
                  {loading ? <Loader2 className='w-4 h-4 animate-spin mx-auto'/> : 'ONAYLA'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

