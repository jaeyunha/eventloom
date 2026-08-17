export function roundDisplayLabel(name: string | null | undefined): string {
  return name?.trim() || "Selected round";
}
