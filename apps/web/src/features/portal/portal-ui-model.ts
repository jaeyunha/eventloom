import type { PortalAssetState } from "./types";

/** Legacy route inventory retained for callers that still inspect the portal destinations. */
export const portalNavigation = [
  { href: "/portal", label: "My events", icon: "⌂" },
  { href: "/portal/submissions", label: "Submissions", icon: "▤" },
  { href: "/portal/tasks", label: "Tasks", icon: "✓" },
  { href: "/portal/profile", label: "Profile", icon: "◉" },
  { href: "/portal?workspace=co-speakers", label: "Sessions", icon: "◎" },
  { href: "/portal?workspace=files", label: "Files", icon: "▱" },
  { href: "/portal?workspace=resources", label: "Event guide", icon: "◇" },
] as const;
const PORTAL_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function portalNavigationItemActive(
  href: string,
  pathname: string,
  workspace: string | null,
): boolean {
  const workspaceMatch = href.match(/[?&]workspace=([^&]+)/);
  if (workspaceMatch?.[1] !== undefined) {
    return pathname === "/portal" && workspace === workspaceMatch[1];
  }
  if (href === "/portal") return pathname === "/portal" && workspace === null;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type PortalContentAvailability =
  | "loading"
  | "unavailable"
  | "no-participant"
  | "stale"
  | "ready";

export function portalContentAvailability(input: {
  readonly loading: boolean;
  readonly error: string | null;
  readonly hasView: boolean;
}): PortalContentAvailability {
  if (input.loading && !input.hasView) return "loading";
  if (input.error !== null && !input.hasView) return "unavailable";
  if (!input.hasView) return "no-participant";
  return input.error === null ? "ready" : "stale";
}

export function formatPortalDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return PORTAL_DATE_FORMATTER.format(date);
}

export function formatPortalFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return "Unknown size";
  if (sizeBytes < 1_024) return `${sizeBytes.toLocaleString()} B`;
  const units = ["KiB", "MiB", "GiB"] as const;
  let value = sizeBytes;
  let unit: (typeof units)[number] = units[0];
  for (const candidate of units) {
    unit = candidate;
    value /= 1_024;
    if (value < 1_024 || candidate === units.at(-1)) break;
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
}

export function portalAssetStateLabel(state: PortalAssetState): string {
  return { pending_upload: "Processing upload", ready: "Uploaded", rejected: "Upload failed" }[
    state
  ];
}
