import { EAMatchPayload } from './types';

const EA_API_BASE = 'https://proclubs.ea.com/api/fc/clubs/matches';

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
