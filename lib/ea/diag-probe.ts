import https from 'node:https';

/**
 * GEÇİCİ TEŞHİS (Preview): EA 403 sorununda istemci farkını izole etmek için iki ayrı Node istemcisiyle
 * AYNI isteği (aynı URL, aynı başlıklar) tek seferde gönderir. Üretim akışına (lib/ea/client.ts) bağlı değildir.
 * Test bitince bu dosya ve app/api/diag/ea-https/route.ts silinmelidir.
 *
 * Güvenlik: yalnızca durum, içerik türü, sunucu adı, süre, gövde boyutu ve Akamai referansı döner.
 * İstek/yanıt başlıklarının tamamı, çerezler ve gövde metni döndürülmez ve loglanmaz.
 */

// lib/ea/client.ts içindeki başlıklarla aynı (kasıtlı kopya; client.ts'e dokunulmaz).
export const EA_DIAG_HEADERS: Readonly<Record<string, string>> = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': 'https://www.ea.com',
  'Referer': 'https://www.ea.com/',
};

export const EA_DIAG_TIMEOUT_MS = 15000;
const BODY_READ_LIMIT = 4096;

export interface ProbeResult {
  client: 'fetch' | 'https.request';
  status: number | null;
  contentType: string | null;
  server: string | null;
  durationMs: number;
  bodyBytes: number;
  akamaiReference: string | null;
  errorCode: string | null;
}

/** Akamai "Reference #18.4a2c1d02.1700000000.abc" desenini ayıklar; bulunamazsa null. */
export function extractAkamaiReference(text: string): string | null {
  const match = /Reference\s*#\s*([0-9A-Za-z.]{1,80})/.exec(text);
  return match ? match[1] : null;
}

function emptyResult(client: ProbeResult['client']): ProbeResult {
  return { client, status: null, contentType: null, server: null, durationMs: 0, bodyBytes: 0, akamaiReference: null, errorCode: null };
}

function errorCodeOf(error: unknown): string {
  const e = error as { code?: unknown; cause?: { code?: unknown }; name?: unknown } | null;
  if (typeof e?.code === 'string') return e.code;
  if (typeof e?.cause?.code === 'string') return e.cause.code;
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return 'ETIMEDOUT';
  return typeof e?.name === 'string' ? e.name : 'UNKNOWN';
}

/** A: Node global fetch (undici) — lib/ea/client.ts ile aynı seçenekler. */
export async function probeFetch(url: string, timeoutMs = EA_DIAG_TIMEOUT_MS): Promise<ProbeResult> {
  const result = emptyResult('fetch');
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { ...EA_DIAG_HEADERS },
      cache: 'no-store',
      signal: controller.signal,
    });
    result.status = response.status;
    result.contentType = response.headers.get('content-type');
    result.server = response.headers.get('server');

    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (reader) {
      while (total < BODY_READ_LIMIT) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.byteLength;
      }
      await reader.cancel().catch(() => undefined);
    }
    result.bodyBytes = total;
    result.akamaiReference = extractAkamaiReference(Buffer.concat(chunks).toString('utf8').slice(0, BODY_READ_LIMIT));
  } catch (error) {
    result.errorCode = errorCodeOf(error);
  } finally {
    clearTimeout(timer);
    result.durationMs = Date.now() - started;
  }
  return result;
}

/** B: standart Node https.request — aynı URL ve aynı başlıklar, ek başlık/TLS ayarı yok. */
export function probeHttps(url: string, timeoutMs = EA_DIAG_TIMEOUT_MS): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const result = emptyResult('https.request');
    const started = Date.now();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      result.durationMs = Date.now() - started;
      resolve(result);
    };

    let req: ReturnType<typeof https.request>;
    try {
      req = https.request(url, { method: 'GET', headers: { ...EA_DIAG_HEADERS }, timeout: timeoutMs }, (res) => {
        result.status = res.statusCode ?? null;
        const header = (name: string) => {
          const v = res.headers[name];
          return Array.isArray(v) ? v.join(', ') : v ?? null;
        };
        result.contentType = header('content-type');
        result.server = header('server');

        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          if (total >= BODY_READ_LIMIT) return;
          chunks.push(chunk);
          total += chunk.length;
          if (total >= BODY_READ_LIMIT) res.destroy();
        });
        const done = () => {
          result.bodyBytes = total;
          result.akamaiReference = extractAkamaiReference(Buffer.concat(chunks).toString('utf8').slice(0, BODY_READ_LIMIT));
          finish();
        };
        res.on('end', done);
        res.on('close', done);
        res.on('error', () => done()); // gövde okuma hatası durum bilgisini silmez
      });
    } catch (error) {
      result.errorCode = errorCodeOf(error);
      finish();
      return;
    }

    req.on('timeout', () => {
      result.errorCode = 'ETIMEDOUT';
      req.destroy();
    });
    req.on('error', (error) => {
      if (!result.errorCode) result.errorCode = errorCodeOf(error);
      finish();
    });
    req.end();
  });
}
