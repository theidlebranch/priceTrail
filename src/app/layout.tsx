import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "PriceTrail · AI model pricing, with receipts",
  description:
    "An independently maintained historical record of AI API prices, backed by provider sources and archived evidence.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
