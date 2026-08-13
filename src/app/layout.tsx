import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { Header } from "@/components/layout/header";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Bountied — Real problems. Real bounties. Real solvers.",
  description:
    "Post a coding challenge, fund it with escrow, and pay only the solver you accept. No connects, no proposals, no formalities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable} antialiased`}>
      <body className="flex flex-col min-h-screen bg-background text-foreground">
        <Header />
        <div className="flex flex-1 flex-col min-h-0 pt-16">{children}</div>
      </body>
    </html>
  );
}