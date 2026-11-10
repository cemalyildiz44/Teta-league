/**
 * Returns a resized avatar URL. Uploaded avatars average ~330 KB (up to 1 MB) but are shown at 20-160 px, so
 * Supabase Storage URLs are rewritten to its image transformation endpoint, which serves a small cached copy
 * (a 167 KB avatar becomes ~3 KB at 96 px). Any other URL (blob: previews, external images) is returned as-is.
 *
 * `size` is the requested pixel width/height; pass about 2x the displayed CSS size for sharp results on
 * high-density screens.
 */
const STORAGE_PUBLIC_PATH = '/storage/v1/object/public/';
const STORAGE_RENDER_PATH = '/storage/v1/render/image/public/';

export function avatarSrc(url: string | null | undefined, size = 96): string | undefined {
  if (!url) return undefined;
  if (!url.includes(STORAGE_PUBLIC_PATH) || url.includes('?')) return url;
  return `${url.replace(STORAGE_PUBLIC_PATH, STORAGE_RENDER_PATH)}?width=${size}&height=${size}&resize=cover&quality=75`;
}
