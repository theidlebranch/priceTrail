import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Instrument_Serif } from "next/font/google";
import "./docs.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "How it works · PriceTrail",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <div className={`docs-root ${instrumentSerif.variable}`}>{children}</div>;
}
