import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Bunker Leak",
  description:
    "Check whether your Ethereum address has revealed its public key on Ethereum, L2s, alt-L1s or in public off-chain signatures. Built for Justin Drake's 'bunker mode'.",
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
