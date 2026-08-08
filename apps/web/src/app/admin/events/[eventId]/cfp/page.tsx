import { CfpEditor } from "../../../../../features/admin/cfp-editor";

interface CfpPageProps {
  params: Promise<{ eventId: string }>;
}

export default async function CfpConfigurationPage({ params }: CfpPageProps) {
  const { eventId } = await params;
  return <CfpEditor eventId={eventId} />;
}
