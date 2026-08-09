import { apiErrorSchema } from "@open-sessionboard/contracts";
import { type Context, Hono } from "hono";
import { z } from "zod";

export interface PublishedSpeaker {
  readonly id: string;
  readonly displayName: string;
  readonly pronouns: string | null;
  readonly jobTitle: string | null;
  readonly organization: string | null;
  readonly biography: string;
  readonly photoUrl: string | null;
  readonly sessionIds: readonly string[];
  readonly sessionTitles: readonly string[];
  readonly trackNames: readonly string[];
}

export interface PublishedSpeakerProjection {
  readonly event: {
    readonly slug: string;
    readonly name: string;
    readonly timeZone: string;
    readonly startsOn: string;
    readonly endsOn: string;
    readonly venueName: string | null;
  };
  readonly revision: {
    readonly id: string;
    readonly number: number;
    readonly publishedAt: string;
  };
  readonly speakers: readonly PublishedSpeaker[];
}

/**
 * The source must return a materialized immutable publication. It must not
 * read draft, task, review, or mutable profile state while serving this route.
 */
export interface PublishedSpeakerRouteDependencies {
  readonly getPublishedSpeakers: (eventSlug: string) => Promise<PublishedSpeakerProjection | null>;
}

interface PublishedSpeakerRouteEnvironment {
  Variables: {
    traceId: string;
  };
}

type PublishedSpeakerContext = Context<PublishedSpeakerRouteEnvironment>;
const eventSlugSchema = z.string().trim().min(1).max(200);

function traceId(context: PublishedSpeakerContext): string {
  return context.get("traceId") ?? crypto.randomUUID();
}

function errorResponse(
  context: PublishedSpeakerContext,
  status: 404 | 500,
  code: "NOT_FOUND" | "INTERNAL_ERROR",
  message: string,
): Response {
  return context.json(
    apiErrorSchema.parse({
      error: { code, message, traceId: traceId(context) },
    }),
    status,
  );
}

/** Anonymous route for the current immutable published speaker projection. */
export function createPublishedSpeakerRoutes(
  dependencies: PublishedSpeakerRouteDependencies,
): Hono<PublishedSpeakerRouteEnvironment> {
  const routes = new Hono<PublishedSpeakerRouteEnvironment>();

  routes.get("/", async (context) => {
    const parsedSlug = eventSlugSchema.safeParse(context.req.param("eventSlug"));
    if (!parsedSlug.success) {
      return errorResponse(context, 404, "NOT_FOUND", "The published event was not found.");
    }
    const data = await dependencies.getPublishedSpeakers(parsedSlug.data);
    if (data === null) {
      return errorResponse(context, 404, "NOT_FOUND", "The published event was not found.");
    }
    context.header("cache-control", "public, max-age=60, stale-while-revalidate=30");
    return context.json({ data });
  });

  routes.onError((error, context) => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "published_speaker_projection_failed",
        traceId: traceId(context),
        errorName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return errorResponse(
      context,
      500,
      "INTERNAL_ERROR",
      "The published speaker view could not be completed.",
    );
  });

  return routes;
}
