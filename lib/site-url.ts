/**
 * Canonical Site URL Helper
 *
 * Centralizes resolution of the base application URL for auth redirects,
 * email verification, and password recovery across production and development.
 *
 * Production Canonical: https://tetaleague.com
 */

export function getSiteUrl(): string {
  // 1. Explicitly configured public site URL
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  // 2. Production Vercel deployment URL
  const vercelProdUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProdUrl) {
    const withProtocol = vercelProdUrl.startsWith('http')
      ? vercelProdUrl
      : `https://${vercelProdUrl}`;
    return withProtocol.replace(/\/+$/, '');
  }

  // 3. Strict production fallback to canonical domain
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';

  if (isProduction) {
    return 'https://tetaleague.com';
  }

  // 4. Local development fallback
  return 'http://localhost:3000';
}

/** Public SEO origin: Vercel redirects the apex domain to www, so search engines must see www. */
export const CANONICAL_SITE_URL = 'https://www.tetaleague.com';

/**
 * Base URL for SEO output only (metadataBase, canonical, sitemap, robots, JSON-LD).
 * Auth keeps using getSiteUrl(); this only maps the apex production domain to www,
 * so localhost and other explicitly configured hosts are left as they are.
 */
export function getCanonicalSiteUrl(): string {
  const siteUrl = getSiteUrl();
  try {
    const { hostname } = new URL(siteUrl);
    if (hostname === 'tetaleague.com' || hostname === 'www.tetaleague.com') return CANONICAL_SITE_URL;
  } catch {
    return CANONICAL_SITE_URL;
  }
  return siteUrl;
}

/**
 * Returns the full callback URL for Supabase Auth redirect flows.
 * e.g. https://tetaleague.com/auth/callback?next=/sifre-yenile
 */
export function getAuthCallbackUrl(nextPath = '/'): string {
  const siteUrl = getSiteUrl();
  const safeNext = sanitizeNextUrl(nextPath);
  return `${siteUrl}/auth/callback?next=${safeNext}`;
}

/**
 * Strictly sanitizes redirect destination paths to prevent Open Redirect attacks.
 * Rejects external URLs, protocol-relative paths (//evil.com), backslashes (/\evil.com),
 * and javascript/data schemes, guaranteeing a safe relative path starting with '/'.
 */
export function sanitizeNextUrl(rawNext: string | null | undefined): string {
  if (!rawNext) return '/';

  const trimmed = rawNext.trim();
  if (!trimmed) return '/';

  // If absolute URL is passed, only permit if origin matches getSiteUrl()
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const siteUrl = getSiteUrl();
      if (parsed.origin === siteUrl) {
        return `${parsed.pathname}${parsed.search}`;
      }
      return '/';
    } catch {
      return '/';
    }
  }

  // Block protocol-relative (//evil.com), backslashes (/\evil.com or \evil),
  // and javascript/data schemes
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.includes('\\') ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('data:')
  ) {
    return '/';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
