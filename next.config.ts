import type { NextConfig } from "next";

type RemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

const remotePatterns: RemotePattern[] = [
  {
    protocol: 'http',
    hostname: '127.0.0.1',
    port: '54321',
    pathname: '/storage/v1/object/public/**',
  },
  {
    protocol: 'http',
    hostname: 'localhost',
    port: '54321',
    pathname: '/storage/v1/object/public/**',
  }
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (supabaseUrl) {
  try {
    const parsedUrl = new URL(supabaseUrl);
    if (parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') {
      remotePatterns.push({
        protocol: parsedUrl.protocol.replace(':', '') as 'http' | 'https',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || '',
        pathname: '/storage/v1/object/public/**',
      });
    }
  } catch (error) {
    console.error('Invalid NEXT_PUBLIC_SUPABASE_URL', error);
  }
}

// Sent on every response. frame-ancestors / X-Frame-Options stop other sites from embedding the site in a
// hidden frame (clickjacking); the site's own outgoing embeds (stream players) are not affected.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
