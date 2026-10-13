import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static: every check runs in the visitor's browser, so this can be hosted anywhere (Vercel, GitHub Pages, IPFS).
  output: "export",
  // GitHub Pages project sites live under /<repo-name>; the deploy workflow sets this. Empty for local dev or a custom domain.
  basePath: process.env.PAGES_BASE_PATH || undefined,
  // Emit check/index.html instead of check.html so /check/ works on any static host.
  trailingSlash: true,
  turbopack: {
    rules: {
      "*.css": {
        // Only our own CSS: running node_modules CSS modules (react-tweet) through this breaks their class names.
        condition: { not: "foreign" },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
