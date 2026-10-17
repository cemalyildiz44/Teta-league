import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { exportWeeklyFiles, prepareExportDelivery, requireAdmin } from '@/lib/fixture-import-service';
import { UUID_RE, exportZipFileName } from '@/lib/fixture-weekly';
import { createZip } from '@/lib/zip-store';

// Read-only weekly export (teta.fixtures v2). Admin-only.
// GET ?seasonId=<uuid>&leagueId=<uuid>[&leagueId=...]&week=<n>  |  &weekFrom=<n>&weekTo=<n>
// One resulting file => JSON download. Several => a single ZIP (browsers block bursts of
// multiple automatic downloads, so a ZIP is the reliable way to deliver many files).
// Files the importer would reject (missing EA club id / unknown team) are withheld and reported (422 when nothing is left).
// Notes (missing weeks, withheld files) travel in the X-Export-Notices header (URL-encoded JSON array) and inside the ZIP report.

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function parseWeek(v: string | null): number | undefined | null {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 200 ? n : null;
}

export async function GET(request: Request) {
  const supabase = createClient(await cookies());
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const q = new URL(request.url).searchParams;
  const seasonId = q.get('seasonId') ?? '';
  const leagueIds = q.getAll('leagueId').flatMap((v) => v.split(',')).filter(Boolean);
  if (!UUID_RE.test(seasonId)) return json({ error: 'Geçerli bir seasonId zorunludur.' }, 400);
  if (leagueIds.length === 0 || leagueIds.length > 20 || leagueIds.some((id) => !UUID_RE.test(id))) {
    return json({ error: 'Geçerli leagueId değerleri zorunludur (en fazla 20).' }, 400);
  }
  const week = parseWeek(q.get('week'));
  let weekFrom = parseWeek(q.get('weekFrom'));
  let weekTo = parseWeek(q.get('weekTo'));
  if (week === null || weekFrom === null || weekTo === null) return json({ error: 'Hafta değerleri 1-200 arasında tam sayı olmalı.' }, 400);
  if (week !== undefined) {
    weekFrom = week;
    weekTo = week;
  }
  if (weekFrom !== undefined && weekTo !== undefined && weekFrom > weekTo) return json({ error: 'weekFrom, weekTo değerinden büyük olamaz.' }, 400);

  const out = await exportWeeklyFiles(supabase, { seasonId, leagueIds, weekFrom, weekTo });
  if (!out.result) return json({ error: out.error }, out.status ?? 500);

  const { report } = out.result;
  const delivery = prepareExportDelivery(out.result);
  const files = delivery.files;
  if (files.length === 0) {
    return json(
      {
        error: 'Dışa aktarılabilir dosya yok: ' + (delivery.notices.join(' ') || 'seçilen kapsamda fikstür bulunamadı.'),
        blocked: delivery.blocked,
        notices: delivery.notices,
      },
      422
    );
  }
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (delivery.notices.length) {
    const encoded = encodeURIComponent(JSON.stringify(delivery.notices.slice(0, 20)));
    if (encoded.length <= 6000) headers['X-Export-Notices'] = encoded;
  }
  if (files.length === 1) {
    return new Response(JSON.stringify(files[0].doc, null, 2), {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${files[0].name}"`,
      },
    });
  }
  const zip = createZip([
    ...files.map((f) => ({ name: f.name, data: JSON.stringify(f.doc, null, 2) })),
    { name: '_export-report.json', data: JSON.stringify({ fileCount: files.length, ...report, blocked: delivery.blocked, notices: delivery.notices }, null, 2) },
  ]);
  const first = files[0].doc.scope;
  return new Response(zip as unknown as BodyInit, {
    headers: {
      ...headers,
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${exportZipFileName(first.seasonSlug, files.length)}"`,
    },
  });
}
