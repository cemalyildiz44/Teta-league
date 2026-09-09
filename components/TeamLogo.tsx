import React from 'react';

export interface TeamLogoProps {
  src?: string | null;
  alt?: string;
  name?: string;
  className?: string;
  imgClassName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  fallbackText?: string;
  fallbackClassName?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6',                      // ~24px
  sm: 'w-8 h-8 sm:w-9 sm:h-9',        // ~32-36px (standings, fixtures, match list)
  md: 'w-10 h-10 md:w-11 md:h-11',    // ~40-44px (admin lists, team lists)
  lg: 'w-11 h-11 md:w-12 md:h-12',    // ~44-48px (takimlar list, player season tables)
  xl: 'w-24 h-24 md:w-28 md:h-28',    // ~96-112px (captain panel, profile active team)
  hero: 'w-36 h-36 md:w-48 md:h-48',  // ~144-192px (team detail hero, scoreboard hero)
};

export default function TeamLogo({
  src,
  alt,
  name = '',
  className = '',
  imgClassName = '',
  size = 'md',
  fallbackText,
  fallbackClassName = '',
}: TeamLogoProps) {
  const hasDimension = className.includes('w-') && className.includes('h-');
  const dimensionClass = hasDimension ? '' : (sizeClasses[size] || sizeClasses.md);
  const resolvedAlt = alt || name || 'Takım Logosu';
  const monogram = (fallbackText || name?.substring(0, 2) || '??').toUpperCase();

  if (src) {
    return (
      <div
        className={`shrink-0 flex items-center justify-center select-none ${dimensionClass} ${className}`.trim()}
        style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
      >
        <img
          src={src}
          alt={resolvedAlt}
          className={`w-full h-full object-contain pointer-events-none ${imgClassName}`.trim()}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 flex items-center justify-center font-black rounded-lg bg-white/5 border border-white/10 text-[#00e5ff] select-none ${dimensionClass} ${fallbackClassName} ${className}`.trim()}
    >
      <span className="text-xs uppercase tracking-wider">{monogram}</span>
    </div>
  );
}
