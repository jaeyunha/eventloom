import type { Metadata } from "next";
import { AccountHub } from "@/features/account/account-hub";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your work",
  description: "Open every organizer, review, proposal, and speaker workspace for this account.",
};

export default function WorkPage() {
  return <AccountHub />;
}
