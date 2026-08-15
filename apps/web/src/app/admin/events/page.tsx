import { OrganizerRouteResolver } from "@/features/admin/organizer-route-resolver";

export default async function AdminEventsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly create?: string | readonly string[] }>;
}) {
  const params = await searchParams;
  return <OrganizerRouteResolver createEvent={params.create === "1"} destination="events" />;
}
