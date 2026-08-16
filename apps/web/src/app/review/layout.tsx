import type { ReactNode } from "react";
import { AuthenticatedRouteGuard } from "@/features/auth/authenticated-route-guard";
import { ReviewerShell } from "@/features/reviews/reviewer-shell";

export default function ReviewerLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AuthenticatedRouteGuard>
      <ReviewerShell>{children}</ReviewerShell>
    </AuthenticatedRouteGuard>
  );
}
