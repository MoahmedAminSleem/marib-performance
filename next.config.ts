import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  /* pg (Neon, production) + PGlite (local dev WASM Postgres) must stay
     external so the bundler never tries to inline the driver/wasm */
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  /* the sandbox preview proxy talks to the dev server cross-origin */
  allowedDevOrigins: ["*.space-z.ai"],
};

export default nextConfig;
