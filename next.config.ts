import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    return [
      { source: "/", headers: noReferrer },
      { source: "/:path*", headers: noReferrer },
    ];
  },
  turbopack: {
    rules: {
      "*.module.css": {
        loaders: [],
        as: "*.css",
      },
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
