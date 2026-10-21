import type { Metadata, Viewport } from "next";
import { DM_Mono, Hanken_Grotesk, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { RegistryProvider } from "@/lib/registry/context";
import { Toasts } from "@/components/ui";

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "TerraProof — Carbon credits you can verify from space",
  description:
    "A carbon-credit registry where double counting is impossible by construction and every credit is backed by satellite evidence that keeps being checked. Built for the IEEE ClimateChain Global Hackathon.",
  openGraph: {
    title: "TerraProof",
    description: "Carbon credits you can verify from space. Double counting blocked by smart contract.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#EFEBDD",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="paper min-h-screen font-sans">
        <RegistryProvider>
          {children}
          <Toasts />
        </RegistryProvider>
      </body>
    </html>
  );
}
