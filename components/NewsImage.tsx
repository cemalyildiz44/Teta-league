import { Newspaper } from 'lucide-react';

interface NewsImageProps {
  src?: string | null;
  alt: string;
  category?: string;
  variant?: 'card' | 'detail' | 'thumb';
  className?: string;
  imageClassName?: string;
}

export default function NewsImage({
  src,
  alt,
  category,
  variant = 'card',
  className = '',
  imageClassName = '',
}: NewsImageProps) {
  if (!src) {
    return (
      <div
        className={`relative w-full ${
          variant === 'detail'
            ? 'aspect-video max-h-[500px] rounded-2xl border border-white/10'
            : 'aspect-video'
        } flex items-center justify-center bg-gradient-to-br from-[#0a1628] to-[#020508] ${className}`}
      >
        <Newspaper className="w-10 h-10 text-[#00e5ff]/30" />
        {category && (
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            <span className="badge-cyan bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/30 backdrop-blur-md font-black tracking-widest text-[9px] sm:text-[10px] px-2.5 py-1 uppercase shadow-[0_0_10px_rgba(0,229,255,0.2)]">
              {category}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div
        className={`relative w-full rounded-2xl overflow-hidden bg-[#02060b] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex items-center justify-center min-h-[220px] max-h-[580px] sm:max-h-[640px] ${className}`}
      >
        {/* Ambient blurred backdrop matching image colors */}
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-105 blur-2xl opacity-25 brightness-75 select-none pointer-events-none"
        />
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />

        {/* Crisp uncropped foreground image preserving natural aspect ratio */}
        <img
          src={src}
          alt={alt}
          className={`relative z-10 w-full h-auto max-h-[580px] sm:max-h-[640px] object-contain mx-auto select-none ${imageClassName}`}
        />
      </div>
    );
  }

  // variant === 'card' or 'thumb'
  return (
    <div
      className={`relative w-full aspect-video overflow-hidden bg-[#02060b] flex items-center justify-center ${className}`}
    >
      {/* Ambient blurred backdrop matching image colors */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-35 brightness-75 select-none pointer-events-none"
      />
      <div className="absolute inset-0 bg-black/35 pointer-events-none" />

      {/* Crisp uncropped foreground image */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`relative z-10 w-full h-full object-contain select-none transition-transform duration-500 group-hover:scale-[1.03] ${imageClassName}`}
      />

      {/* Subtle border between image container and card body */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-white/5 z-20 pointer-events-none" />

      {/* Category badge */}
      {category && (
        <div className="absolute top-3 left-3 z-20 pointer-events-none">
          <span className="badge-cyan bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/30 backdrop-blur-md font-black tracking-widest text-[9px] sm:text-[10px] px-2.5 py-1 uppercase shadow-[0_0_10px_rgba(0,229,255,0.2)]">
            {category}
          </span>
        </div>
      )}
    </div>
  );
}
