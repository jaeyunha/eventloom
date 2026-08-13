import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist } from "next/font/google";
import { DevToolsBadgeHider } from "@/components/dev-tools-badge-hider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Open Sessionboard | Open program operations",
    template: "%s | Open Sessionboard",
  },
  description:
    "Source-available program operations for conference teams: collect submissions, review with care, schedule without conflicts, and publish deliberately.",
  applicationName: "Open Sessionboard",
  category: "conference program operations",
  creator: "Open Sessionboard contributors",
  keywords: [
    "conference operations",
    "call for speakers",
    "program management",
    "source available",
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable)}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            {children}
            <Toaster />
            {process.env.NODE_ENV === "development" ? <DevToolsBadgeHider /> : null}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
