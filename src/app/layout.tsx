import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Open WebUI uses Inter — their exact choice
const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NEXUS AI — One AI. Infinite connections.",
  description:
    "The AI super app: an autonomous agent with live connectors, plus chat, image generation, vision, voice, web search and page reading — all in one place.",
  keywords: [
    "AI",
    "AI agent",
    "connectors",
    "chatbot",
    "image generation",
    "vision AI",
    "text to speech",
    "speech to text",
    "web search",
    "NEXUS AI",
  ],
  authors: [{ name: "NEXUS AI" }],
  icons: {
    icon: "/nexus-logo.svg",
  },
  openGraph: {
    title: "NEXUS AI — One AI. Infinite connections.",
    description: "Chat, images, vision, voice, search, reading and an autonomous connector agent.",
    siteName: "NEXUS AI",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf9f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body
        className={`${inter.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
