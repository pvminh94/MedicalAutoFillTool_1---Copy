/** @type {import('next').NextConfig} */
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

/** Cấu hình Next.js: chuyển tiếp mọi lời gọi /api và /health sang máy chủ NestJS. */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_PROXY_TARGET}/api/:path*` },
      { source: '/health', destination: `${API_PROXY_TARGET}/health` },
    ];
  },
};

export default nextConfig;
