import type { Metadata } from "next";
import { WorkHub } from "@/features/work/work-hub";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your work",
  description:
    "Open every organizer, reviewer, and participant workspace available to this account.",
};

export default function WorkPage() {
  return <WorkHub />;
}
