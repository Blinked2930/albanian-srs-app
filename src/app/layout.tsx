import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Quicksand } from "next/font/google";
import "./globals.css";
import BottomNav from "../components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FjalëFlow",
  description: "Learn Albanian with Spaced Repetition",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FjalëFlow",
  },
};

export const viewport: Viewport = {
  themeColor: "#FFF5F7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${quicksand.variable} antialiased bg-[#fafafa]`}
      >
        {/* Dynamic padding perfectly sizes the gap for the bottom bar */}
        <div className="pb-[calc(6rem+env(safe-area-inset-bottom))] min-h-[100dvh]">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}