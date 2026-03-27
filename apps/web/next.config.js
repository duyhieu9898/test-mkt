/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'api.dicebear.com'],
  },
  webpack: (config) => {
    config.watchOptions = {
      ignored: ['**/node_modules/**', '**/.next/**', '**/deploy/**', '**/packages/ai-tenant/**'],
    };
    return config;
  },
};

module.exports = nextConfig;
