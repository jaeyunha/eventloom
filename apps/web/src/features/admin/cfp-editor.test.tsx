import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CfpApi } from "../cfp/api";
import {
  CfpEditor,
  cfpActiveSectionThreshold,
  cfpSectionScrollOffset,
  closeCfpNowConfiguration,
  closeCfpNowInstant,
  configurationFromServer,
  createSeededCfpConfiguration,
  isCfpCloseDatePast,
  persistCfpConfiguration,
  selectEditorForm,
  summarizeRule,
  toFormConfiguration,
  validateCfpDateRange,
} from "./cfp-editor";

describe("CFP editor", () => {
  it("keeps sticky section targets below the organizer header and navigator", () => {
    expect(cfpSectionScrollOffset(52, 64)).toBe(132);
    expect(cfpActiveSectionThreshold(52, 64)).toBe(156);
  });

  it("renders an accessible organizer hierarchy and labeled seeded controls", () => {
    const markup = renderToStaticMarkup(
      createElement(CfpEditor, { eventId: "summit-2026", organizationId: "organization-1" }),
    );

    expect(markup).toContain("<h1>Configure your call for proposals</h1>");
    expect(markup).toContain('id="event-details-heading">Event details</h2>');
    expect(markup).toContain('aria-label="Event and CFP configuration"');
    expect(markup).toContain('for="event-name"');
    expect(markup).toContain('for="event-timezone"');
    expect(markup).toContain("Eventloom Summit 2026");
    expect(markup).toContain("America/Los_Angeles");
    expect(markup).toContain("2026-03-31");
  });
  it("exposes copy and open actions only when the public slug is authoritative", () => {
    const previousRuntimeProfile = process.env.NEXT_PUBLIC_RUNTIME_PROFILE;
    process.env.NEXT_PUBLIC_RUNTIME_PROFILE = "fixture";
    try {
      const markup = renderToStaticMarkup(
        createElement(CfpEditor, { eventId: "summit-2026", organizationId: "organization-1" }),
      );
      expect(markup).toContain("Copy public link");
      expect(markup).toContain("View public form");
    } finally {
      process.env.NEXT_PUBLIC_RUNTIME_PROFILE = previousRuntimeProfile;
    }
  });
  it("renders one responsive section navigator and an explicit publish confirmation", () => {
    const markup = renderToStaticMarkup(
      createElement(CfpEditor, { eventId: "summit-2026", organizationId: "organization-1" }),
    );

    expect(markup).toContain('aria-label="CFP workspace sections"');
    expect(markup).toContain('aria-current="location"');
    expect(markup).toContain('aria-controls="public-preview"');
    expect(markup).toContain('data-slot="collapsible"');
    expect(markup).toContain("Current section");
    expect(markup).toContain(">Publish form</button>");
  });

  it("exposes useful limits and applicant-facing configuration controls", () => {
    const markup = renderToStaticMarkup(
      createElement(CfpEditor, { eventId: "summit-2026", organizationId: "organization-1" }),
    );

    expect(markup).toContain('id="participant-limit"');
    expect(markup).toContain('max="15"');
    expect(markup).toContain("Up to 15 participants");
    expect(markup).toContain('id="form-limit"');
    expect(markup).toContain('max="20"');
    expect(markup).toContain("between 1 and 20 forms");
    expect(markup).toContain("Send reminder emails");
    expect(markup).toContain("Notify admins of new submissions");
    expect(markup).toContain("Tracks");
    expect(markup).toContain("Helpful links");
    expect(markup).toContain("Required");
    expect(markup).toContain("Visible");
  });
  it("validates date ordering and exposes past-close consequences", () => {
    expect(validateCfpDateRange("2026-08-10", "2026-08-10")).toBe(
      "The close date must be after the open date.",
    );
    expect(validateCfpDateRange("not-a-date", "2026-08-10")).toBe(
      "Enter valid open and close dates.",
    );
    expect(isCfpCloseDatePast("2026-08-01", new Date("2026-08-10T00:00:00.000Z"))).toBe(true);

    const markup = renderToStaticMarkup(
      createElement(CfpEditor, { eventId: "summit-2026", organizationId: "organization-1" }),
    );
    expect(markup).toContain("Public visitors see the closed portal");
    expect(markup).toContain('id="confirm-past-close"');
  });
  it("computes a server close-now instant without violating the open boundary", () => {
    const now = new Date("2026-08-10T13:46:51.000Z");
    expect(closeCfpNowInstant("2026-08-01", now)).toBe(now.toISOString());
    expect(closeCfpNowInstant("2026-08-20", now)).toBe("2026-08-20T00:00:00.001Z");

    const configuration = createSeededCfpConfiguration("devflow-conf-2027");
    configuration.opensAt = "2027-01-01";
    const closed = closeCfpNowConfiguration(configuration, now);
    expect(closed.closesAt).toBe("2027-01-01T08:00:00.001Z");
    expect(Date.parse(closed.closesAt)).toBeGreaterThanOrEqual(
      Date.parse(`${configuration.opensAt}T00:00:00.000Z`),
    );
  });

  it("only reports a CFP save after event and form persistence both resolve", async () => {
    const configuration = createSeededCfpConfiguration("devflow-conf-2027");
    configuration.opensAt = "2027-01-01";
    configuration.closesAt = "2027-02-01";
    configuration.id = "devflow-cfp";
    configuration.eventVersion = 3;
    configuration.formVersion = 4;
    const calls: string[] = [];
    const savedEvent = {
      id: "devflow-conf-2027",
      tenantId: "organization-1",
      version: 4,
      slug: "devflow-conf-2027",
      name: configuration.eventName,
      timezone: configuration.timezone,
      opensAt: "2027-01-01T00:00:00.000Z",
      closesAt: "2027-02-14T00:00:00.000Z",
    };
    const savedForm = {
      ...toFormConfiguration(configuration, "organization-1", "devflow-conf-2027"),
      version: 5,
      status: "draft" as const,
    };
    const api = {
      saveEvent: async () => {
        calls.push("event");
        return savedEvent;
      },
      saveForm: async () => {
        calls.push("form");
        return savedForm;
      },
    } as unknown as CfpApi;

    await expect(
      persistCfpConfiguration(api, {
        configuration,
        organizationId: "organization-1",
        eventId: "devflow-conf-2027",
        formId: "devflow-cfp",
      }),
    ).resolves.toEqual({ event: savedEvent, form: savedForm });
    expect(calls).toEqual(["event", "form"]);
    expect(configurationFromServer(configuration, savedEvent, savedForm).closesAt).toBe(
      "2027-02-14",
    );

    const partialApi = {
      saveEvent: async () => savedEvent,
      saveForm: async () => {
        throw new Error("form persistence failed");
      },
    } as unknown as CfpApi;
    await expect(
      persistCfpConfiguration(partialApi, {
        configuration,
        organizationId: "organization-1",
        eventId: "devflow-conf-2027",
        formId: "devflow-cfp",
      }),
    ).rejects.toThrow("form persistence failed");
  });

  it("shows nested AND/OR condition logic in the rule preview", () => {
    const markup = renderToStaticMarkup(
      createElement(CfpEditor, { eventId: "summit-2026", organizationId: "organization-1" }),
    );

    expect(
      summarizeRule({
        type: "group",
        operator: "AND",
        conditions: [
          { type: "condition", field: "Format", operator: "is", value: "Workshop" },
          {
            type: "group",
            operator: "OR",
            conditions: [
              { type: "condition", field: "Track", operator: "is", value: "Community" },
              { type: "condition", field: "Level", operator: "is", value: "Introductory" },
            ],
          },
        ],
      }),
    ).toBe("(Format is Workshop AND (Track is Community OR Level is Introductory))");
    expect(markup).toContain("Nested condition preview");
    expect(markup).toContain("Format");
    expect(markup).toContain("Workshop · 60 minutes");
    expect(markup).toContain("AND");
    expect(markup).toContain("OR");
    expect(markup).toContain("Accessibility notes");
  });

  it("renders a semantic public form preview that mirrors seeded copy and options", () => {
    const markup = renderToStaticMarkup(
      createElement(CfpEditor, { eventId: "summit-2026", organizationId: "organization-1" }),
    );

    expect(markup).toContain('<h2 id="public-preview-heading">Public form preview</h2>');
    expect(markup).toContain('aria-label="Public CFP form preview"');
    expect(markup).toContain("Bring your best session to the Summit");
    expect(markup).toContain('id="preview-first-name"');
    expect(markup).toContain('id="preview-track"');
    expect(markup).toContain("Responsible AI");
    expect(markup).toContain("Your proposal is in");
    expect(markup).toContain("This preview uses the current editor state");
  });
  it("round-trips sections, participant fields, rules, and reusable field lineage", () => {
    const configuration = createSeededCfpConfiguration();
    configuration.sections = [
      { id: "proposal", title: "Proposal", description: "Tell us what you will share." },
      { id: "logistics", title: "Logistics", description: "Accessibility and files." },
    ];
    configuration.fields = [
      ...configuration.fields.map((field) => ({
        ...field,
        key: field.id,
        sectionId: "proposal",
        ...(field.id === "website"
          ? {
              fieldRef: { id: "tenant.website", version: 4 },
              fieldVersion: 4,
              description: "A public profile or project link.",
              config: { category: "profile", indexing: "public" },
            }
          : {}),
      })),
      {
        id: "slide-deck",
        key: "slideDeck",
        label: "Slide deck",
        type: "file_request",
        kind: "file_request",
        required: false,
        visible: true,
        placeholder: "",
        sectionId: "logistics",
        options: [],
        description: "Optional presentation materials.",
        fileRequest: {
          allowedMimeTypes: ["application/pdf"],
          maxBytes: 4_000_000,
          owner: "submission",
          required: false,
        },
        config: { category: "presentation" },
      },
    ];
    configuration.participantFields = [
      {
        id: "participant-pronouns",
        key: "pronouns",
        label: "Pronouns",
        type: "select",
        kind: "select",
        required: false,
        visible: true,
        placeholder: "",
        sectionId: "logistics",
        options: ["she/her", "they/them"],
        fieldRef: "tenant.pronouns",
        fieldVersion: 2,
      },
    ];
    configuration.rules = [
      {
        id: "show-logistics",
        priority: 10,
        when: {
          type: "group",
          operator: "all",
          conditions: [
            { type: "predicate", fieldKey: "format", operator: "equals", value: "Workshop" },
          ],
        },
        actions: [{ type: "show_section", sectionId: "logistics" }],
      },
    ];

    const event = {
      id: "summit-2026",
      tenantId: "org-1",
      version: 3,
      slug: "summit-2026",
      name: configuration.eventName,
      timezone: configuration.timezone,
      opensAt: "2026-01-15T00:00:00.000Z",
      closesAt: "2026-03-31T00:00:00.000Z",
    };
    const form = toFormConfiguration(configuration, "org-1", "summit-2026");
    const restored = configurationFromServer(configuration, event, form);

    expect(restored.sections).toEqual(configuration.sections);
    expect(restored.rules).toEqual(configuration.rules);
    expect(restored.participantFields?.[0]).toMatchObject({
      key: "pronouns",
      fieldRef: "tenant.pronouns",
      fieldVersion: 2,
    });
    expect(restored.fields.find((field) => field.key === "website")).toMatchObject({
      sectionId: "proposal",
      fieldRef: { id: "tenant.website", version: 4 },
      fieldVersion: 4,
      description: "A public profile or project link.",
      config: { category: "profile", indexing: "public" },
      type: "url",
      visible: true,
    });
    expect(restored.fields.find((field) => field.key === "slideDeck")).toMatchObject({
      type: "file_request",
      visible: true,
      description: "Optional presentation materials.",
      fileRequest: {
        allowedMimeTypes: ["application/pdf"],
        maxBytes: 4_000_000,
        owner: "submission",
        required: false,
      },
      config: { category: "presentation" },
    });
  });
  it("discovers the published form for the exact event before stable fallbacks", () => {
    const draftConfiguration = createSeededCfpConfiguration("devflow-conf-2027");
    draftConfiguration.id = "devflow-draft";
    draftConfiguration.status = "draft";
    const publishedConfiguration = createSeededCfpConfiguration("devflow-conf-2027");
    publishedConfiguration.id = "devflow-conf-2027-cfp";
    publishedConfiguration.status = "published";
    const otherEventConfiguration = createSeededCfpConfiguration("other-event");
    otherEventConfiguration.id = "main-cfp";
    otherEventConfiguration.status = "published";

    const selected = selectEditorForm(
      [
        toFormConfiguration(draftConfiguration, "ai-engineer", "devflow-conf-2027"),
        toFormConfiguration(otherEventConfiguration, "ai-engineer", "other-event"),
        toFormConfiguration(publishedConfiguration, "ai-engineer", "devflow-conf-2027"),
      ],
      "ai-engineer",
      "devflow-conf-2027",
    );

    expect(selected?.id).toBe("devflow-conf-2027-cfp");
  });

  it("uses an event-qualified form id when creating an empty event form", () => {
    const seeded = createSeededCfpConfiguration("empty-event");
    const { id: _id, formVersion: _formVersion, ...configuration } = seeded;

    expect(toFormConfiguration(configuration, "ai-engineer", "empty-event")).toMatchObject({
      id: "empty-event-cfp",
      eventId: "empty-event",
      version: 1,
    });
  });

  it("round-trips equals Workshop to show_field prerequisites without inversion", () => {
    const configuration = createSeededCfpConfiguration("devflow-conf-2027");
    configuration.rule = {
      type: "condition",
      field: "format",
      operator: "is",
      value: "Workshop",
    };
    configuration.ruleTargetField = "prerequisites";
    configuration.ruleAction = "show prerequisites";
    configuration.fields = [
      ...configuration.fields,
      {
        id: "prerequisites",
        key: "prerequisites",
        label: "Prerequisites",
        type: "textarea",
        kind: "rich_text",
        required: false,
        visible: true,
        placeholder: "",
        options: [],
      },
    ];

    const form = toFormConfiguration(configuration, "ai-engineer", "devflow-conf-2027");
    const editorRule = form.rules.find((rule) => rule.id === "editor-conditional-rule");
    expect(editorRule).toMatchObject({
      when: {
        type: "group",
        operator: "all",
        conditions: [
          {
            type: "predicate",
            fieldKey: "format",
            operator: "equals",
            value: "Workshop",
          },
        ],
      },
      actions: [{ type: "show_field", fieldKey: "prerequisites" }],
    });

    const event = {
      id: "devflow-conf-2027",
      tenantId: "ai-engineer",
      version: 1,
      slug: "devflow-conf-2027",
      name: configuration.eventName,
      timezone: configuration.timezone,
      opensAt: "2027-01-01T00:00:00.000Z",
      closesAt: "2027-02-01T00:00:00.000Z",
    };
    const persistedForm = {
      ...form,
      rules: form.rules.map((rule) =>
        rule.id === "editor-conditional-rule"
          ? { ...rule, id: "rule-workshop-prerequisites", priority: 10 }
          : rule,
      ),
    };
    const restored = configurationFromServer(configuration, event, persistedForm);
    expect(restored.rule).toEqual(configuration.rule);
    expect(restored.ruleTargetField).toBe("prerequisites");
    expect(restored.editorRuleId).toBe("rule-workshop-prerequisites");

    const roundTripped = toFormConfiguration(restored, "ai-engineer", "devflow-conf-2027");
    expect(roundTripped.rules).toHaveLength(form.rules.length);
    expect(roundTripped.rules).toContainEqual(
      expect.objectContaining({
        id: "rule-workshop-prerequisites",
        when: expect.objectContaining({
          operator: "all",
          conditions: [expect.objectContaining({ operator: "equals", value: "Workshop" })],
        }),
        actions: [{ type: "show_field", fieldKey: "prerequisites" }],
      }),
    );
    const nestedPersistedForm = {
      ...persistedForm,
      rules: persistedForm.rules.map((rule) =>
        rule.id === "rule-workshop-prerequisites"
          ? {
              ...rule,
              when: {
                type: "group",
                operator: "all",
                conditions: [
                  {
                    type: "predicate",
                    fieldKey: "format",
                    operator: "equals",
                    value: "Workshop",
                  },
                  {
                    type: "group",
                    operator: "any",
                    conditions: [
                      {
                        type: "predicate",
                        fieldKey: "track",
                        operator: "equals",
                        value: "Community systems",
                      },
                      {
                        type: "predicate",
                        fieldKey: "level",
                        operator: "equals",
                        value: "Introductory",
                      },
                    ],
                  },
                ],
              },
            }
          : rule,
      ),
    };
    const nestedRestored = configurationFromServer(configuration, event, nestedPersistedForm);
    expect(nestedRestored.rule).toEqual({
      type: "group",
      operator: "AND",
      conditions: [
        {
          type: "condition",
          field: "format",
          operator: "is",
          value: "Workshop",
        },
        {
          type: "group",
          operator: "OR",
          conditions: [
            {
              type: "condition",
              field: "track",
              operator: "is",
              value: "Community systems",
            },
            {
              type: "condition",
              field: "level",
              operator: "is",
              value: "Introductory",
            },
          ],
        },
      ],
    });
    const nestedRoundTripped = toFormConfiguration(
      nestedRestored,
      "ai-engineer",
      "devflow-conf-2027",
    );
    expect(nestedRoundTripped.rules).toContainEqual(
      expect.objectContaining({
        id: "rule-workshop-prerequisites",
        when: {
          type: "group",
          operator: "all",
          conditions: [
            {
              type: "predicate",
              fieldKey: "format",
              operator: "equals",
              value: "Workshop",
            },
            {
              type: "group",
              operator: "any",
              conditions: [
                {
                  type: "predicate",
                  fieldKey: "track",
                  operator: "equals",
                  value: "Community systems",
                },
                {
                  type: "predicate",
                  fieldKey: "level",
                  operator: "equals",
                  value: "Introductory",
                },
              ],
            },
          ],
        },
      }),
    );
  });

  it("omits empty optional taxonomy fields from persisted forms", () => {
    const configuration = createSeededCfpConfiguration("devflow-conf-2027");
    configuration.tags = [];
    configuration.levels = [];
    configuration.fields = configuration.fields.filter(
      (field) => !["tags", "level"].includes(field.key ?? field.id),
    );

    const form = toFormConfiguration(configuration, "ai-engineer", "devflow-conf-2027");
    expect(form.submissionFields.map((field) => field.key)).not.toContain("tags");
    expect(form.submissionFields.map((field) => field.key)).not.toContain("level");
  });
});
