import { z } from "zod";

export const eventPayloadSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    organizationId: z.string().min(1),
    name: z.string().trim().min(1),
    status: z.enum(["draft", "active", "archived"]),
    timeZone: z.string().trim().min(1),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    venue: z.string().trim().min(1).nullable(),
    cfpSettings: z.object({
      enabled: z.boolean(),
      opensAt: z.iso.datetime({ offset: true }).nullable(),
      closesAt: z.iso.datetime({ offset: true }).nullable(),
    }),
  }),
});

export const submissionsPayloadSchema = z.object({
  data: z.array(
    z.object({
      submission: z.object({
        status: z.enum([
          "draft",
          "submitted",
          "reopened",
          "under_review",
          "accepted",
          "waitlisted",
          "declined",
          "withdrawn",
        ]),
      }),
    }),
  ),
});

export const agendaPayloadSchema = z.object({
  data: z.object({
    draft: z.object({
      entries: z.array(z.unknown()),
    }),
    currentPublishedRevision: z
      .object({
        entries: z.array(z.unknown()).optional(),
        sessionCount: z.number().int().nonnegative().optional(),
      })
      .nullable(),
  }),
});

export const agendaPreviewPayloadSchema = z.object({
  data: z.object({
    conflicts: z.array(z.unknown()),
    releaseConflicts: z.array(z.unknown()).optional(),
  }),
});

export const errorPayloadSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
});

export interface EventOverviewEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly status: "draft" | "active" | "archived";
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venue: string | null;
  readonly cfpSettings: {
    readonly enabled: boolean;
    readonly opensAt: string | null;
    readonly closesAt: string | null;
  };
}

export type EventOverviewSubmissions =
  | {
      readonly status: "ready";
      readonly total: number;
      readonly awaitingDecision: number;
      readonly accepted: number;
    }
  | {
      readonly status: "unavailable";
      readonly message: string;
    };

export type EventOverviewAgenda =
  | {
      readonly status: "ready";
      readonly scheduledSessions: number;
      readonly conflicts: number;
      readonly publishedSessions: number;
    }
  | {
      readonly status: "unavailable";
      readonly message: string;
    };

export interface EventOverviewData {
  readonly event: EventOverviewEvent;
  readonly submissions: EventOverviewSubmissions;
  readonly agenda: EventOverviewAgenda;
}

export type EventOverviewFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
