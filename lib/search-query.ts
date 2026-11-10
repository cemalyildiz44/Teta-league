/**
 * Cleans free text before it is embedded in a PostgREST filter string such as
 * `.or(\`username.ilike.%${term}%\`)`. Commas, parentheses, double quotes and backslashes would let the
 * text add or break filter conditions, and % / * are LIKE wildcards. Returns '' when nothing searchable remains.
 */
export function sanitizeSearchTerm(raw: unknown, maxLength = 50): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[%*,()"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Parses an integer request parameter and clamps it to [min, max]; anything unparsable yields `fallback`. */
export function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
