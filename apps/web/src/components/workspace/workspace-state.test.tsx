import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceFormSection, WorkspaceState } from "./workspace-state";

describe("workspace state primitives", () => {
  it("renders error and form-section semantics for shared workspaces", () => {
    const markup = renderToStaticMarkup(
      <>
        <WorkspaceState
          variant="error"
          title="File metadata unavailable"
          description="Authoritative version pointers are unavailable."
        />
        <WorkspaceFormSection title="File version 2" description="Immutable file version.">
          <p>updated-deck.pdf</p>
        </WorkspaceFormSection>
      </>,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("File metadata unavailable");
    expect(markup).toContain("File version 2");
    expect(markup).toContain("updated-deck.pdf");
  });
});
