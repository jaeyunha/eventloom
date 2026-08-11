import { CfpEditor } from "@/features/admin/cfp-editor";

interface CfpPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function CfpConfigurationPage({ params }: CfpPageProps) {
  const { organizationId, eventId } = await params;
  return <CfpEditor organizationId={organizationId} eventId={eventId} />;
}
