import type { NextConfig } from 'next';

const cspDirectives = [
  "default-src 'self'",
  // Next.js requires inline styles for hydration and Tailwind utilities.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Material Symbols + Space Grotesk / Inter fonts.
  "font-src 'self' https://fonts.gstatic.com data:",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://api.minimax.io https://generativelanguage.googleapis.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['supr-agent-370633661485.us-central1.run.app'],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  outputFileTracingExcludes: {
    '*': ['./next.config.ts'],
  },
  transpilePackages: ['motion'],
  async headers() {
    const securityHeaders = [
      { key: 'Content-Security-Policy', value: cspDirectives },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ];
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
