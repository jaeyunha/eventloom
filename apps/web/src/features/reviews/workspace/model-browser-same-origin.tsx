export function browserSameOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}
