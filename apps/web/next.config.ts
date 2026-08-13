import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@eventloom/contracts"],
};

export default nextConfig;
