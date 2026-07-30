import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Kept for backwards-compatible dev runs where the two processes still live on
    // separate ports. In the consolidated Docker image the rewrite below takes over
    // and the browser talks same-origin to /_lifeos-api.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
  },
  // Same-origin proxy: browser calls /_lifeos-api/... , Next.js forwards to the
  // Hono backend running on 127.0.0.1:8787 inside the same container. The backend
  // is never exposed to the outside, so no CORS or reverse-proxy config needed.
  async rewrites() {
    const backend = process.env.LIFEOS_BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8787";
    return [
      { source: "/_lifeos-api/:path*", destination: `${backend}/:path*` },
    ];
  },
  // Tree-shake per-icon and per-chart imports so we don't ship the whole library
  // on every route. Net effect: much smaller JS bundles on cold load.
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react"],
  },
};
export default nextConfig;
