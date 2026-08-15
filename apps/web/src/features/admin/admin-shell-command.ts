import type { AdminCommandPage } from "./admin-command-palette-model";
import type { OrganizerNavigationGroup, OrganizerWorkspaceDestination } from "./admin-navigation";

export function adminCommandPages(
  pathname: string,
  workspaceDestinations: readonly OrganizerWorkspaceDestination[],
  navigationGroups: readonly OrganizerNavigationGroup[],
): readonly AdminCommandPage[] {
  return [
    ...workspaceDestinations.map((item) => ({
      current: pathname === item.href,
      group: "Organization",
      href: item.href,
      icon: item.icon,
      keywords: "organization workspace navigation",
      label: item.label,
    })),
    ...navigationGroups.flatMap((group) =>
      group.items.map((item) => ({
        current: item.match(pathname),
        group: group.label,
        href: item.href,
        icon: item.icon,
        keywords: `${group.label} organizer navigation`,
        label: item.label,
      })),
    ),
  ];
}

export function currentOrganizerPageLabel(
  pathname: string,
  navigationGroups: readonly OrganizerNavigationGroup[],
  eventScoped: boolean,
): string {
  return (
    navigationGroups.flatMap((group) => group.items).find((item) => item.match(pathname))?.label ??
    (eventScoped ? "Program overview" : "Overview")
  );
}
