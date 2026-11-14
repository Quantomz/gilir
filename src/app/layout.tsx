// Stays a server component: it owns metadata, viewport, fonts and the pre-paint reading-preferences script.
// Never imported by Vitest (next/font needs the Next compiler, repo-baseline.md gotcha 37).
import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { readingHeadScript } from "@/features/onboarding/head";
import "./globals.css";

// Self-hosted at build time (a probe build self-hosted 4 woff2 files, 136 KB; repo-baseline.md gotcha 32).
// The browser never calls Google. A failed fetch fails `npm run build` (gotcha 34): open decision in rationale.md.
// Variable names differ from the prototype's --f-body/--f-display, which globals.css composes with fallbacks (gotcha 36).
const body = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
  display: "swap",
  adjustFontFallback: false, // Next has no metrics for this family (gotcha 33)
});
const display = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gilir",
  description: "One crop rotation plan for one year, from your field, your crops and the rain.",
};

// No maximumScale: farmers may pinch-zoom. Theme colours are the Mist and night backgrounds.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3F6F0" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1811" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: readingHeadScript }} />
      </head>
      <body>
        <a className="skip" href="#main">Skip to the main content</a>
        <div className="app-root">{children}</div>
      </body>
    </html>
  );
}
