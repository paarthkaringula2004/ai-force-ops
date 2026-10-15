import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/playground": ["./AIForce-Ops-Project-and-Meeting-Analysis.md"],
    "/api/epace/scaffold": ["./lib/epace/starter.html", "./node_modules/marked/lib/marked.umd.js", "./node_modules/dompurify/dist/purify.min.js"],
  },
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
