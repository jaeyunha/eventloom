import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Inter } from "next/font/google";
import { DevToolsBadgeHider } from "@/components/dev-tools-badge-hider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Eventloom | Open program operations",
    template: "%s | Eventloom",
  },
  description:
    "Open-source program operations for conference teams: collect submissions, review with care, schedule without conflicts, and publish deliberately.",
  applicationName: "Eventloom",
  category: "conference program operations",
  creator: "Eventloom contributors",
  keywords: ["conference operations", "call for speakers", "program management", "open source"],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn("font-sans", inter.variable)}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <TooltipProvider>
            {children}
            <Toaster position="bottom-right" duration={3_000} />
            {process.env.NODE_ENV === "development" ? <DevToolsBadgeHider /> : null}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
