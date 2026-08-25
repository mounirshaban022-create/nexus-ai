import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Sans_Arabic } from "next/font/google";
import { ThemeProvider } from "next-themes";
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

// Arabic — IBM Plex Sans Arabic (complete RTL UI font, beautiful Naskh)
// Applied automatically when <html lang="ar"> (see globals.css).
const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
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
  // Inline pre-hydration script: applies the persisted Arabic (RTL)
  // preference BEFORE React mounts so <html dir/lang> is correct on
  // first paint (no LTR→RTL flash). next-themes runs its own
  // pre-hydration script to set the `.dark` class on <html> from its
  // own `theme` localStorage key, so we no longer touch the dark class
  // here — that's the single source of truth for theme now.
  // Matches the same key + shape used by src/lib/preferences.ts.
  const themeBootScript = `
    (function(){
      try {
        var raw = localStorage.getItem('nexus-preferences');
        if (!raw) return;
        var s = JSON.parse(raw).state;
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
        className={`${inter.variable} ${spaceGrotesk.variable} ${ibmPlexArabic.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
