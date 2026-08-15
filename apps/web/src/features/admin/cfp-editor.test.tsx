import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CfpApi } from "../cfp/api";
import {
  CfpEditor,
  cfpActiveSectionThreshold,
  cfpContainerScrollTop,
  cfpSectionScrollOffset,
  closeCfpNowConfiguration,
  closeCfpNowInstant,
  configurationFromServer,
  isCfpCloseDatePast,
  loadCfpEditorConfiguration,
  persistCfpConfiguration,
  resolveCfpEditorStepIndex,
  selectEditorForm,
  summarizeRule,
  toFormConfiguration,
  validateCfpDateRange,
} from "./cfp-editor";
import { createTestCfpConfiguration } from "./cfp-editor.test-fixtures";

describe("CFP editor", () => {
  it("blocks forward editor navigation until the current step is valid", () => {
    expect(
      resolveCfpEditorStepIndex({
        currentIndex: 1,
        requestedIndex: 2,
        currentStepValid: false,
      }),
    ).toBe(1);
    expect(
      resolveCfpEditorStepIndex({
        currentIndex: 1,
        requestedIndex: 2,
        currentStepValid: true,
      }),
    ).toBe(2);
    expect(
      resolveCfpEditorStepIndex({
        currentIndex: 3,
        requestedIndex: 1,
        currentStepValid: false,
      }),
    ).toBe(1);
  });

  it("computes section offsets for the organizer panel scroll container", () => {
    expect(cfpSectionScrollOffset(52, 64)).toBe(132);
    expect(cfpActiveSectionThreshold(52, 64)).toBe(156);
    expect(cfpContainerScrollTop(120, 460, 48, 64)).toBe(452);
  });

  it("starts in a truthful loading state without fixture configuration", () => {
    const previousRuntimeProfile = process.env.NEXT_PUBLIC_RUNTIME_PROFILE;
    process.env.NEXT_PUBLIC_RUNTIME_PROFILE = "fixture";
    try {
      const markup = renderToStaticMarkup(
        createElement(CfpEditor, { eventId: "summit-2026", organizationId: "organization-1" }),
      );

      expect(markup).toContain("Loading CFP configuration");
      expect(markup).not.toContain("Eventloom Summit 2026");
      expect(markup).not.toContain("America/Los_Angeles");
      expect(markup).not.toContain("Copy public link");
      expect(markup).not.toContain("View public form");
      expect(markup).not.toContain('aria-label="Event and CFP configuration"');
    } finally {
      process.env.NEXT_PUBLIC_RUNTIME_PROFILE = previousRuntimeProfile;
    }
  });

  it("loads authoritative event and form configuration through the injected API", async () => {
    const configuration = createTestCfpConfiguration("devflow-conf-2027");
    const event = {
      id: "event-1",
      tenantId: "organization-1",
      version: 3,
      slug: "devflow-conf-2027",
      name: "DevFlow Conference",
      timezone: "America/New_York",
      opensAt: "2027-01-01T05:00:00.000Z",
      closesAt: "2027-02-01T05:00:00.000Z",
    };
    const form = toFormConfiguration(configuration, "organization-1", "event-1");
    const calls: string[] = [];
    const api = {
      getEvent: async () => {
        calls.push("event");
        return event;
      },
      listForms: async () => {
        calls.push("forms");
        return [form];
      },
    } as unknown as CfpApi;

    const loaded = await loadCfpEditorConfiguration(api, {
      organizationId: "organization-1",
      eventId: "event-1",
    });

    expect(calls).toEqual(["event", "forms"]);
    expect(loaded).toEqual({ event, form });
  });

  it("deduplicates concurrent loads for the same editor scope", async () => {
    const configuration = createTestCfpConfiguration("devflow-conf-2027");
    const event = {
      id: "event-1",
      tenantId: "organization-1",
      version: 3,
      slug: "devflow-conf-2027",
      name: "DevFlow Conference",
      timezone: "America/New_York",
      opensAt: "2027-01-01T05:00:00.000Z",
      closesAt: "2027-02-01T05:00:00.000Z",
    };
    const form = toFormConfiguration(configuration, "organization-1", "event-1");
    const calls: string[] = [];
    const api = {
      getEvent: async () => {
        calls.push("event");
        return event;
      },
      listForms: async () => {
        calls.push("forms");
        return [form];
      },
    } as unknown as CfpApi;
    const input = { organizationId: "organization-1", eventId: "event-1" };

    await Promise.all([
      loadCfpEditorConfiguration(api, input),
      loadCfpEditorConfiguration(api, input),
    ]);

    expect(calls).toEqual(["event", "forms"]);
  });

  it("validates date ordering and identifies past close dates", () => {
    expect(validateCfpDateRange("2026-08-10", "2026-08-10")).toBe(
      "The close date must be after the open date.",
    );
    expect(validateCfpDateRange("not-a-date", "2026-08-10")).toBe(
      "Enter valid open and close dates.",
    );
    expect(isCfpCloseDatePast("2026-08-01", new Date("2026-08-10T00:00:00.000Z"))).toBe(true);
  });
  it("computes a server close-now instant without violating the open boundary", () => {
    const now = new Date("2026-08-10T13:46:51.000Z");
    expect(closeCfpNowInstant("2026-08-01", now)).toBe(now.toISOString());
    expect(closeCfpNowInstant("2026-08-20", now)).toBe("2026-08-20T00:00:00.001Z");

    const configuration = createTestCfpConfiguration("devflow-conf-2027");
    configuration.opensAt = "2027-01-01";
    const closed = closeCfpNowConfiguration(configuration, now);
    expect(closed.closesAt).toBe("2027-01-01T08:00:00.001Z");
    expect(Date.parse(closed.closesAt)).toBeGreaterThanOrEqual(
      Date.parse(`${configuration.opensAt}T00:00:00.000Z`),
    );
  });

  it("only reports a CFP save after event and form persistence both resolve", async () => {
    const configuration = createTestCfpConfiguration("devflow-conf-2027");
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

  it("repairs missing core proposal fields when loading an existing form", () => {
    const configuration = createTestCfpConfiguration("devflow-conf-2027");
    const form = toFormConfiguration(configuration, "organization-1", "devflow-conf-2027");
    const repaired = configurationFromServer(
      configuration,
      {
        id: "devflow-conf-2027",
        tenantId: "organization-1",
        version: 4,
        slug: "devflow-conf-2027",
        name: "DevFlow Conference 2027",
        timezone: "America/Los_Angeles",
        opensAt: "2027-01-05T08:00:00.000Z",
        closesAt: "2027-02-15T08:00:00.000Z",
      },
      {
        ...form,
        submissionFields: form.submissionFields.filter(
          (field) => !["title", "abstract", "description"].includes(field.key),
        ),
      },
    );

    expect(repaired.fields.slice(0, 3)).toMatchObject([
      {
        id: "title",
        key: "title",
        label: "Session title",
        type: "text",
        required: true,
        visible: true,
      },
      {
        id: "abstract",
        key: "abstract",
        label: "Abstract",
        type: "textarea",
        required: false,
        visible: true,
      },
      {
        id: "description",
        key: "description",
        label: "Description",
        type: "textarea",
        required: false,
        visible: true,
      },
    ]);
  });

  it("summarizes nested AND/OR condition logic", () => {
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
  });
  it("round-trips sections, participant fields, rules, and reusable field lineage", () => {
    const configuration = createTestCfpConfiguration();
    configuration.proposalLimit = 7;
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
    delete configuration.ruleTargetField;
    configuration.ruleAction = "";
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

    expect(form.settings.maxSubmissionsPerAccount).toBe(7);
    expect(restored.proposalLimit).toBe(7);
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
    const draftConfiguration = createTestCfpConfiguration("devflow-conf-2027");
    draftConfiguration.id = "devflow-draft";
    draftConfiguration.status = "draft";
    const publishedConfiguration = createTestCfpConfiguration("devflow-conf-2027");
    publishedConfiguration.id = "devflow-conf-2027-cfp";
    publishedConfiguration.status = "published";
    const otherEventConfiguration = createTestCfpConfiguration("other-event");
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
    const seeded = createTestCfpConfiguration("empty-event");
    const { id: _id, formVersion: _formVersion, ...configuration } = seeded;

    expect(toFormConfiguration(configuration, "ai-engineer", "empty-event")).toMatchObject({
      id: "empty-event-cfp",
      eventId: "empty-event",
      version: 1,
    });
  });

  it("authorizes newly selected file-request fields with safe submission defaults", () => {
    const configuration = createTestCfpConfiguration("devflow-conf-2027");
    configuration.fields.push({
      id: "proposal-deck",
      key: "proposal_deck",
      label: "Session proposal deck",
      type: "file_request",
      kind: "file_request",
      required: true,
      visible: true,
      placeholder: "",
      options: [],
    });

    const form = toFormConfiguration(configuration, "ai-engineer", "devflow-conf-2027");

    expect(form.submissionFields.find((field) => field.key === "proposal_deck")).toMatchObject({
      kind: "file_request",
      required: true,
      fileRequest: {
        allowedMimeTypes: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "image/jpeg",
          "image/png",
          "image/webp",
          "text/plain",
        ],
        maxBytes: 25 * 1024 * 1024,
        required: true,
        owner: "submission",
      },
    });
  });

  it("round-trips equals Workshop to show_field prerequisites without inversion", () => {
    const configuration = createTestCfpConfiguration("devflow-conf-2027");
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
    const configuration = createTestCfpConfiguration("devflow-conf-2027");
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
