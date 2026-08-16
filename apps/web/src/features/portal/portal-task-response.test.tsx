import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PortalTaskResponseField } from "./portal-task-response-field";
import {
  firstInvalidFieldId,
  responseFieldErrors,
  returnedOrganizerFeedback,
} from "./portal-task-response-model";
import type { PortalFormField } from "./types";

function field(overrides: Partial<PortalFormField> = {}): PortalFormField {
  return {
    id: "speaker-email",
    label: "Speaker email",
    type: "email",
    required: true,
    options: [],
    ...overrides,
  };
}

describe("portal task form lifecycle", () => {
  it("allows incomplete drafts but returns field-specific submit errors in form order", () => {
    const fields = [
      field(),
      field({ id: "bio", label: "Biography", type: "textarea" }),
      field({ id: "topics", label: "Topics", type: "multiselect" }),
    ];
    const errors = responseFieldErrors(fields, {
      "speaker-email": "not-an-email",
      bio: "",
      topics: [],
    });

    expect(errors).toEqual({
      "speaker-email": "Enter a valid email address.",
      bio: "Biography is required.",
      topics: "Topics is required.",
    });
    expect(firstInvalidFieldId(fields, errors)).toBe("speaker-email");
  });

  it("connects field errors with aria-invalid and aria-describedby", () => {
    const markup = renderToStaticMarkup(
      <PortalTaskResponseField
        field={field()}
        answer="bad"
        busy={false}
        error="Enter a valid email address."
        controlRef={createRef<HTMLInputElement>()}
        onChange={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="task-field-speaker-email-error"');
    expect(markup).toContain('id="task-field-speaker-email-error"');
  });

  it("does not render organizer feedback unless the response was actually returned", () => {
    const feedback = "Please add your emergency contact.";
    const returned = { status: "needs_changes", organizerFeedback: feedback } as const;
    const submitted = { status: "submitted", organizerFeedback: feedback } as const;

    expect(returnedOrganizerFeedback(returned as never)).toBe(feedback);
    expect(returnedOrganizerFeedback(submitted as never)).toBeNull();
  });
});
