import { CfpWizard } from "@/features/cfp/cfp-wizard";

interface CfpPageProps {
  params: Promise<{ organizationId: string; eventSlug: string }>;
}

export default async function CfpAccountPage({ params }: CfpPageProps) {
  const { organizationId, eventSlug } = await params;
  return <CfpWizard organizationId={organizationId} eventSlug={eventSlug} step="account" />;
}
