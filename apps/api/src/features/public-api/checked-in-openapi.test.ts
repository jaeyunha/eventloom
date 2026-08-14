import { describe, expect, it } from "vitest";
import checkedInOpenApi from "../../../../../openapi/openapi.yaml?raw";

function componentSchema(name: string): string {
  const match = new RegExp(`^    ${name}:\\n([\\s\\S]*?)(?=^    [A-Za-z0-9]+:|\\Z)`, "m").exec(
    checkedInOpenApi,
  );
  if (match === null) {
    throw new Error(`OpenAPI component schema is missing: ${name}`);
  }
  return match[1] ?? "";
}

describe("checked-in OpenAPI defaults", () => {
  it("accepts operator-configured communication sender email addresses", () => {
    const sender = componentSchema("CommunicationSender");

    expect(sender).toContain("type: string");
    expect(sender).toContain("format: email");
    expect(sender).not.toContain("enum:");
    expect(sender).not.toContain("sessionboard.namuh.co");
  });
});
