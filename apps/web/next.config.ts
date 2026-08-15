import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  instrumentationClientInject: ["./src/lib/api-navigation-cache-bootstrap.ts"],
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@eventloom/contracts"],
};

export default nextConfig;
