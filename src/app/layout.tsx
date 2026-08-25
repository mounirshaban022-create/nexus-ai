import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Open WebUI uses Inter — their exact choice (body font)
const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// The Agency — display font for headings/logo (Space Grotesk)
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NEXUS — One AI. Every superpower.",
  description:
    "One premium chat with 255 AI specialists that auto-take-over: images, videos, documents (Word/Excel/PDF), code, CLI, live browser, email, WhatsApp and voice — real results in one conversation.",
  keywords: [
    "AI",
    "AI agents",
    "AI agency",
    "AI specialists",
    "chatbot",
    "NEXUS",
    "ChatGPT alternative",
  ],
  authors: [{ name: "NEXUS AI" }],
  icons: {
    icon: "/brand/nexus-icon.png",
  },
  openGraph: {
    title: "NEXUS — One AI. Every superpower.",
    description:
      "One chat. 255 specialists. Images, videos, documents, code, browser, email, WhatsApp and voice.",
    siteName: "NEXUS",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
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
        className={`${inter.variable} ${spaceGrotesk.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
