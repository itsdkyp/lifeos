import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787",
  },
  // Tree-shake per-icon and per-chart imports so we don't ship the whole library
  // on every route. Net effect: much smaller JS bundles on cold load.
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react"],
  },
};
export default nextConfig;
