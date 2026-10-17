import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    deploymentId: process.env.NEXT_DEPLOYMENT_ID || process.env.RENDER_GIT_COMMIT,
    outputFileTracingIncludes: {
        "/api/playground": ["./AIForce-Ops-Project-and-Meeting-Analysis.md"],
        "/api/epace/scaffold": [
            "./lib/epace/starter.html",
            "./node_modules/marked/lib/marked.umd.js",
            "./node_modules/dompurify/dist/purify.min.js",
        ],
    },
    serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
    turbopack: {
        root: process.cwd(),
    },
};

export default nextConfig;
