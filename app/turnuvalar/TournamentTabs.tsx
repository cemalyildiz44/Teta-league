
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trophy, Medal, User, Users, Calendar, ShieldAlert, X, Loader2, Info, Image as ImageIcon, AlertCircle } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { submitNightCupApplicationAction } from './actions';
import TeamLogo from '@/components/TeamLogo';
import { formatTournamentDate } from '@/lib/date-utils';

export default function TournamentTabs({
  tournaments, winners, applications, profiles, currentUser
}: any) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'NIGHT_CUP' | '1V1' | 'KARMA'>('NIGHT_CUP');
  const filteredTournaments = tournaments.filter((t: any) => t.type === activeTab);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const [applyModal, setApplyModal] = useState<any>(null);
  const [teamName, setTeamName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [ncProfiles, setNcProfiles] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  useEffect(() => {
    return () => {
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  const handleOpenApplyModal = (tour: any) => {
    setApplyModal(tour);
    setTeamName('');
    setLogoFile(null);
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
      setLogoPreview(null);
    }
    setLogoError(null);
    setModalError(null);
    setNcProfiles([]);
    setSearchTerm('');
  };

  const handleCloseModal = () => {
    if (loading || isCompressing) return;
    setApplyModal(null);
    setTeamName('');
    setLogoFile(null);
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
      setLogoPreview(null);
    }
    setLogoError(null);
    setModalError(null);
    setNcProfiles([]);
    setSearchTerm('');
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoError(null);
    setModalError(null);

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/pjpeg', 'image/x-png', 'image/heic', 'image/heif'];
    const validExts = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (!validTypes.includes(file.type) && !validExts.includes(ext) && !file.type.startsWith('image/')) {
      setLogoError('Yalnızca JPEG, PNG veya WEBP formatında logo yükleyebilirsiniz.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setLogoError('Görsel boyutu çok yüksek (maksimum 25MB).');
      return;
    }

    try {
      setIsCompressing(true);

      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
        fileType: 'image/webp' as const,
        initialQuality: 0.85,
      };

      let processedFile: File;
      try {
        const compressedBlob = await imageCompression(file, options);
        processedFile = new File([compressedBlob], `logo_${Date.now()}.webp`, {
          type: 'image/webp',
        });
      } catch (compErr) {
        console.warn('Görsel sıkıştırma atlandı/başarısız oldu:', compErr);
        if (file.size > 5 * 1024 * 1024) {
          throw new Error('Görsel sıkıştırılamadı ve 5MB sınırından büyük.');
        }
        processedFile = file;
      }

      setLogoFile(processedFile);
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
      const preview = URL.createObjectURL(processedFile);
      setLogoPreview(preview);
    } catch (err: any) {
      setLogoError(err?.message || 'Görsel işlenirken bir hata oluştu.');
      setLogoFile(null);
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
        setLogoPreview(null);
      }
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
      setLogoPreview(null);
    }
    setLogoError(null);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCompressing) {
      setModalError('Lütfen logonun optimize edilmesinin tamamlanmasını bekleyin.');
      return;
    }

    const trimmedName = teamName.trim();
    if (!trimmedName) {
      setModalError('Takım adı zorunludur.');
      return;
    }

    if (trimmedName.length < 2 || trimmedName.length > 60) {
      setModalError('Takım adı 2 ile 60 karakter arasında olmalıdır.');
      return;
    }

    setLoading(true);
    setModalError(null);

    const formData = new FormData();
    formData.append('tournament_id', applyModal.id);
    formData.append('team_name', trimmedName);
    formData.append('profiles', JSON.stringify(ncProfiles));
    if (logoFile) {
      formData.append('image_file', logoFile);
    }

    try {
      const res = await submitNightCupApplicationAction(formData);
      setLoading(false);

      if (res.error) {
        setModalError(res.error);
        showFeedback(res.error, 'error');
        // Takım adı, kadro ve logo önizlemesi ASLA sıfırlanmaz
      } else {
        showFeedback(res.success || 'Başvurunuz başarıyla kaydedildi.', 'success');
        handleCloseModal();
        router.refresh();
      }
    } catch (err: any) {
      setLoading(false);
      const msg = err?.message || 'Başvuru gönderilirken bir hata oluştu.';
      setModalError(msg);
      showFeedback(msg, 'error');
    }
  };

  const toggleNcProfile = (id: string) => {
    if (ncProfiles.includes(id)) {
      setNcProfiles(ncProfiles.filter(p => p !== id));
    } else {
      if (ncProfiles.length >= 20) return showFeedback('En fazla 20 oyuncu seçebilirsiniz.', 'error');
      setNcProfiles([...ncProfiles, id]);
    }
  };

  const searchProfiles = profiles.filter((p: any) => p.username.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 20);

  return (
    <div className='w-full relative'>
      {feedback && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-black uppercase tracking-widest ${feedback.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-[#00e5ff] text-black'}`}>
          <Info className='w-5 h-5'/> {feedback.msg}
        </div>
      )}

      {/* TABS HEADER */}
      <div className='flex flex-wrap items-center justify-center gap-4 md:gap-8 mb-12 border-b border-white/5 pb-1'>
        {['NIGHT_CUP', '1V1', 'KARMA'].map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t as any)}
            className={`relative px-6 py-4 text-[13px] md:text-[15px] font-[900] tracking-[0.2em] uppercase transition-all duration-300 ${
              activeTab === t ? 'text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.replace('_', ' ')}
            {activeTab === t && (
              <span className='absolute bottom-0 left-0 right-0 h-[2px] bg-[#00e5ff] shadow-[0_0_12px_rgba(0,229,255,1)]' />
            )}
          </button>
        ))}
      </div>

      {filteredTournaments.length === 0 ? (
        <div className='text-center py-24'>
          <Trophy className='w-16 h-16 text-white/5 mx-auto mb-6' />
          <p className='text-zinc-500 font-bold uppercase tracking-widest'>BU KATEGORİDE HENÜZ TURNUVA BULUNMUYOR.</p>
        </div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {filteredTournaments.map((tour: any) => {
            const tWinners = winners.filter((w: any) => w.tournament_id === tour.id);
            const hasWinner = tWinners.length > 0;
            const tApps = applications.filter((a: any) => a.tournament_id === tour.id);
            const approvedApps = tApps.filter((a: any) => a.status === 'APPROVED');
            const userApp = currentUser ? tApps.find((a: any) => a.applicant_id === currentUser.id) : null;

            let isOpen = tour.is_registration_open !== false;
            const now = new Date();
            if (tour.status && tour.status !== 'REGISTRATION') isOpen = false;
            if (tour.registration_start && new Date(tour.registration_start) > now) isOpen = false;
            if (tour.registration_end && new Date(tour.registration_end) < now) isOpen = false;
            if (tour.max_teams && approvedApps.length >= tour.max_teams) isOpen = false;

            return (
              <div key={tour.id} className='relative group h-full'>
                <div className='absolute inset-0 bg-gradient-to-b from-[#00e5ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[2rem]' />
                <div className='relative bg-[#060d18]/80 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 hover:border-[#00e5ff]/20 transition-colors h-full flex flex-col'>

                  {/* Header */}
                  <div className='flex items-center gap-5 mb-6'>
                    <div className='w-20 h-20 rounded-2xl bg-black/50 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden shadow-inner'>
                      {tour.banner_url || tour.image_url ? (
                        <img src={tour.banner_url || tour.image_url} alt={tour.name} className='w-full h-full object-cover' />
                      ) : (
                        <Trophy className='w-8 h-8 text-[#00e5ff]/50' />
                      )}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2 mb-2 flex-wrap'>
                        <span className='px-2.5 py-1 rounded bg-white/5 text-xs font-bold text-[#00e5ff] uppercase tracking-widest block w-max'>
                          {tour.seasons?.name || 'Sezon'}
                        </span>
                        {tour.prize && (
                          <span className='px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-wider'>
                            🏆 {tour.prize}
                          </span>
                        )}
                      </div>
                      <h3 className='text-lg font-black text-white uppercase tracking-wider leading-tight truncate'>
                        {tour.name}
                      </h3>
                    </div>
                  </div>

                  {tour.description && (
                    <p className='text-sm text-zinc-400 mb-6 line-clamp-3 leading-relaxed'>{tour.description}</p>
                  )}

                  {/* 1V1 Winner */}
                  {activeTab === '1V1' && hasWinner && (
                    <div className='mt-auto pt-6 border-t border-white/5'>
                      <div className='flex items-center gap-2 mb-3'>
                        <Medal className='w-4 h-4 text-yellow-500' />
                        <span className='text-xs font-black text-yellow-500 uppercase tracking-widest'>ŞAMPİYON</span>
                      </div>
                      <Link href={`/oyuncular/${tWinners[0].profiles?.username}`} className='flex items-center gap-3 p-3 rounded-xl bg-yellow-500/5 hover:bg-yellow-500/10 border border-yellow-500/10 transition-colors'>
                        {tWinners[0].profiles?.avatar_url ? (
                          <img src={tWinners[0].profiles.avatar_url} className='w-10 h-10 rounded-full' />
                        ) : (
                          <User className='w-10 h-10 text-zinc-500 p-2 bg-black/40 rounded-full' />
                        )}
                        <span className='font-black text-white uppercase'>@{tWinners[0].profiles?.username}</span>
                      </Link>
                    </div>
                  )}

                  {/* KARMA Winner */}
                  {activeTab === 'KARMA' && hasWinner && (
                    <div className='mt-auto pt-6 border-t border-white/5'>
                      <div className='flex items-center gap-2 mb-4'>
                        <Medal className='w-4 h-4 text-[#00e5ff]' />
                        <span className='text-xs font-black text-[#00e5ff] uppercase tracking-widest'>ŞAMPİYON KADRO (11)</span>
                      </div>
                      <div className='grid grid-cols-2 gap-2'>
                        {tWinners.map((w: any) => (
                          <Link key={w.id} href={`/oyuncular/${w.profiles?.username}`} className='flex items-center gap-2 p-2 rounded-lg bg-black/20 hover:bg-[#00e5ff]/10 border border-white/5 hover:border-[#00e5ff]/20 transition-colors'>
                            {w.profiles?.avatar_url ? <img src={w.profiles.avatar_url} className='w-5 h-5 rounded-full' /> : <User className='w-5 h-5 p-1 bg-zinc-800 rounded-full text-zinc-400'/>}
                            <span className='text-[10px] font-bold text-zinc-300 truncate'>@{w.profiles?.username}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* NIGHT CUP Details */}
                  {activeTab === 'NIGHT_CUP' && (
                    <div className='mt-auto pt-6 border-t border-white/5 space-y-4'>

                      {hasWinner ? (
                        <div>
                           <div className='flex items-center gap-2 mb-3'>
                            <Medal className='w-4 h-4 text-emerald-400' />
                            <span className='text-xs font-black text-emerald-400 uppercase tracking-widest'>NIGHT CUP ŞAMPİYONU</span>
                          </div>
                          <div className='flex items-center gap-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20'>
                            <TeamLogo src={tWinners[0].tournament_applications?.logo_url} name={tWinners[0].tournament_applications?.team_name} size="md" className="w-12 h-12" />
                            <span className='font-black text-lg text-emerald-400 uppercase'>{tWinners[0].tournament_applications?.team_name}</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className='grid grid-cols-2 gap-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500'>
                            <div>
                              <span className='mb-1 text-zinc-600 flex items-center gap-1'><Calendar className='w-3 h-3'/> Başvuru Bitiş</span>
                              <span className='text-zinc-300'>{formatTournamentDate(tour.registration_end, { dateStyle: 'short', timeStyle: 'short' })}</span>
                            </div>
                            <div>
                              <span className='mb-1 text-zinc-600 flex items-center gap-1'><Trophy className='w-3 h-3'/> Turnuva Tarihi</span>
                              <span className='text-zinc-300'>{formatTournamentDate(tour.tournament_date, { dateStyle: 'short', timeStyle: 'short' })}</span>
                            </div>
                          </div>

                          <div className='flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5'>
                            <div>
                              <span className='block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1'>KONTENJAN</span>
                              <span className='text-sm font-black text-white'>
                                {approvedApps.length} / {tour.max_teams || '∞'} Onaylı Takım
                              </span>
                              {tApps.length > approvedApps.length && (
                                <span className='block text-[9px] text-zinc-500 font-semibold'>({tApps.length} toplam başvuru)</span>
                              )}
                            </div>
                            <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest ${isOpen ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                              {isOpen ? 'KAYIT AÇIK' : 'KAYIT KAPALI'}
                            </span>
                          </div>

                          {userApp && (
                            <div className='p-3 text-center rounded-xl bg-cyan-500/10 border border-cyan-500/20'>
                              <div className='flex items-center justify-between'>
                                <span className='text-[10px] font-bold text-zinc-400 uppercase tracking-widest'>BAŞVURU DURUMU</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                  userApp.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' :
                                  userApp.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {userApp.status === 'APPROVED' ? 'ONAYLANDI' : userApp.status === 'REJECTED' ? 'REDDEDİLDİ' : 'BEKLEMEDE'}
                                </span>
                              </div>
                            </div>
                          )}

                          <div className='grid grid-cols-2 gap-2 pt-2'>
                            <Link
                              href={`/turnuvalar/${tour.id}`}
                              className='py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black uppercase tracking-widest text-xs text-center transition-all flex items-center justify-center'
                            >
                              Detayları İncele
                            </Link>

                            {userApp ? (
                              <Link
                                href={`/turnuvalar/${tour.id}`}
                                className='py-3 rounded-xl bg-[#00e5ff]/20 hover:bg-[#00e5ff]/30 border border-[#00e5ff]/30 text-[#00e5ff] font-black uppercase tracking-widest text-xs text-center transition-all flex items-center justify-center'
                              >
                                Başvurumu Gör
                              </Link>
                            ) : (
                              <button
                                onClick={() => {
                                  if (!currentUser) router.push(`/giris?redirectTo=${encodeURIComponent('/turnuvalar/' + tour.id)}`);
                                  else handleOpenApplyModal(tour);
                                }}
                                disabled={!isOpen}
                                className='py-3 rounded-xl bg-[#00e5ff] text-black font-black uppercase tracking-widest text-xs hover:bg-[#00c5ff] hover:shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all disabled:opacity-50 disabled:pointer-events-none'
                              >
                                Katıl
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* 1V1 / KARMA Details Link */}
                  {activeTab !== 'NIGHT_CUP' && (
                    <div className='mt-auto pt-4 border-t border-white/5'>
                      <Link
                        href={`/turnuvalar/${tour.id}`}
                        className='w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-400 hover:text-white font-bold uppercase tracking-wider text-xs text-center block transition-all'
                      >
                        Detayları İncele
                      </Link>
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Application Modal */}
      {applyModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md'>
          <div className='bg-[#0a1628] w-full max-w-3xl rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[95vh]'>
            <div className='p-6 md:p-8 border-b border-white/5 flex justify-between items-center shrink-0'>
              <div>
                <span className='text-[#00e5ff] text-[10px] font-black tracking-widest uppercase mb-1 block'>NIGHT CUP BAŞVURUSU</span>
                <h3 className='text-xl md:text-2xl font-black text-white uppercase tracking-widest'>{applyModal.name}</h3>
              </div>
              <button
                type='button'
                onClick={handleCloseModal}
                disabled={loading || isCompressing}
                className='w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50'
              >
                <X className='w-5 h-5'/>
              </button>
            </div>

            <form onSubmit={handleApply} className='flex-1 overflow-y-auto p-6 md:p-8 space-y-6'>

              {/* Modal Error Alert Banner */}
              {modalError && (
                <div className='p-4 rounded-xl bg-red-500/15 border border-red-500/40 text-red-400 text-xs font-bold flex items-center gap-3'>
                  <ShieldAlert className='w-5 h-5 shrink-0 text-red-400' />
                  <span className='flex-1 leading-relaxed'>{modalError}</span>
                </div>
              )}

              <div className='grid md:grid-cols-2 gap-8'>
                <div className='space-y-4'>
                  <div>
                    <label className='block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2'>
                      TAKIM ADI <span className='text-red-500'>*</span>
                    </label>
                    <input
                      required
                      type='text'
                      value={teamName}
                      onChange={(e) => {
                        setTeamName(e.target.value);
                        if (modalError) setModalError(null);
                      }}
                      placeholder='Takımınızın Adı'
                      maxLength={60}
                      className='w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-bold placeholder:text-zinc-700 focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] outline-none transition-all'
                    />
                  </div>
                  <div>
                    <div className='flex items-center justify-between mb-2'>
                      <label className='block text-xs font-bold text-zinc-500 uppercase tracking-widest'>
                        TAKIM LOGOSU (İsteğe Bağlı)
                      </label>
                      <span className='text-[10px] text-zinc-500 font-bold uppercase'>Max 5MB</span>
                    </div>

                    {logoPreview ? (
                      <div className='relative flex items-center gap-4 p-4 rounded-xl border border-[#00e5ff]/30 bg-black/60'>
                        <div className='w-16 h-16 rounded-xl bg-black border border-white/10 overflow-hidden shrink-0 flex items-center justify-center shadow-inner'>
                          <img src={logoPreview} alt="Takım Logosu Önizleme" className='w-full h-full object-cover' />
                        </div>
                        <div className='flex-1 min-w-0'>
                          <span className='text-xs font-black text-white block truncate uppercase tracking-wider'>
                            {logoFile?.name || 'logo.webp'}
                          </span>
                          <span className='text-[10px] text-[#00e5ff] font-bold block mt-0.5'>
                            {logoFile ? `${Math.round(logoFile.size / 1024)} KB (Optimize Edildi)` : 'Görsel Hazır'}
                          </span>
                        </div>
                        <button
                          type='button'
                          onClick={handleRemoveLogo}
                          disabled={loading || isCompressing}
                          className='p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-colors'
                          title='Logoyu Kaldır'
                        >
                          <X className='w-4 h-4' />
                        </button>
                      </div>
                    ) : (
                      <div className='relative overflow-hidden group rounded-xl border border-dashed border-white/20 hover:border-[#00e5ff]/50 transition-colors bg-black/50'>
                        <input
                          type='file'
                          accept='image/jpeg,image/png,image/webp,image/jpg'
                          onChange={handleLogoChange}
                          disabled={loading || isCompressing}
                          className='absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed'
                        />
                        <div className='p-6 text-center'>
                          {isCompressing ? (
                            <>
                              <Loader2 className='w-8 h-8 text-[#00e5ff] mx-auto mb-2 animate-spin' />
                              <span className='text-xs font-bold text-[#00e5ff] uppercase tracking-widest block'>Logo Optimize Ediliyor...</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon className='w-8 h-8 text-zinc-600 mx-auto mb-2 group-hover:text-[#00e5ff] transition-colors'/>
                              <span className='text-xs font-bold text-zinc-400 uppercase tracking-widest block'>Logo Seç (JPEG, PNG, WEBP)</span>
                              <span className='text-[10px] text-zinc-600 block mt-1'>Otomatik optimize edilir (Max 5MB)</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {logoError && (
                      <p className='text-[11px] text-red-400 font-bold mt-2 flex items-center gap-1.5'>
                        <AlertCircle className='w-3.5 h-3.5 shrink-0' /> {logoError}
                      </p>
                    )}
                  </div>
                </div>

                <div className='space-y-4'>
                  <div>
                    <div className='flex items-center justify-between mb-2'>
                      <label className='block text-xs font-bold text-zinc-500 uppercase tracking-widest'>KADRO OLUŞTUR ({ncProfiles.length} Seçili)</label>
                      <span className='text-[10px] text-zinc-500 font-bold uppercase'>İsteğe Bağlı</span>
                    </div>
                    <p className='text-[11px] text-zinc-500 mb-2'>Başvuran olarak otomatik takım temsilcisisiniz. Kadronuza eklemek istediğiniz oyuncuları arayıp ekleyebilirsiniz.</p>
                    <input
                      type='text'
                      placeholder='Oyuncu Ara...'
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className='w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-bold placeholder:text-zinc-700 focus:border-[#00e5ff] outline-none transition-all mb-2'
                    />
                    <div className='h-48 overflow-y-auto bg-black/30 rounded-xl border border-white/5 p-2 grid grid-cols-2 gap-2 content-start'>
                      {searchProfiles.map((p: any) => (
                        <div
                          key={p.id}
                          onClick={() => toggleNcProfile(p.id)}
                          className={`p-2 rounded-lg border text-[11px] cursor-pointer flex items-center gap-2 transition-all ${ncProfiles.includes(p.id) ? 'bg-[#00e5ff]/20 border-[#00e5ff]/50 text-[#00e5ff] font-black' : 'bg-white/5 border-transparent text-zinc-400 font-bold hover:bg-white/10'}`}
                        >
                          {p.avatar_url ? <img src={p.avatar_url} className='w-5 h-5 rounded-full'/> : <User className='w-5 h-5 p-1 bg-black/50 rounded-full'/>}
                          <span className='truncate'>@{p.username}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className='pt-6 border-t border-white/5'>
                <button
                  type='submit'
                  disabled={loading || isCompressing}
                  className='w-full py-4 rounded-xl bg-[#00e5ff] text-black font-black uppercase tracking-widest text-sm hover:bg-[#00c5ff] hover:shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2'
                >
                  {loading ? (
                    <>
                      <Loader2 className='w-5 h-5 animate-spin'/>
                      <span>KAYDEDİLİYOR...</span>
                    </>
                  ) : (
                    'BAŞVURUYU TAMAMLA'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

