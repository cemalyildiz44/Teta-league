export type StandingsZoneType = 
  | 'champions' 
  | 'europa' 
  | 'relegation' 
  | 'promotion' 
  | 'playoff' 
  | 'neutral' 
  | 'expelled';

export interface StandingsZoneStyle {
  type: StandingsZoneType;
  label: string;
  barClass: string;
  dotClass: string;
}

/**
 * Returns zone styling based on official TETA League rules:
 * 
 * TETA SÜPER LİG (12 Teams):
 * - 1-2: Şampiyonlar Ligi (Blue)
 * - 3-4: Avrupa Ligi (Amber/Yellow)
 * - 5-10: Normal bölge (Neutral)
 * - 11-12: Küme Düşme (Red)
 * 
 * ECL 1. LİG (12 Teams):
 * - 1: Lig Yükselme (Green)
 * - 2-5: Lig Yükselme Play-Off (Amber/Yellow)
 * - 6-12: Normal bölge (Neutral)
 */
export function getStandingsZone(
  rank: number | string,
  isLevel1: boolean,
  isExpelled = false
): StandingsZoneStyle {
  if (isExpelled) {
    return {
      type: 'expelled',
      label: 'İhraç Edilmiş',
      barClass: 'bg-red-600',
      dotClass: 'bg-red-600',
    };
  }

  const numRank = typeof rank === 'number' ? rank : parseInt(String(rank), 10);

  if (isNaN(numRank)) {
    return {
      type: 'neutral',
      label: 'Normal Bölge',
      barClass: 'bg-transparent',
      dotClass: 'bg-transparent',
    };
  }

  if (isLevel1) {
    if (numRank === 1 || numRank === 2) {
      return {
        type: 'champions',
        label: 'Şampiyonlar Ligi',
        barClass: 'bg-blue-500',
        dotClass: 'bg-blue-500',
      };
    }
    if (numRank === 3 || numRank === 4) {
      return {
        type: 'europa',
        label: 'Avrupa Ligi',
        barClass: 'bg-amber-400',
        dotClass: 'bg-amber-400',
      };
    }
    if (numRank === 11 || numRank === 12) {
      return {
        type: 'relegation',
        label: 'Küme Düşme',
        barClass: 'bg-rose-500',
        dotClass: 'bg-rose-500',
      };
    }
  } else {
    // ECL 1. LİG (Level 2)
    if (numRank === 1) {
      return {
        type: 'promotion',
        label: 'Lig Yükselme',
        barClass: 'bg-emerald-500',
        dotClass: 'bg-emerald-500',
      };
    }
    if (numRank >= 2 && numRank <= 5) {
      return {
        type: 'playoff',
        label: 'Lig Yükselme Play-Off',
        barClass: 'bg-amber-400',
        dotClass: 'bg-amber-400',
      };
    }
  }

  return {
    type: 'neutral',
    label: 'Normal Bölge',
    barClass: 'bg-transparent',
    dotClass: 'bg-transparent',
  };
}
