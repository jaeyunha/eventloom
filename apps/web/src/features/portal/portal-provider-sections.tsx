"use client";

import type { ReactNode } from "react";

/**
 * Keeps the provider's context boundary separate from its orchestration hook. The caller owns the
 * context instance so this child remains reusable without duplicating the public portal context.
 */
export function PortalProviderBoundary({
  children,
  render,
}: Readonly<{
  readonly children: ReactNode;
  readonly render: (children: ReactNode) => ReactNode;
}>) {
  return render(children);
}
