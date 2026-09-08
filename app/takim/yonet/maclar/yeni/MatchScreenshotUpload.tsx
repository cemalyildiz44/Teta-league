'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Upload, Image as ImageIcon, CheckCircle2, AlertCircle, Loader2, X, RefreshCw, ExternalLink } from 'lucide-react';

interface MatchScreenshotUploadProps {
  value: string;
  onChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function MatchScreenshotUpload({
  value,
  onChange,
  onUploadingChange,
  disabled = false
}: MatchScreenshotUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(value || null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validation 1: MIME Type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Geçersiz dosya formatı. Yalnızca JPG, PNG veya WEBP yükleyebilirsiniz.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validation 2: File Size
    if (file.size > MAX_FILE_SIZE) {
      setError('Dosya boyutu çok büyük. Maksimum 5MB boyutunda bir görsel yükleyebilirsiniz.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFileName(file.name);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    // Upload to Supabase Storage
    setUploading(true);
    onUploadingChange?.(true);

    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() || 'png';
      const cleanFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const filePath = `matches/${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('match-screenshots')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Yükleme başarısız oldu.');
      }

      const { data: { publicUrl } } = supabase.storage
        .from('match-screenshots')
        .getPublicUrl(filePath);

      onChange(publicUrl);
    } catch (err: any) {
      setError(err.message || 'Ekran görüntüsü yüklenirken bir hata oluştu.');
      setPreview(value || null);
      onChange('');
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setFileName(null);
    setError(null);
    onChange('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        disabled={disabled || uploading}
        className="hidden"
      />

      {/* Upload Box or Preview Card */}
      {!preview ? (
        <div
          onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
          className={`group relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
            error
              ? 'border-red-500/40 bg-red-500/5 hover:bg-red-500/10'
              : 'border-white/10 bg-[#060d18] hover:border-[#00e5ff]/50 hover:bg-[#0a1628]/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-[#00e5ff] group-hover:bg-[#00e5ff]/10 transition-colors">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors">
                Maç Sonu Ekran Görüntüsü Yükle
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                JPG, PNG veya WEBP • Maks. 5MB
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative bg-[#060d18] border border-white/10 rounded-xl p-4 overflow-hidden">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Thumbnail */}
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden bg-black/60 border border-white/10 flex-shrink-0 flex items-center justify-center">
              <img
                src={preview}
                alt="Maç Kanıtı Önizleme"
                className="w-full h-full object-cover"
              />
              {uploading && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center gap-1">
                  <Loader2 className="w-6 h-6 text-[#00e5ff] animate-spin" />
                  <span className="text-[9px] font-black text-white uppercase tracking-wider">Yükleniyor</span>
                </div>
              )}
            </div>

            {/* Info & Actions */}
            <div className="flex-1 w-full space-y-2 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                {uploading ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Loader2 className="w-3 h-3 animate-spin" /> YÜKLENİYOR...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> GÖRSEL YÜKLENDİ
                  </span>
                )}
                {fileName && (
                  <span className="text-[11px] text-gray-400 truncate max-w-[200px]" title={fileName}>
                    {fileName}
                  </span>
                )}
              </div>

              <p className="text-[11px] text-gray-400">
                Görsel sunucuya yüklendi ve maç onayında yönetici tarafından incelenecektir.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                {value && !uploading && (
                  <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00e5ff] hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" /> Tam Boyut Aç
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || uploading}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-white/5 hover:bg-white/10 text-white rounded text-[10px] font-bold tracking-wider transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" /> Değiştir
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={disabled || uploading}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-[10px] font-bold tracking-wider transition-colors disabled:opacity-50"
                >
                  <X className="w-3 h-3" /> Kaldır
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs font-bold text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
