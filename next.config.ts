import type { NextConfig } from "next";
// @ts-expect-error no type declarations
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingIncludes: {
    "/**": ["./src/generated/prisma/*.so.node"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },
};

export default nextConfig;
