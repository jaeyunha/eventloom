import { OrganizerEvents } from "@/features/admin/organizer-overview";

export default async function OrganizationEventsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly create?: string | readonly string[] }>;
}) {
  const params = await searchParams;
  return params.create === "1" ? <OrganizerEvents initialEditor="create" /> : <OrganizerEvents />;
}
