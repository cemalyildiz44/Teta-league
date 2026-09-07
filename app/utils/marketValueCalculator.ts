export const BASE_VALUE = 2_000_000;

export interface MarketValueInput {
  profile: {
    primary_position: string | null;
  };
  careerStats: {
    matches_played: number;
    wins: number;
    draws: number;
    losses: number;
    goals: number;
    assists: number;
    cleansheets_gk: number;
    cleansheets_def: number;
    red_cards: number;
  };
  seasonStats: {
    season_id: string;
    rating_sum: number;
    rating_count: number;
  }[];
  achievements: {
    achievement_type: string;
    season_id?: string | null;
  }[];
}

export interface MarketValueBreakdown {
  label: string;
  value: number;
}

export interface MarketValueResult {
  totalValue: number;
  breakdown: MarketValueBreakdown[];
}

const DEF_GK_POSITIONS = ['KL', 'STP', 'SĞB', 'SLB'];

export function calculateMarketValue(input: MarketValueInput): MarketValueResult {
  let totalValue = BASE_VALUE;
  const breakdown: MarketValueBreakdown[] = [
    { label: 'BASE VALUE', value: BASE_VALUE }
  ];

  const addBreakdown = (label: string, value: number) => {
    if (value !== 0) {
      totalValue += value;
      breakdown.push({ label, value });
    }
  };

  // Matches
  const matchesBonus = input.careerStats.matches_played * 50_000;
  addBreakdown('MATCHES', matchesBonus);

  const winsBonus = input.careerStats.wins * 30_000;
  addBreakdown('WINS', winsBonus);

  const drawsBonus = input.careerStats.draws * 10_000;
  addBreakdown('DRAWS', drawsBonus);

  const lossesPenalty = input.careerStats.losses * -10_000;
  addBreakdown('LOSSES', lossesPenalty);

  // Goals & Assists (applied to all)
  const goalsBonus = input.careerStats.goals * 10_000;
  addBreakdown('GOALS', goalsBonus);

  const assistsBonus = input.careerStats.assists * 10_000;
  addBreakdown('ASSISTS', assistsBonus);

  // Def/GK specific: Clean Sheets
  const pos = input.profile.primary_position || '';
  if (DEF_GK_POSITIONS.includes(pos)) {
    const csTotal = input.careerStats.cleansheets_gk + input.careerStats.cleansheets_def;
    const csBonus = csTotal * 20_000;
    addBreakdown('CLEAN SHEETS', csBonus);
  }

  // Red Cards
  const redCardsPenalty = input.careerStats.red_cards * -20_000;
  addBreakdown('RED CARDS', redCardsPenalty);

  // Season Average Rating Bonus
  let totalRatingBonus = 0;
  for (const s of input.seasonStats) {
    if (s.rating_count > 0) {
      const avgRating = s.rating_sum / s.rating_count;
      if (avgRating >= 8) {
        totalRatingBonus += 200_000;
      } else if (avgRating >= 7) {
        totalRatingBonus += 100_000;
      } else if (avgRating >= 6) {
        totalRatingBonus += 50_000;
      } else if (avgRating > 5) {
        totalRatingBonus += 0;
      } else {
        totalRatingBonus -= 100_000;
      }
    }
  }
  addBreakdown('RATING BONUS', totalRatingBonus);

  // Achievements (POTS)
  let totalAchievementsBonus = 0;
  const countedPOTS = new Set<string>(); // Keep track of season_id to avoid duplicates if any
  for (const ach of input.achievements) {
    if (ach.achievement_type === 'POTS') {
      const key = ach.season_id || 'unknown';
      if (!countedPOTS.has(key)) {
        countedPOTS.add(key);
        totalAchievementsBonus += 1_000_000;
      }
    }
  }
  addBreakdown('ACHIEVEMENTS', totalAchievementsBonus);

  return {
    totalValue,
    breakdown
  };
}

export function formatEuro(value: number): string {
  // de-DE locale ensures dot as thousands separator and comma as decimal separator, matching common Euro formatting
  // User wanted e.g., 2.000.000 €
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}
