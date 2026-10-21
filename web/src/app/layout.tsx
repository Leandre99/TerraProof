import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { RegistryProvider } from "@/lib/registry/context";
import { Toasts } from "@/components/ui";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["opsz"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

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
  themeColor: "#060C0A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">
        <RegistryProvider>
          {children}
          <Toasts />
        </RegistryProvider>
      </body>
    </html>
  );
}
