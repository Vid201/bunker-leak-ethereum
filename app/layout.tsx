import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN, SITE_TITLE, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Origin only: Next adds basePath itself to file-based metadata such as opengraph-image.png.
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: `${SITE_URL}/`,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  // Google Search Console ownership check.
  verification: { google: "WAdZYlB3Gay19Zld0FVKEJARiPMn0STT4SfVssw5fyg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <div className="border-b border-border bg-surface-2 px-4 py-2 text-center text-xs leading-relaxed text-muted">
          <span className="font-medium text-text">Frontend-only, nothing stored.</span> Everything runs in your browser.
          There&apos;s no backend, and lookups go straight to public blockchain APIs. Check results are not saved. Optional API keys
          stay in this browser only.
        </div>
        {children}
      </body>
    </html>
  );
}
