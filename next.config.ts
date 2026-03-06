import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/**": ["./src/generated/prisma/*.so.node", "./src/generated/prisma/*.wasm"],
  },
};

export default nextConfig;
