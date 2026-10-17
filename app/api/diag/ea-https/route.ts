import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { probeFetch, probeHttps, type ProbeResult } from '@/lib/ea/diag-probe';

/**
 * GEÇİCİ TEŞHİS (Production + Preview): EA 403 için fetch ile https.request karşılaştırması.
 * Elle tetiklenir, tek kulüp, tek tetiklemede en fazla 2 EA isteği, otomatik tekrar yok.
 * Üretim EA içe aktarma akışına bağlı değildir; Supabase'e hiçbir şey yazmaz (yalnızca okur).
 * Test bitince bu dosya ve lib/ea/diag-probe.ts silinmelidir.
 *
 * Erişim için TÜM koşullar gerekir (aksi halde 404 / 4xx):
 *   VERCEL_ENV production|preview, EA_DIAG_ENABLED=1, EA_DIAG_EXPIRES_AT (epoch ms, gelecekte, en fazla 2 saat),
 *   x-diag-confirm: yes, aktif ve iptal edilmemiş SUPER_ADMIN, bekleme süresi.
 */

const DIAG_CLUB_ID = 87430;
const EA_URL = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${DIAG_CLUB_ID}&platform=common-gen5&matchType=friendlyMatch`;
const COOLDOWN_MS = 60_000;
const PAUSE_BETWEEN_MS = 500;
// Fonksiyon süre sınırı doğrulanamadığı için en kötü durum (2 x 3.5 sn + 0.5 sn) 10 sn altında tutulur.
const PROBE_TIMEOUT_MS = 3500;
const MAX_WINDOW_MS = 2 * 60 * 60 * 1000;

// Bellek içi (en iyi çaba): aynı sunucu örneğinde art arda tetiklemeyi sınırlar.
let lastRunAt = 0;

const notFound = () => new NextResponse(null, { status: 404 });

/** Tüm kontrol sunucuda yapılır; eksik, bozuk, geçmiş ya da 2 saatten uzak değer kapıyı kapalı tutar. */
function isDiagWindowOpen(now: number): boolean {
  if (process.env.EA_DIAG_ENABLED !== '1') return false;
  const env = process.env.VERCEL_ENV;
  if (env !== 'production' && env !== 'preview') return false;
  const raw = process.env.EA_DIAG_EXPIRES_AT?.trim();
  if (!raw || !/^\d{1,16}$/.test(raw)) return false;
  const until = Number(raw);
  return Number.isSafeInteger(until) && until > now && until - now <= MAX_WINDOW_MS;
}

async function checkSuperAdmin(): Promise<'ok' | 'unauthenticated' | 'forbidden'> {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'unauthenticated';
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'SUPER_ADMIN')
    .eq('is_active', true)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();
  return data ? 'ok' : 'forbidden';
}

function logProbe(result: ProbeResult) {
  console.warn(
    '[EA-DIAG] client=%s status=%s content-type=%s server=%s duration=%dms bytes=%d akamai-ref=%s error=%s',
    result.client,
    result.status ?? '-',
    result.contentType ?? '-',
    result.server ?? '-',
    result.durationMs,
    result.bodyBytes,
    result.akamaiReference ?? '-',
    result.errorCode ?? '-'
  );
}

export async function POST(request: Request) {
  // 1. Production/Preview + açık bayrak + geçerli ve en fazla 2 saatlik süre penceresi. Aksi halde route yokmuş gibi davranır.
  if (!isDiagWindowOpen(Date.now())) {
    return notFound();
  }

  // 2. Bilinçli elle tetikleme
  if (request.headers.get('x-diag-confirm') !== 'yes') {
    return NextResponse.json({ error: 'x-diag-confirm: yes başlığı gerekli' }, { status: 400 });
  }

  // 3. Yalnızca aktif, iptal edilmemiş SUPER_ADMIN (normal ADMIN reddedilir)
  const auth = await checkSuperAdmin();
  if (auth === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth === 'forbidden') return NextResponse.json({ error: 'Forbidden: Super admins only' }, { status: 403 });

  // 4. Bekleme süresi (EA'ya istek göndermeden önce ayarlanır; hata olsa da sayılır)
  const now = Date.now();
  const remaining = lastRunAt + COOLDOWN_MS - now;
  if (remaining > 0) {
    return NextResponse.json({ error: 'Çok sık tetiklendi', retryAfterSeconds: Math.ceil(remaining / 1000) }, { status: 429 });
  }
  lastRunAt = now;

  // 5. Tam olarak iki istek: önce fetch, sonra https.request (otomatik tekrar yok)
  const fetchResult = await probeFetch(EA_URL, PROBE_TIMEOUT_MS);
  logProbe(fetchResult);
  await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_MS));
  const httpsResult = await probeHttps(EA_URL, PROBE_TIMEOUT_MS);
  logProbe(httpsResult);

  return NextResponse.json({
    clubId: DIAG_CLUB_ID,
    environment: process.env.VERCEL_ENV,
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
    order: ['fetch', 'https.request'],
    results: [fetchResult, httpsResult],
  });
}
