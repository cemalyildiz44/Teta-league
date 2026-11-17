// Supabase/PostgREST returns at most 1000 rows per request and silently drops the rest. Anything that
// aggregates many rows (league statistics, rankings) must read every page, otherwise the totals come out
// too low without any error.
const PAGE_SIZE = 1000;
// Keeps `.in(...)` request URLs short (hundreds of UUIDs in one URL are fragile).
const ID_CHUNK_SIZE = 100;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Reads every page of a query until a short page is returned. The query must have a deterministic order
 * (e.g. `.order('id')`) so pages do not overlap. Throws on any query error: partial data would produce
 * wrong statistics.
 */
export async function fetchAllRows<T>(
  label: string,
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`[${label}] query failed: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Same as fetchAllRows, but splits a large id list into chunks and reads every page of each chunk. */
export async function fetchAllRowsByIds<T>(
  label: string,
  ids: string[],
  buildQuery: (chunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ID_CHUNK_SIZE);
    rows.push(...(await fetchAllRows<T>(label, (from, to) => buildQuery(chunk, from, to))));
  }
  return rows;
}
