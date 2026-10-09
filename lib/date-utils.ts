/**
 * Central Date & Timezone Utilities for TETA League.
 *
 * Standardizes Europe/Istanbul (UTC+3, permanent since 2016) handling across
 * forms, server actions, database storage, and client displays.
 * Prevents timezone drifts between datetime-local inputs and PostgreSQL timestamptz.
 */

export const TURKEY_TIMEZONE = 'Europe/Istanbul';

/**
 * Parses a datetime string entered in Turkey local time (e.g. from <input type="datetime-local">)
 * into a deterministic UTC ISO string suitable for Supabase / PostgreSQL timestamptz.
 *
 * Examples:
 * - "2026-10-11T22:00" -> "2026-10-11T19:00:00.000Z"
 * - "2026-10-11T00:30" -> "2026-10-10T21:30:00.000Z"
 * - Already UTC string ("2026-10-11T19:00:00.000Z") -> "2026-10-11T19:00:00.000Z"
 */
export function parseToTurkeyISO(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Check if string already contains timezone offset or 'Z'
  const hasTzRegex = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;
  if (hasTzRegex.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Handle local datetime formats: YYYY-MM-DD[T ]HH:mm(:ss)?
  const localMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const [, year, month, day, hour, min, sec] = localMatch;
    const seconds = sec || '00';
    // Turkey is permanently UTC+3 (no DST since 2016)
    const isoWithOffset = `${year}-${month}-${day}T${hour}:${min}:${seconds}+03:00`;
    const d = new Date(isoWithOffset);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Fallback parsing
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

/**
 * Formats a UTC timestamp / DB value into YYYY-MM-DDTHH:mm string in Europe/Istanbul time,
 * for pre-filling HTML <input type="datetime-local"> elements.
 *
 * Examples:
 * - "2026-10-11T19:00:00.000Z" -> "2026-10-11T22:00"
 * - "2026-10-10T21:30:00.000Z" -> "2026-10-11T00:30"
 */
export function formatForDateTimeLocal(value: string | number | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (!d || isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TURKEY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  let hour = partMap.hour;
  if (hour === '24') hour = '00';

  return `${partMap.year}-${partMap.month}-${partMap.day}T${hour}:${partMap.minute}`;
}

/**
 * Formats a timestamp into human-readable text in Turkish locale (tr-TR)
 * using the Europe/Istanbul timezone.
 *
 * Default output: "11.10.2026 22:00"
 */
export function formatTournamentDate(
  value: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!value) return 'Belirtilmedi';
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  if (!d || isNaN(d.getTime())) return 'Belirtilmedi';

  const defaultOpts: Intl.DateTimeFormatOptions = {
    timeZone: TURKEY_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  return new Intl.DateTimeFormat('tr-TR', {
    ...defaultOpts,
    ...options,
    timeZone: TURKEY_TIMEZONE,
  }).format(d);
}

/**
 * Formats a date range for display (e.g. registration window)
 */
export function formatTournamentDateRange(
  startVal: string | number | Date | null | undefined,
  endVal: string | number | Date | null | undefined
): string {
  const startStr = formatTournamentDate(startVal);
  const endStr = formatTournamentDate(endVal);

  if (startStr === 'Belirtilmedi' && endStr === 'Belirtilmedi') return 'Belirtilmedi';
  if (startStr === 'Belirtilmedi') return endStr;
  if (endStr === 'Belirtilmedi') return startStr;
  return `${startStr} — ${endStr}`;
}
