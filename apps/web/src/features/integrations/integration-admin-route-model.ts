import type { SupportedIntegrationSection } from "./integration-admin";

export function integrationSectionFromPathname(pathname: string): SupportedIntegrationSection {
  const segment = pathname.split("/").filter(Boolean).at(-1);
  switch (segment) {
    case "api-keys":
      return "api-keys";
    case "webhooks":
      return "webhooks";
    case "delivery":
      return "delivery";
    default:
      return "overview";
  }
}
