// Validation of the weekly fixture export form (/admin/fixtures/import). Kept free of React/Next so it can be unit-tested.

export const MIN_WEEK = 1;
export const MAX_WEEK = 200;

export type ExportMode = 'single' | 'range' | 'all';

/** A week is a whole number written with digits only, 1..200 (no sign, decimals, exponent or blanks). */
export function isValidWeek(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) >= MIN_WEEK && Number(value) <= MAX_WEEK;
}

/** The message shown next to the download button, or null when the form can be submitted. */
export function exportFormError(args: { leagueCount: number; mode: ExportMode; week: string; weekFrom: string; weekTo: string }): string | null {
  const { leagueCount, mode, week, weekFrom, weekTo } = args;
  if (!leagueCount) return 'En az bir lig seçin.';
  if (mode === 'single' && !isValidWeek(week)) return 'Hafta 1-200 arasında bir tam sayı olmalı.';
  if (mode === 'range' && (!isValidWeek(weekFrom) || !isValidWeek(weekTo))) return 'Hafta değerleri 1-200 arasında tam sayı olmalı.';
  if (mode === 'range' && Number(weekFrom) > Number(weekTo)) return 'Başlangıç haftası bitiş haftasından büyük olamaz.';
  return null;
}
