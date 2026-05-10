import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { AppProviders } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spotless",
  description: "Spotless helps scan and clean duplicate Spotify playlist tracks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppProviders>
          <div className="flex min-h-full flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-zinc-200 bg-zinc-50/60 px-6 py-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p>
                  Spotless™ is a trademark of Shankho. All rights reserved.
                </p>
                <div className="flex items-center gap-4">
                  <a href="mailto:basu.net@gmail.com" className="hover:underline">
                    basu.net@gmail.com
                  </a>
                  <Link href="/support" className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                    Buy Me a Coffee
                  </Link>
                </div>
              </div>
            </footer>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
