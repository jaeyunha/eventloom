import { Hono } from "hono";
import { z } from "zod";

const publishedEventSchema = z
  .object({
    organization: z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1),
    }),
    event: z.object({
      slug: z.string().trim().min(1),
      name: z.string().trim().min(1),
      timeZone: z.string().trim().min(1),
      startsOn: z.string().trim().min(1),
      endsOn: z.string().trim().min(1),
      venueName: z.string().trim().min(1).nullable(),
    }),
    cfpOpen: z.boolean(),
  })
  .strict();

const publishedEventsSchema = z.array(publishedEventSchema).max(2_000);

export type PublishedEventDirectoryRecord = z.infer<typeof publishedEventSchema>;

export interface PublishedEventDirectoryRouteDependencies {
  readonly listPublishedEvents: () => Promise<readonly PublishedEventDirectoryRecord[]>;
}

const PUBLIC_EVENT_DIRECTORY_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=30, must-revalidate";

export function createPublishedEventDirectoryRoutes(
  dependencies: PublishedEventDirectoryRouteDependencies,
) {
  const routes = new Hono();

  routes.get("/", async (context) => {
    const records = publishedEventsSchema.parse(await dependencies.listPublishedEvents());
    const groups = new Map<
      string,
      {
        organization: PublishedEventDirectoryRecord["organization"];
        events: Array<PublishedEventDirectoryRecord["event"] & { cfpOpen: boolean }>;
      }
    >();

    for (const record of records) {
      const group = groups.get(record.organization.id) ?? {
        organization: record.organization,
        events: [],
      };
      group.events.push({ ...record.event, cfpOpen: record.cfpOpen });
      groups.set(record.organization.id, group);
    }

    const data = [...groups.values()]
      .map((group) => ({
        ...group,
        events: group.events.sort((left, right) =>
          left.startsOn === right.startsOn
            ? left.name.localeCompare(right.name)
            : left.startsOn.localeCompare(right.startsOn),
        ),
      }))
      .sort((left, right) => left.organization.name.localeCompare(right.organization.name));

    context.header("Cache-Control", PUBLIC_EVENT_DIRECTORY_CACHE_CONTROL);
    return context.json({ data });
  });

  return routes;
}
