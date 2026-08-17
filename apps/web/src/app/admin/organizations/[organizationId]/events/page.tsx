import { OrganizerEvents } from "@/features/admin/organizer-overview";

export default async function OrganizationEventsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly create?: string | readonly string[];
    readonly edit?: string | readonly string[];
  }>;
}) {
  const params = await searchParams;
  const edit = typeof params.edit === "string" ? params.edit : undefined;
  return params.create === "1" ? (
    <OrganizerEvents initialEditor="create" />
  ) : (
    <OrganizerEvents {...(edit === undefined ? {} : { initialEditor: edit })} />
  );
}
