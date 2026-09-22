export const PLATFORM_OPTIONS = [
  'PS5',
  'Xbox Series X',
  'Xbox Series S',
  'PC'
];

export const POSITION_FILTER_OPTIONS = [
  { value: 'KL', label: 'KL (Kaleci)' },
  { value: 'STP', label: 'STP (Stoper)' },
  { value: 'SĞB', label: 'SĞB (Sağ Bek)' },
  { value: 'SLB', label: 'SLB (Sol Bek)' },
  { value: 'MDO', label: 'MDO (Defansif Orta Saha)' },
  { value: 'MO', label: 'MO (Merkez Orta Saha)' },
  { value: 'SĞO', label: 'SĞO (Sağ Orta Saha)' },
  { value: 'SLO', label: 'SLO (Sol Orta Saha)' },
  { value: 'OOS', label: 'OOS (Ofansif Orta Saha)' },
  { value: 'SĞK', label: 'SĞK (Sağ Kanat)' },
  { value: 'SLK', label: 'SLK (Sol Kanat)' },
  { value: 'ST', label: 'ST (Santrfor)' },
];

export const POSITION_OPTIONS = POSITION_FILTER_OPTIONS.map(p => p.value);

export const POSITION_ALIASES: Record<string, string[]> = {
  KL: ['KL', 'GK', 'KALECİ', 'KALECI'],
  STP: ['STP', 'CB', 'STOPER'],
  SĞB: ['SĞB', 'SGB', 'RB'],
  SLB: ['SLB', 'LB'],
  MDO: ['MDO', 'CDM', 'DM'],
  MO: ['MO', 'CM'],
  SĞO: ['SĞO', 'SGO', 'RM'],
  SLO: ['SLO', 'LM'],
  OOS: ['OOS', 'CAM', 'AM'],
  SĞK: ['SĞK', 'SGK', 'RW'],
  SLK: ['SLK', 'LW'],
  ST: ['ST', 'CF', 'SANTRFOR', 'FORVET'],
};

export function getPositionLabel(posValue: string | null | undefined): string {
  if (!posValue || posValue === 'Belirtilmedi' || posValue === 'Bilinmiyor') return posValue || '';
  const found = POSITION_FILTER_OPTIONS.find(p => p.value === posValue);
  return found ? found.label : posValue;
}

export function matchesPositionSingle(posValue: string | null | undefined, filterValue: string): boolean {
  if (!posValue) return false;
  const p = posValue.trim().toUpperCase();
  const f = filterValue.trim().toUpperCase();

  if (p === f) return true;

  const aliases = POSITION_ALIASES[f];
  if (aliases && aliases.includes(p)) {
    return true;
  }

  for (const [key, aliasList] of Object.entries(POSITION_ALIASES)) {
    if (aliasList.includes(f) && (key === p || aliasList.includes(p))) {
      return true;
    }
  }

  return false;
}

export function matchesSecondaryPosition(
  alternativePositions: string[] | null | undefined,
  filterValue: string | string[]
): boolean {
  if (!filterValue) return true;
  if (Array.isArray(filterValue)) {
    if (filterValue.length === 0 || filterValue.includes('TÜMÜ')) return true;
    if (!Array.isArray(alternativePositions) || alternativePositions.length === 0) return false;
    return alternativePositions.some(alt =>
      filterValue.some(sel => matchesPositionSingle(alt, sel))
    );
  }
  if (filterValue === 'TÜMÜ') return true;
  if (!Array.isArray(alternativePositions) || alternativePositions.length === 0) return false;
  return alternativePositions.some(alt => matchesPositionSingle(alt, filterValue));
}

export function formatPosition(pos: string | null | undefined): string {
  if (!pos || pos === 'Bilinmiyor') return 'BİLİNMİYOR';
  const normalized = pos.trim().toUpperCase();
  if (POSITION_ALIASES[normalized]) return normalized;
  for (const [trKey, aliasList] of Object.entries(POSITION_ALIASES)) {
    if (aliasList.includes(normalized)) return trKey;
  }
  return normalized;
}

export function formatPlatform(platform: string | null | undefined): string {
  if (!platform || platform === 'Bilinmiyor' || platform === 'common-gen5' || platform === 'common_gen5') {
    return 'Belirtilmedi';
  }
  return platform;
}
