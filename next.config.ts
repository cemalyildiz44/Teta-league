import type { NextConfig } from "next";

const remotePatterns: any[] = [
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
        protocol: parsedUrl.protocol.replace(':', ''),
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || '',
        pathname: '/storage/v1/object/public/**',
      });
    }
  } catch (error) {
    console.error('Invalid NEXT_PUBLIC_SUPABASE_URL', error);
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
};

export default nextConfig;
