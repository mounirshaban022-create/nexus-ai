import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "40mb",
    },
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
          { key: "Permissions-Policy", value: "microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
  /* config options here */
  // Type errors now FAIL the build — the codebase typechecks clean
  // (tsc --noEmit = 0 errors) and shipping silent type regressions is how
  // the bugs in connectors.ts/email.ts survived. Keep this off.
  // reactStrictMode stays false for now: the streaming/voice effects are
  // written for single-mount semantics; revisit before enabling.
};

export default nextConfig;
