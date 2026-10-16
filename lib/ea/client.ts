import { EAMatchPayload } from './types';

const EA_API_BASE = 'https://proclubs.ea.com/api/fc/clubs/matches';

const EA_DIAGNOSTIC_BODY_LIMIT = 200;
const EA_DIAGNOSTIC_BODY_TIMEOUT_MS = 3000;

/**
 * Teşhis: başarısız (ok olmayan) EA yanıtının güvenli özetini sunucu loguna yazar.
 * Yalnızca status, content-type, server, access-control-allow-origin ve en fazla 200 karakterlik gövde
 * önizlemesi loglanır. İstek başlıkları, çerez, token ve tam yanıt başlıkları LOGLANMAZ.
 * Log hatası asıl hata davranışını asla etkilemez.
 */
async function logEaFailure(response: Response, clubId: number | string): Promise<void> {
  try {
    let preview = '';
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const raw = await Promise.race<string>([
        response.text(),
        new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve(''), EA_DIAGNOSTIC_BODY_TIMEOUT_MS);
        }),
      ]).finally(() => clearTimeout(timer));
      preview = raw
        .replace(/\s+/g, ' ')
        .replace(/[A-Za-z0-9_\-+/=]{32,}/g, '[redacted]') // uzun token benzeri diziler
        .trim()
        .slice(0, EA_DIAGNOSTIC_BODY_LIMIT);
    } catch {
      preview = '(gövde okunamadı)';
    }

    console.warn(
      '[EA] Başarısız yanıt: club=%s status=%d content-type=%s server=%s access-control-allow-origin=%s body="%s"',
      String(clubId),
      response.status,
      response.headers.get('content-type') ?? '-',
      response.headers.get('server') ?? '-',
      response.headers.get('access-control-allow-origin') ?? '-',
      preview
    );
  } catch {
    // teşhis logu hiçbir zaman asıl akışı bozmamalı
  }
}

export async function fetchClubMatches(clubId: number | string, platform = 'common-gen5', matchType = 'friendlyMatch'): Promise<EAMatchPayload[]> {
  const url = `${EA_API_BASE}?clubIds=${clubId}&platform=${platform}&matchType=${matchType}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.ea.com',
        'Referer': 'https://www.ea.com/',
      },
      cache: 'no-store', // Always fetch fresh
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      await logEaFailure(response, clubId);
      throw new Error(`EA API responded with status: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      console.error('EA Data is not array:', data);
      return [];
    }
    return data as EAMatchPayload[];
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError' || error.message.includes('abort')) {
      throw new Error('EA API zaman aşımına uğradı (15s). Lütfen tekrar deneyin.');
    }
    throw error;
  }
}
