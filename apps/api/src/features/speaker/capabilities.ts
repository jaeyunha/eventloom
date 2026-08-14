import type { SpeakerAccessScope, SpeakerPortalCapability } from "./types";

export const allSpeakerPortalCapabilities: readonly SpeakerPortalCapability[] = [
  "profile-self",
  "submission-edit",
  "roster-manage",
  "task-response",
  "asset-read",
  "asset-write",
  "asset-comment",
  "resource-read",
];

export function capabilityAllows(
  scope: Pick<SpeakerAccessScope, "capabilities" | "capabilitiesByParticipant">,
  capability: SpeakerPortalCapability,
  participantId?: string,
): boolean {
  const participantCapabilities = scope.capabilitiesByParticipant;
  if (participantId !== undefined && participantCapabilities !== undefined) {
    if (
      typeof participantCapabilities !== "object" ||
      participantCapabilities === null ||
      Array.isArray(participantCapabilities)
    ) {
      return false;
    }
    const specific = participantCapabilities[participantId];
    return (
      Array.isArray(specific) &&
      specific.every(
        (entry) =>
          typeof entry === "string" &&
          allSpeakerPortalCapabilities.includes(entry as SpeakerPortalCapability),
      ) &&
      specific.includes(capability)
    );
  }
  return (
    Array.isArray(scope.capabilities) &&
    scope.capabilities.every(
      (entry) =>
        typeof entry === "string" &&
        allSpeakerPortalCapabilities.includes(entry as SpeakerPortalCapability),
    ) &&
    scope.capabilities.includes(capability)
  );
}
