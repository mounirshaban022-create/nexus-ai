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
  title: "NEXUS — The Agency · 255 AI Specialists",
  description:
    "Hire from an agency of 255 specialist AI agents across 17 divisions — designers, engineers, marketers, analysts and more. Each with real personality, real process, real deliverables. One conversation away.",
  keywords: [
    "AI",
    "AI agents",
    "AI agency",
    "AI specialists",
    "chatbot",
    "NEXUS",
    "The Agency",
  ],
  authors: [{ name: "NEXUS AI" }],
  icons: {
    icon: "/nexus-mark.png",
  },
  openGraph: {
    title: "NEXUS — The Agency · 255 AI Specialists",
    description:
      "Hire the entire agency — 255 specialist AI agents across 17 divisions, one conversation away.",
    siteName: "NEXUS — The Agency",
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
