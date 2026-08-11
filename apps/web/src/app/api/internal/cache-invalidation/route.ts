import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_PROGRAM_CACHE_TAG } from "@/features/embed/api";

const PUBLIC_EMBED_VIEWS = [
  "sessions",
  "speakers-list",
  "agenda",
  "itinerary",
  "speakers",
] as const;

function errorResponse(status: 400 | 401 | 503, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'",
      },
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  const expectedToken = process.env.CACHE_INVALIDATION_TOKEN?.trim();
  if (!expectedToken) {
    return errorResponse(
      503,
      "CACHE_INVALIDATION_UNAVAILABLE",
      "Public cache invalidation is not configured.",
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${expectedToken}`) {
    return errorResponse(
      401,
      "AUTHENTICATION_REQUIRED",
      "Cache invalidation authentication failed.",
    );
  }

  const body = (await request.json().catch(() => null)) as { eventId?: unknown } | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
  if (eventId.length === 0 || eventId.length > 128) {
    return errorResponse(400, "VALIDATION_FAILED", "A valid event ID is required.");
  }

  revalidateTag(PUBLIC_PROGRAM_CACHE_TAG, { expire: 0 });
  for (const view of PUBLIC_EMBED_VIEWS) {
    revalidatePath(`/embed/${encodeURIComponent(eventId)}/${view}`, "page");
  }
  return Response.json(
    { data: { eventId, invalidated: true } },
    { headers: { "cache-control": "no-store" } },
  );
}
