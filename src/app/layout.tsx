import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DinKin",
  description: "Live family chat, events and shared lists. No phone number needed.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "DinKin", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#e2683c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
