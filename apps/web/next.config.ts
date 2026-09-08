import type { NextConfig } from "next";

// Security headers applied to every response. These are cheap, well-known
// mitigations (clickjacking, MIME sniffing, referrer leakage) that a
// from-scratch app very commonly forgets.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@kdp/db", "@kdp/shared", "@kdp/generator-grid-mystery"],
  // sharp has native binaries (libvips) that must not be re-bundled by
  // Turbopack — bundling drops the .node file and the module fails to load
  // at runtime with an opaque error. Marking it external tells Next to
  // require() it from node_modules at runtime instead, where its prebuilt
  // linux-x64-gnu binary (installed by pnpm) actually lives. Well-known
  // Vercel-serverless gotcha; the fix is a one-liner.
  serverExternalPackages: ["sharp"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
