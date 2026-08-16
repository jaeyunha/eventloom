import { History, ListChecks, MapPin, Tags } from "lucide-react";
import type { ComponentType } from "react";

export type EventSettingsSection = "workflow" | "rooms" | "classification" | "history";

export interface EventSettingsSectionDefinition {
  readonly id: EventSettingsSection;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly group: "Event setup" | "Governance";
  readonly icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

export const eventSettingsSections = [
  {
    id: "workflow",
    label: "Session workflow",
    shortLabel: "Workflow",
    description: "Statuses and private agenda eligibility.",
    group: "Event setup",
    icon: ListChecks,
  },
  {
    id: "rooms",
    label: "Rooms and venues",
    shortLabel: "Rooms",
    description: "Capacity and resources for agenda spaces.",
    group: "Event setup",
    icon: MapPin,
  },
  {
    id: "classification",
    label: "Session classification",
    shortLabel: "Classification",
    description: "Tracks, formats, levels, and optional tags.",
    group: "Event setup",
    icon: Tags,
  },
  {
    id: "history",
    label: "Change history",
    shortLabel: "History",
    description: "Audited configuration changes and revision details.",
    group: "Governance",
    icon: History,
  },
] as const satisfies readonly EventSettingsSectionDefinition[];

const eventSettingsSectionIds = new Set<EventSettingsSection>(
  eventSettingsSections.map(({ id }) => id),
);

export function resolveEventSettingsSection(
  value: string | undefined,
): EventSettingsSection | null {
  if (!value || !eventSettingsSectionIds.has(value as EventSettingsSection)) return null;
  return value as EventSettingsSection;
}

export function eventSettingsSectionHref(
  organizationId: string,
  eventId: string,
  section: EventSettingsSection,
): string {
  return `/admin/organizations/${organizationId}/events/${eventId}/settings/${section}`;
}

export function eventSettingsSectionDefinition(
  section: EventSettingsSection,
): EventSettingsSectionDefinition {
  const definition = eventSettingsSections.find(({ id }) => id === section);
  if (!definition) {
    throw new Error(`Unsupported event settings section: ${section}`);
  }
  return definition;
}
