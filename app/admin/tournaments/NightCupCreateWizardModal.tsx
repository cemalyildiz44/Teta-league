'use client';

import { useState, useEffect, useId } from 'react';
import {
  X,
  Trophy,
  Calendar,
  Clock,
  Users,
  Layers,
  FileText,
  Eye,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Upload,
  Trash2,
  Image as ImageIcon,
  AlertCircle,
  HelpCircle,
  Check,
  Edit2,
  Sparkles,
  Link as LinkIcon,
  Shield,
  Award
} from 'lucide-react';
import { createNightCupAction } from './actions';
import { formatTournamentDate, parseToTurkeyISO } from '@/lib/date-utils';

interface NightCupCreateWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  seasons: Array<{ id: string; name: string; is_active?: boolean }>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

interface FormState {
  // Step 1: Genel Bilgiler
  name: string;
  season_id: string;
  prize: string;
  discord_url: string;
  image_file: File | null;
  imagePreviewUrl: string | null;

  // Step 2: Başvuru & Tarihler
  status: 'REGISTRATION' | 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
  is_registration_open: boolean;
  registration_start: string;
  registration_end: string;
  tournament_date: string;
  is_unlimited_teams: boolean;
  max_teams: string;

  // Step 3: Turnuva Formatı
  teams_per_group: number;
  advancing_teams_per_group: number;

  // Step 4: Kurallar & Rehber
  description: string;
  rules: string;
  details: string;
}

const STEPS = [
  { id: 1, title: 'Genel Bilgiler', shortTitle: 'Genel', icon: Trophy },
  { id: 2, title: 'Başvuru & Tarihler', shortTitle: 'Tarihler', icon: Calendar },
  { id: 3, title: 'Turnuva Formatı', shortTitle: 'Format', icon: Layers },
  { id: 4, title: 'Kurallar & Açıklama', shortTitle: 'Kurallar', icon: FileText },
  { id: 5, title: 'Ön İzleme & Onay', shortTitle: 'Ön İzleme', icon: Eye },
] as const;

export default function NightCupCreateWizardModal({
  isOpen,
  onClose,
  seasons,
  onSuccess,
  onError,
}: NightCupCreateWizardModalProps) {
  const fileInputId = useId();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Initial active season or first season
  const defaultSeasonId = seasons.find((s) => s.is_active)?.id || seasons[0]?.id || '';

  const [formData, setFormData] = useState<FormState>({
    name: '',
    season_id: defaultSeasonId,
    prize: '',
    discord_url: '',
    image_file: null,
    imagePreviewUrl: null,

    status: 'REGISTRATION',
    is_registration_open: true,
    registration_start: '',
    registration_end: '',
    tournament_date: '',
    is_unlimited_teams: false,
    max_teams: '16',

    teams_per_group: 4,
    advancing_teams_per_group: 2,

    description: '',
    rules: '',
    details: '',
  });

  // Clean up blob URL on unmount or replacement
  useEffect(() => {
    return () => {
      if (formData.imagePreviewUrl) {
        URL.revokeObjectURL(formData.imagePreviewUrl);
      }
    };
  }, [formData.imagePreviewUrl]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, image_file: 'Görsel boyutu en fazla 5MB olabilir.' }));
      return;
    }

    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, image_file: 'Lütfen geçerli bir görsel dosyası seçin (PNG, JPG, WebP).' }));
      return;
    }

    if (formData.imagePreviewUrl) {
      URL.revokeObjectURL(formData.imagePreviewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setFormData((prev) => ({
      ...prev,
      image_file: file,
      imagePreviewUrl: previewUrl,
    }));
    setErrors((prev) => {
      const rest = { ...prev };
      delete rest.image_file;
      return rest;
    });
  };

  const removeFile = () => {
    if (formData.imagePreviewUrl) {
      URL.revokeObjectURL(formData.imagePreviewUrl);
    }
    setFormData((prev) => ({
      ...prev,
      image_file: null,
      imagePreviewUrl: null,
    }));
    setErrors((prev) => {
      const rest = { ...prev };
      delete rest.image_file;
      return rest;
    });
  };

  // Step validation
  const validateStep = (stepNumber: number): boolean => {
    const stepErrors: { [key: string]: string } = {};

    if (stepNumber === 1) {
      if (!formData.name.trim()) {
        stepErrors.name = 'Turnuva adı zorunludur.';
      } else if (formData.name.trim().length < 3) {
        stepErrors.name = 'Turnuva adı en az 3 karakter olmalıdır.';
      }

      if (!formData.season_id) {
        stepErrors.season_id = 'Lütfen bir sezon seçin.';
      }

      if (formData.discord_url && !formData.discord_url.startsWith('http')) {
        stepErrors.discord_url = 'Geçerli bir URL giriniz (örn: https://discord.gg/...).';
      }
    }

    if (stepNumber === 2) {
      if (formData.registration_start && formData.registration_end) {
        const startIso = parseToTurkeyISO(formData.registration_start);
        const endIso = parseToTurkeyISO(formData.registration_end);
        if (startIso && endIso && new Date(endIso).getTime() <= new Date(startIso).getTime()) {
          stepErrors.registration_end = 'Başvuru bitiş tarihi, başlangıç tarihinden sonra olmalıdır.';
        }
      }

      if (!formData.is_unlimited_teams) {
        const teamsNum = parseInt(formData.max_teams, 10);
        if (isNaN(teamsNum) || teamsNum < 2) {
          stepErrors.max_teams = 'Kontenjan en az 2 takım olmalı veya "Kontenjan sınırı yok" seçilmelidir.';
        }
      }
    }

    if (stepNumber === 3) {
      if (formData.teams_per_group < 2 || formData.teams_per_group > 16) {
        stepErrors.teams_per_group = 'Grup başına takım sayısı 2 ile 16 arasında olmalıdır.';
      }
      if (formData.advancing_teams_per_group < 1) {
        stepErrors.advancing_teams_per_group = 'Eleme turuna en az 1 takım çıkmalıdır.';
      } else if (formData.advancing_teams_per_group >= formData.teams_per_group) {
        stepErrors.advancing_teams_per_group = `Eleme turuna çıkan takım sayısı grup takım sayısından (${formData.teams_per_group}) az olmalıdır.`;
      }
    }

    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 5));
    }
  };

  const handlePrev = () => {
    setErrors({});
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const jumpToStep = (targetStep: number) => {
    if (targetStep < currentStep) {
      setErrors({});
      setCurrentStep(targetStep);
    } else if (targetStep > currentStep) {
      // Validate current step before advancing
      if (validateStep(currentStep)) {
        setCurrentStep(targetStep);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Validate all steps before submitting
    for (let s = 1; s <= 4; s++) {
      if (!validateStep(s)) {
        setCurrentStep(s);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('name', formData.name.trim());
      payload.append('season_id', formData.season_id);
      payload.append('status', formData.status);
      payload.append('prize', formData.prize.trim());
      payload.append('discord_url', formData.discord_url.trim());
      payload.append('is_registration_open', formData.is_registration_open ? 'true' : 'false');
      payload.append('registration_start', formData.registration_start);
      payload.append('registration_end', formData.registration_end);
      payload.append('tournament_date', formData.tournament_date);

      if (formData.is_unlimited_teams || !formData.max_teams.trim()) {
        payload.append('max_teams', '');
      } else {
        payload.append('max_teams', formData.max_teams.trim());
      }

      payload.append('teams_per_group', String(formData.teams_per_group));
      payload.append('advancing_teams_per_group', String(formData.advancing_teams_per_group));
      payload.append('description', formData.description.trim());
      payload.append('rules', formData.rules.trim());
      payload.append('details', formData.details.trim());

      if (formData.image_file) {
        payload.append('image_file', formData.image_file);
      }

      const res = await createNightCupAction(payload);
      if (res.error) {
        onError(res.error);
      } else {
        onSuccess(res.success || 'Night Cup turnuvası başarıyla oluşturuldu.');
        onClose();
      }
    } catch (err: any) {
      onError('Beklenmeyen bir hata oluştu: ' + (err?.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  // Helper date format for preview
  const formatDateTimeDisplay = (val: string) => {
    if (!val) return 'Belirtilmedi';
    return formatTournamentDate(parseToTurkeyISO(val) || val);
  };

  const selectedSeasonName = seasons.find((s) => s.id === formData.season_id)?.name || 'Sezon Seçilmedi';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#081220] border border-cyan-500/30 rounded-2xl md:rounded-3xl shadow-2xl shadow-cyan-950/40 flex flex-col max-h-[92vh] overflow-hidden my-auto animate-fade-in-up">
        {/* ================= HEADER ================= */}
        <div className="p-5 sm:p-6 border-b border-white/10 bg-gradient-to-r from-[#0a182c] via-[#081220] to-[#0a182c] shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-[#00e5ff] shadow-lg shadow-cyan-500/10 shrink-0">
                <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#00e5ff]">
                    TURNUVA YÖNETİMİ
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Sihirbaz Modu
                  </span>
                </div>
                <h2 className="text-base sm:text-xl font-black text-white uppercase tracking-wider">
                  YENİ NIGHT CUP OLUŞTUR
                </h2>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={submitting}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
              title="Kapat"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          {/* Stepper Navigation (Desktop) */}
          <div className="hidden sm:grid grid-cols-5 gap-2 mt-6 pt-4 border-t border-white/5">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isPassed = currentStep > step.id;
              const isCurrent = currentStep === step.id;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => jumpToStep(step.id)}
                  disabled={submitting}
                  className={`flex items-center gap-2.5 p-2 rounded-xl text-left transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-cyan-500/15 border border-cyan-500/50 text-white shadow-sm shadow-cyan-500/10'
                      : isPassed
                      ? 'bg-white/[0.03] border border-emerald-500/30 text-emerald-400 hover:bg-white/[0.06]'
                      : 'bg-white/[0.01] border border-white/5 text-zinc-500 hover:text-zinc-400'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 transition-colors ${
                      isCurrent
                        ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
                        : isPassed
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {isPassed ? <Check className="w-3.5 h-3.5" /> : step.id}
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[11px] font-black tracking-tight truncate leading-tight">
                      {step.title}
                    </span>
                    <span className="block text-[9px] uppercase tracking-wider text-zinc-400">
                      Adım {step.id}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Stepper (Mobile) */}
          <div className="sm:hidden mt-4 pt-3 border-t border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-[#00e5ff] uppercase tracking-wider flex items-center gap-1.5">
                Adım {currentStep} / 5: {STEPS[currentStep - 1].title}
              </span>
              <span className="text-zinc-500 text-[10px]">
                {Math.round((currentStep / 5) * 100)}%
              </span>
            </div>
            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-500 to-[#00e5ff] h-full transition-all duration-300"
                style={{ width: `${(currentStep / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* ================= STEP CONTENT (Scrollable) ================= */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-7 md:p-8 space-y-6">

          {/* ---------------- ADIM 1: GENEL BİLGİLER ---------------- */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="border-b border-white/5 pb-3">
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#00e5ff]" /> 1. Adım: Genel Turnuva Bilgileri
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Turnuvanın temel kimliğini, ait olduğu sezonu ve ödül bilgilerini tanımlayın.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Turnuva Adı */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-300 mb-2">
                    Turnuva Adı <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    placeholder="Örn: TETA Night Cup #1 - Kış Turnuvası"
                    className={`w-full bg-[#050b14] border rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-all ${
                      errors.name ? 'border-red-500/80 focus:border-red-500' : 'border-white/10 focus:border-cyan-500/80'
                    }`}
                  />
                  {errors.name ? (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.name}
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Turnuva fikstüründe ve listelerde görünecek resmî isim.
                    </p>
                  )}
                </div>

                {/* Sezon Seçimi */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-300 mb-2">
                    Bağlı Olduğu Sezon <span className="text-red-400">*</span>
                  </label>
                  <select
                    required
                    value={formData.season_id}
                    onChange={(e) => {
                      setFormData({ ...formData, season_id: e.target.value });
                      if (errors.season_id) setErrors((prev) => ({ ...prev, season_id: '' }));
                    }}
                    className={`w-full bg-[#050b14] border rounded-xl px-4 py-3 text-sm text-white outline-none transition-all ${
                      errors.season_id ? 'border-red-500/80 focus:border-red-500' : 'border-white/10 focus:border-cyan-500/80'
                    }`}
                  >
                    <option value="">Sezon Seçiniz</option>
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.is_active ? '(Aktif Sezon)' : ''}
                      </option>
                    ))}
                  </select>
                  {errors.season_id ? (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.season_id}
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Turnuvanın dahil edileceği lig takvim sezonu.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Turnuva Ödülü */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-300 mb-2">
                    Turnuva Ödülü / Kupası
                  </label>
                  <div className="relative">
                    <Award className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />
                    <input
                      type="text"
                      value={formData.prize}
                      onChange={(e) => setFormData({ ...formData, prize: e.target.value })}
                      placeholder="Örn: 5.000 TL Nakit + Şampiyonluk Rozeti"
                      className="w-full bg-[#050b14] border border-white/10 focus:border-cyan-500/80 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Turnuva kartında ve detay sayfasında vurgulu olarak gösterilir.
                  </p>
                </div>

                {/* Discord / İletişim Linki */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-300 mb-2">
                    Discord / İletişim Bağlantısı
                  </label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
                    <input
                      type="url"
                      value={formData.discord_url}
                      onChange={(e) => {
                        setFormData({ ...formData, discord_url: e.target.value });
                        if (errors.discord_url) setErrors((prev) => ({ ...prev, discord_url: '' }));
                      }}
                      placeholder="https://discord.gg/tetaleague"
                      className={`w-full bg-[#050b14] border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-all ${
                        errors.discord_url ? 'border-red-500/80 focus:border-red-500' : 'border-white/10 focus:border-cyan-500/80'
                      }`}
                    />
                  </div>
                  {errors.discord_url ? (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.discord_url}
                    </p>
                  ) : (
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Kaptanların maç koordinasyonu ve kurallar için katılacağı sunucu linki.
                    </p>
                  )}
                </div>
              </div>

              {/* Afiş / Kapak Görseli Yükleme */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-300 mb-2">
                  Afiş / Kapak Görseli (Maksimum 5MB)
                </label>
                {formData.imagePreviewUrl ? (
                  <div className="p-4 rounded-2xl bg-black/40 border border-cyan-500/30 flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative w-28 h-20 sm:w-36 sm:h-24 rounded-xl overflow-hidden border border-white/15 bg-black shrink-0 shadow-md">
                      <img
                        src={formData.imagePreviewUrl}
                        alt="Ön İzleme"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 text-center sm:text-left min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {formData.image_file?.name || 'Seçilen Görsel'}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {formData.image_file
                          ? `${(formData.image_file.size / (1024 * 1024)).toFixed(2)} MB`
                          : 'Önizleme hazır'}
                      </p>
                      <span className="inline-block mt-1 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Yüklenmeye Hazır
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={removeFile}
                      className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" /> Kaldır
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor={fileInputId}
                    className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                      errors.image_file
                        ? 'border-red-500/50 bg-red-500/5'
                        : 'border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/5 bg-[#050b14]'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[#00e5ff] mb-3">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-white block">
                      Görsel seçmek veya yüklemek için tıklayın
                    </span>
                    <span className="text-[11px] text-zinc-500 block mt-1">
                      PNG, JPG veya WebP • Maks. 5 MB dosya boyutu
                    </span>
                    <input
                      id={fileInputId}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                )}
                {errors.image_file && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.image_file}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ---------------- ADIM 2: BAŞVURU VE TARİHLER ---------------- */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="border-b border-white/5 pb-3">
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#00e5ff]" /> 2. Adım: Başvuru & Tarih Yönetimi
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Turnuva durumunu, başvuru kabul pencerelerini ve maç takvimini belirleyin.
                </p>
              </div>

              {/* Turnuva Durumu ve Başvuru Anahtarı */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-300 mb-2">
                    Turnuva Durumu
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e: any) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-[#050b14] border border-white/10 focus:border-cyan-500/80 rounded-xl px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="REGISTRATION">Başvuru Sürecinde (Açık)</option>
                    <option value="DRAFT">Taslak (Gizli / Henüz Açılmadı)</option>
                    <option value="IN_PROGRESS">Devam Ediyor (Maçlar Oynanıyor)</option>
                    <option value="COMPLETED">Tamamlandı (Şampiyon Belirlendi)</option>
                    <option value="ARCHIVED">Arşivlendi</option>
                  </select>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Turnuvanın sistemdeki mevcut aşamasını tanımlar.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-300 mb-2">
                    Başvuru Kabul Durumu
                  </label>
                  <div
                    onClick={() =>
                      setFormData({ ...formData, is_registration_open: !formData.is_registration_open })
                    }
                    className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                      formData.is_registration_open
                        ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                        : 'bg-zinc-900 border-white/10 text-zinc-400'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider block">
                        {formData.is_registration_open ? 'BAŞVURULAR AÇIK' : 'BAŞVURULAR KAPALI'}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {formData.is_registration_open
                          ? 'Kullanıcılar takımlarıyla başvuru yapabilir.'
                          : 'Yeni takım başvurusu kabul edilmez.'}
                      </span>
                    </div>
                    <div
                      className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-1 ${
                        formData.is_registration_open ? 'bg-cyan-500' : 'bg-zinc-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-black transition-transform ${
                          formData.is_registration_open ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tarih Alanları */}
              <div className="p-4 rounded-2xl bg-black/20 border border-white/5 space-y-4">
                <span className="text-xs font-black uppercase tracking-widest text-zinc-400 block">
                  ZAMAN ÇİZELGESİ (TAKİVİM)
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                      Başvuru Başlangıç Tarihi
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.registration_start}
                      onChange={(e) => {
                        setFormData({ ...formData, registration_start: e.target.value });
                        if (errors.registration_end) setErrors((prev) => ({ ...prev, registration_end: '' }));
                      }}
                      className="w-full bg-[#050b14] border border-white/10 focus:border-cyan-500/80 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                      Başvuru Bitiş (Son Kayıt) Tarihi
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.registration_end}
                      onChange={(e) => {
                        setFormData({ ...formData, registration_end: e.target.value });
                        if (errors.registration_end) setErrors((prev) => ({ ...prev, registration_end: '' }));
                      }}
                      className={`w-full bg-[#050b14] border rounded-xl px-4 py-2.5 text-xs text-white outline-none ${
                        errors.registration_end ? 'border-red-500' : 'border-white/10 focus:border-cyan-500/80'
                      }`}
                    />
                    {errors.registration_end && (
                      <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.registration_end}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                    Turnuva / Maç Başlangıç Tarihi
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.tournament_date}
                    onChange={(e) => setFormData({ ...formData, tournament_date: e.target.value })}
                    className="w-full bg-[#050b14] border border-white/10 focus:border-cyan-500/80 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">
                    İlk grup maçlarının oynanacağı gün ve saat.
                  </p>
                </div>
              </div>

              {/* Takım Kontenjanı */}
              <div className="p-4 rounded-2xl bg-black/20 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-300">
                    Takım Kontenjanı (Maksimum Takım Sayısı)
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-cyan-400 font-bold select-none">
                    <input
                      type="checkbox"
                      checked={formData.is_unlimited_teams}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData({
                          ...formData,
                          is_unlimited_teams: checked,
                          max_teams: checked ? '' : '16',
                        });
                        if (errors.max_teams) setErrors((prev) => ({ ...prev, max_teams: '' }));
                      }}
                      className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                    />
                    <span>Kontenjan Sınırı Yok (Sınırsız)</span>
                  </label>
                </div>

                <div className="relative">
                  <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="number"
                    min="2"
                    step="1"
                    disabled={formData.is_unlimited_teams}
                    value={formData.is_unlimited_teams ? '' : formData.max_teams}
                    onChange={(e) => {
                      setFormData({ ...formData, max_teams: e.target.value });
                      if (errors.max_teams) setErrors((prev) => ({ ...prev, max_teams: '' }));
                    }}
                    placeholder={formData.is_unlimited_teams ? 'Sınırsız kontenjan aktif' : 'Örn: 16'}
                    className={`w-full bg-[#050b14] border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-all ${
                      formData.is_unlimited_teams
                        ? 'opacity-40 cursor-not-allowed border-white/5 bg-zinc-900/50'
                        : errors.max_teams
                        ? 'border-red-500'
                        : 'border-white/10 focus:border-cyan-500/80'
                    }`}
                  />
                </div>
                {errors.max_teams ? (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.max_teams}
                  </p>
                ) : (
                  <p className="text-[11px] text-zinc-500">
                    {formData.is_unlimited_teams
                      ? 'Herhangi bir takım sınırı olmaksızın tüm onaylı başvurular kabul edilir.'
                      : 'Belirtilen sayıya ulaşıldığında yeni başvurular otomatik olarak engellenir veya yedek sırasına alınır.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ---------------- ADIM 3: TURNUVA FORMATI ---------------- */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="border-b border-white/5 pb-3">
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#00e5ff]" /> 3. Adım: Turnuva Formatı & Grup Yapısı
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Grup aşamasının büyüklüğünü ve eleme (play-off) turuna yükselecek takım sayısını belirleyin.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Grup Başına Takım Sayısı */}
                <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-200">
                      Grup Başına Takım Sayısı
                    </label>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      Standart: 4 Takım
                    </span>
                  </div>

                  <input
                    type="number"
                    min="2"
                    max="16"
                    value={formData.teams_per_group}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 2;
                      setFormData({ ...formData, teams_per_group: val });
                      if (errors.teams_per_group) setErrors((prev) => ({ ...prev, teams_per_group: '' }));
                    }}
                    className={`w-full bg-[#050b14] border rounded-xl px-4 py-3 text-base font-black text-white outline-none ${
                      errors.teams_per_group ? 'border-red-500' : 'border-white/10 focus:border-cyan-500'
                    }`}
                  />
                  {errors.teams_per_group ? (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.teams_per_group}
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Her grupta yer alacak takım sayısı. Örneğin 16 onaylı takım ve grup başına 4 takım seçildiğinde sistem <strong>4 grup (A, B, C, D)</strong> oluşturur.
                    </p>
                  )}
                </div>

                {/* Eleme Turuna Çıkacak Takım Sayısı */}
                <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-200">
                      Gruptan Çıkacak Takım Sayısı
                    </label>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      Standart: 2 Takım
                    </span>
                  </div>

                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={formData.advancing_teams_per_group}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 1;
                      setFormData({ ...formData, advancing_teams_per_group: val });
                      if (errors.advancing_teams_per_group) {
                        setErrors((prev) => ({ ...prev, advancing_teams_per_group: '' }));
                      }
                    }}
                    className={`w-full bg-[#050b14] border rounded-xl px-4 py-3 text-base font-black text-white outline-none ${
                      errors.advancing_teams_per_group ? 'border-red-500' : 'border-white/10 focus:border-cyan-500'
                    }`}
                  />
                  {errors.advancing_teams_per_group ? (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.advancing_teams_per_group}
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Her grubun puan tablosunu ilk kaç sırada tamamlayan takımların eleme (çeyrek/yarı final) ağacına yükseleceğini belirler.
                    </p>
                  )}
                </div>
              </div>

              {/* Bilgilendirici Simülasyon Kartı */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/30 to-blue-950/20 border border-cyan-500/20 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-[#00e5ff] shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <span className="font-black text-white uppercase tracking-wider block">
                    Otomatik Çapraz Eşleşme (UEFA Formatı):
                  </span>
                  <p className="text-zinc-300 leading-relaxed">
                    Grup maçları tamamlandığında, grup birincileri farklı grupların ikincileriyle çapraz eşleşir. Aynı gruptan çıkan takımlar ilk eleme turunda birbirine rakip olmaz.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- ADIM 4: KURALLAR VE AÇIKLAMALAR ---------------- */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="border-b border-white/5 pb-3">
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#00e5ff]" /> 4. Adım: Kurallar, Tanıtım & Başvuru Rehberi
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Katılımcıların turnuva detay sayfasında okuyacağı açıklamaları ve turnuva kurallarını yazın.
                </p>
              </div>

              {/* Kısa Tanıtım Açıklaması */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-300 mb-2">
                  Kısa Tanıtım Açıklaması
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Örn: Sezon arası 16 takımlı Pro Clubs Night Cup şampiyonası!"
                  className="w-full bg-[#050b14] border border-white/10 focus:border-cyan-500/80 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Turnuva kartı üzerinde 1-2 cümlelik özet olarak görüntülenir.
                </p>
              </div>

              {/* Turnuva Kuralları */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-300">
                    Turnuva Kuralları & Yaptırımlar
                  </label>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">Markdown / Düz Metin</span>
                </div>
                <textarea
                  rows={5}
                  value={formData.rules}
                  onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                  placeholder={`Örnek Kural Maddeleri:
1. Maçlar EA Sports FC 25 Pro Clubs modunda 11v11 / Standart kurallarla oynanacaktır.
2. Maç sonucunda ev sahibi veya deplasman kaptanı maç sonu ekran görüntüsünü yüklemelidir.
3. Bağlantı kopması durumunda maçın kalan süresi belirlenen skorla devam eder.
4. Küfür, hakaret ve hile girişimleri diskalifiye ile sonuçlanır.`}
                  className="w-full bg-[#050b14] border border-white/10 focus:border-cyan-500/80 rounded-xl p-4 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 outline-none resize-y leading-relaxed"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Turnuva detay sayfasındaki "Kurallar" sekmesinde yer alacaktır.
                </p>
              </div>

              {/* Detaylar & Başvuru Rehberi */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-300">
                    Detaylar & Başvuru Rehberi
                  </label>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">Markdown / Düz Metin</span>
                </div>
                <textarea
                  rows={5}
                  value={formData.details}
                  onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                  placeholder={`Örnek Rehber Maddeleri:
- Başvurular yalnızca onaylı takım kaptanları tarafından yapılabilir.
- Her takım kadrosunda en az 5, en fazla 11 oyuncu bildirmelidir.
- Turnuva kura çekimi Discord sunucumuz üzerinden canlı yayınlanacaktır.`}
                  className="w-full bg-[#050b14] border border-white/10 focus:border-cyan-500/80 rounded-xl p-4 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 outline-none resize-y leading-relaxed"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Turnuva detay sayfasındaki "Detaylar" sekmesinde takım kaptanlarına rehberlik eder.
                </p>
              </div>
            </div>
          )}

          {/* ---------------- ADIM 5: ÖN İZLEME VE OLUŞTUR ---------------- */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="border-b border-white/5 pb-3">
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#00e5ff]" /> 5. Adım: Ön İzleme & Turnuvayı Onayla
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Girdiğiniz tüm bilgileri son kez kontrol edin. Düzenlemek istediğiniz adımlara kolayca geri dönebilirsiniz.
                </p>
              </div>

              {/* Özet Kartları Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Kart 1: Genel Bilgiler */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3 relative group">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5" /> Genel Bilgiler
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="text-[11px] text-zinc-400 hover:text-cyan-400 flex items-center gap-1 font-bold cursor-pointer transition-colors"
                    >
                      <Edit2 className="w-3 h-3" /> Düzenle
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">Turnuva Adı</span>
                      <strong className="text-white text-sm">{formData.name || '-'}</strong>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Sezon</span>
                        <span className="text-zinc-300 font-bold">{selectedSeasonName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Ödül</span>
                        <span className="text-amber-400 font-bold">{formData.prize || 'Belirtilmedi'}</span>
                      </div>
                    </div>

                    {formData.discord_url && (
                      <div className="pt-1">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Discord</span>
                        <span className="text-cyan-400 font-mono text-[11px] truncate block">
                          {formData.discord_url}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Kart 2: Başvuru & Tarihler */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3 relative group">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Başvuru & Tarihler
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="text-[11px] text-zinc-400 hover:text-cyan-400 flex items-center gap-1 font-bold cursor-pointer transition-colors"
                    >
                      <Edit2 className="w-3 h-3" /> Düzenle
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Durum</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          {formData.status}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Başvurular</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            formData.is_registration_open
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {formData.is_registration_open ? 'AÇIK' : 'KAPALI'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Kontenjan</span>
                        <span className="text-white font-bold">
                          {formData.is_unlimited_teams ? 'Sınırsız' : `${formData.max_teams} Takım`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Maç Başlangıcı</span>
                        <span className="text-zinc-300 font-bold">
                          {formatDateTimeDisplay(formData.tournament_date)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">Başvuru Penceresi</span>
                      <span className="text-zinc-400 text-[11px]">
                        {formatDateTimeDisplay(formData.registration_start)} — {formatDateTimeDisplay(formData.registration_end)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Kart 3: Turnuva Formatı */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3 relative group">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" /> Turnuva Formatı
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="text-[11px] text-zinc-400 hover:text-cyan-400 flex items-center gap-1 font-bold cursor-pointer transition-colors"
                    >
                      <Edit2 className="w-3 h-3" /> Düzenle
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-center">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                        Grup Başına
                      </span>
                      <strong className="text-xl font-black text-white">{formData.teams_per_group}</strong>
                      <span className="text-[10px] text-zinc-500 block">Takım</span>
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-center">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
                        Gruptan Çıkan
                      </span>
                      <strong className="text-xl font-black text-[#00e5ff]">{formData.advancing_teams_per_group}</strong>
                      <span className="text-[10px] text-zinc-500 block">Takım</span>
                    </div>
                  </div>
                </div>

                {/* Kart 4: Afiş Görseli */}
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3 relative group">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" /> Afiş Görseli
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="text-[11px] text-zinc-400 hover:text-cyan-400 flex items-center gap-1 font-bold cursor-pointer transition-colors"
                    >
                      <Edit2 className="w-3 h-3" /> Düzenle
                    </button>
                  </div>

                  {formData.imagePreviewUrl ? (
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-16 rounded-xl overflow-hidden border border-white/15 bg-black shrink-0">
                        <img
                          src={formData.imagePreviewUrl}
                          alt="Turnuva Afişi"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 text-xs">
                        <p className="font-bold text-white truncate">{formData.image_file?.name}</p>
                        <p className="text-[10px] text-zinc-500">
                          {formData.image_file ? `${(formData.image_file.size / 1024).toFixed(0)} KB` : ''}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-center text-xs text-zinc-500">
                      Görsel seçilmedi (Varsayılan turnuva ikonu kullanılacak).
                    </div>
                  )}
                </div>
              </div>

              {/* Açıklama ve Kurallar Özeti */}
              {(formData.description || formData.rules || formData.details) && (
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Metinler & Kurallar
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(4)}
                      className="text-[11px] text-zinc-400 hover:text-cyan-400 flex items-center gap-1 font-bold cursor-pointer transition-colors"
                    >
                      <Edit2 className="w-3 h-3" /> Düzenle
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    {formData.description && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Tanıtım</span>
                        <p className="text-zinc-300 italic">{formData.description}</p>
                      </div>
                    )}
                    {formData.rules && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Kurallar</span>
                        <p className="text-zinc-400 line-clamp-3 font-mono text-[11px] whitespace-pre-line">
                          {formData.rules}
                        </p>
                      </div>
                    )}
                    {formData.details && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Detaylar</span>
                        <p className="text-zinc-400 line-clamp-3 font-mono text-[11px] whitespace-pre-line">
                          {formData.details}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        {/* ================= FOOTER / CONTROLS ================= */}
        <div className="p-4 sm:p-6 border-t border-white/10 bg-[#060d18] shrink-0 flex items-center justify-between gap-3">
          {/* Sol Buton: İptal / Geri */}
          {currentStep > 1 ? (
            <button
              type="button"
              disabled={submitting}
              onClick={handlePrev}
              className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> Geri
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
            >
              İptal
            </button>
          )}

          {/* Orta Bilgi (Masaüstü) */}
          <div className="hidden sm:block text-center text-xs text-zinc-500">
            Adım <strong className="text-white">{currentStep}</strong> / 5:{' '}
            <span className="text-cyan-400">{STEPS[currentStep - 1].title}</span>
          </div>

          {/* Sağ Buton: Devam Et / Turnuvayı Oluştur */}
          {currentStep < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-[#00e5ff] text-black font-black text-xs uppercase tracking-wider hover:brightness-110 shadow-lg shadow-cyan-500/25 transition-all flex items-center gap-2 cursor-pointer"
            >
              Devam Et <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="px-6 sm:px-8 py-2.5 sm:py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 text-black font-black text-xs sm:text-sm uppercase tracking-widest hover:brightness-110 shadow-xl shadow-cyan-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Oluşturuluyor...</span>
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4" />
                  <span>Turnuvayı Oluştur</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
