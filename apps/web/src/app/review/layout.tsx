import type { ReactNode } from "react";
import { ReviewerShell } from "@/features/reviews/reviewer-shell";

export default function ReviewerLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <ReviewerShell>{children}</ReviewerShell>;
}
