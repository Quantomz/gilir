import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { readingHeadScript, skipLink } from "@/features/onboarding/head";
import "./globals.css";

// next/font downloads the files at build time and serves them from this app, so a phone never calls Google.
// The variable names differ from the --f-body and --f-display stacks in globals.css, which add the fallbacks.
const body = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-atkinson",
  display: "swap",
  // Next has no fallback metrics for this family and would warn on every build.
  adjustFontFallback: false,
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

// No maximumScale: farmers may pinch to zoom.
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
        <a className="skip" href="#main">{skipLink}</a>
        <div className="app-root">{children}</div>
      </body>
    </html>
  );
}
