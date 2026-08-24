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
    icon: "/nexus-mark.png",
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
  // Inline pre-hydration script: reads the persisted preferences from
  // localStorage BEFORE React mounts, so the <html> dir/lang + dark class
  // are correct on first paint — eliminates the LTR→RTL + light→dark
  // flash that would otherwise occur for Arabic / dark-mode users.
  // Matches the same key + shape used by src/lib/preferences.ts.
  const themeBootScript = `
    (function(){
      try {
        var raw = localStorage.getItem('nexus-preferences');
        if (!raw) return;
        var s = JSON.parse(raw).state;
        if (s && s.theme === 'dark') document.documentElement.classList.add('dark');
        if (s && s.language === 'ar') {
          document.documentElement.setAttribute('dir', 'rtl');
          document.documentElement.setAttribute('lang', 'ar');
        }
      } catch (e) {}
    })();
  `;
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body
        className={`${inter.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
