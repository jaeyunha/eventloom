import type { Metadata, Viewport } from "next";
import "./landing.css";
import { LandingPage } from "@/features/landing/landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    absolute: "Eventloom — Conference program operations",
  },
  description:
    "Eventloom is open-source conference program operations, from CFP intake to a published agenda.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#111110" },
  ],
};

export default function Home() {
  return <LandingPage />;
}
