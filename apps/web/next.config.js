/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
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
