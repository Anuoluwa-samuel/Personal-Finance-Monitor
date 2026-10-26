import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages render per request: the CSP nonce is generated per request and
  // financial data must never end up in a shared static shell or cache.
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
