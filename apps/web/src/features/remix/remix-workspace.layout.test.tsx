import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RemixApi } from "./api";
import { RemixWorkspace } from "./remix-workspace";

const unusedMutation = async (): Promise<never> => {
  throw new Error("Mutation is not used during server rendering.");
};

const api: RemixApi = {
  listRecords: async () => [],
  listCandidates: async () => [],
  getCandidate: unusedMutation,
  listAudit: async () => [],
  generate: async () => [],
  regenerate: unusedMutation,
  reject: unusedMutation,
  apply: unusedMutation,
};

describe("remix workspace layout", () => {
  it("renders one composer without repeating route scope identifiers", () => {
    const markup = renderToStaticMarkup(
      createElement(RemixWorkspace, {
        organizationId: "organization-route-id",
        eventId: "event-route-id",
        api,
      }),
    );

    expect(markup).toContain('data-workflow="remix-composer"');
    expect(markup).not.toContain("<nav");
    expect(markup).not.toContain("organization-route-id");
    expect(markup).not.toContain("event-route-id");
  });
});
