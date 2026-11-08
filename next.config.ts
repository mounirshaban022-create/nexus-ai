import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow the sandbox preview host to load Next.js dev resources (fonts, HMR).
  allowedDevOrigins: ["space-z.ai"],
  experimental: {
    serverActions: {
      bodySizeLimit: "40mb",
    },
    // Sandbox has 4GB total RAM — without a cap the Turbopack dev process
    // climbs past 1.6GB and the kernel OOM-killer terminates it mid-request
    // (users see "Network error" and every feature appears broken).
    // Cap Turbopack at ~1.5GB and let the dev script cap the V8 heap too.
    turbopackMemoryLimit: 1536,
  },
  // ffmpeg-static / ffprobe-static ship platform binaries resolved via
  // __dirname — keep them external so the binaries survive serverless
  // bundling (video generation works on Vercel with zero system ffmpeg).
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "msedge-tts"],
  // Bundle the caption font with the video route's serverless function —
  // output tracing doesn't see fs-path reads at runtime, so include it
  // explicitly (drawtext fails without a font file).
  outputFileTracingIncludes: {
    'src/app/api/video/create/route.ts': ['./assets/fonts/**'],
  },
  // Security headers applied to every response. NOTE: intentionally NO
  // X-Frame-Options / frame-ancestors — the app must stay embeddable in
  // the preview iframe.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // microphone=* — the preview panel embeds the app in a cross-origin
          // iframe; (self) would hard-block mic access there and drop every
          // voice call into captions-only mode. Still gated by the iframe's
          // own allow="microphone" attribute.
          { key: "Permissions-Policy", value: "microphone=*, geolocation=()" },
          // SECURITY (audit M7): report-only CSP — observes violations without
          // breaking the app while we tune the policy. Backstops the OAuth
          // result-page HTML builder and any future injection bug.
          {
            key: "Content-Security-Policy-Report-Only",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; " +
              "media-src 'self' data: blob: https:; font-src 'self' data: https:; " +
              "connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; " +
              "form-action 'self'; frame-ancestors *",
          },
        ],
      },
    ];
  },
  /* config options here */
  typescript: {
    // Type errors MUST fail the build (audit finding: silent type breakage).
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
