import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
      // Legacy backend paths during migration
      {
        source: "/api/auth/:path*",
        destination: `${backendUrl}/api/auth/:path*`,
      },
      {
        source: "/api/wallet/:path*",
        destination: `${backendUrl}/api/wallet/:path*`,
      },
      {
        source: "/api/bets/:path*",
        destination: `${backendUrl}/api/bets/:path*`,
      },
      {
        source: "/api/catalog/:path*",
        destination: `${backendUrl}/api/catalog/:path*`,
      },
    ];
  },
};

export default nextConfig;
