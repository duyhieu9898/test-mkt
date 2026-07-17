const path = require('path');
const { createRequire } = require('module');

const requireFromNext = createRequire(require.resolve('next/package.json'));
const { loadEnvConfig } = requireFromNext('@next/env');

// The web app runs from apps/web, while the monorepo keeps shared env values at the root.
loadEnvConfig(
  path.resolve(__dirname, '../..'),
  process.env.NODE_ENV !== 'production',
  console,
  true
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1').replace(/\/api\/v1\/?$/, '');
    return [
      {
        source: '/images/:path*',
        destination: `${apiBase}/images/:path*`,
      },
    ];
  },
  images: {
    domains: ['localhost', 'api.dicebear.com', '1person.bap-software.net'],
  },
  webpack: (config) => {
    config.watchOptions = {
      ignored: ['**/node_modules/**', '**/.next/**', '**/deploy/**', '**/packages/ai-tenant/**'],
    };
    return config;
  },
};

module.exports = nextConfig;
