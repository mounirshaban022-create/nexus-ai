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
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
