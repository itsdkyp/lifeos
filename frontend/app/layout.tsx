import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "LifeOS",
  description: "Your life, tracked and reflected on.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "LifeOS", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  // Do NOT set maximumScale/userScalable=no: WCAG 1.4.4 forbids blocking pinch-zoom.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
