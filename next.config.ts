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
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
