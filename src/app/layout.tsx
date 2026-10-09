import type { Metadata, Viewport } from "next";
import { Geist, Playfair_Display } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

const display = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DinKin",
  description: "Live family chat, events and shared lists. No phone number needed.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "DinKin", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#7b1e33",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${display.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
