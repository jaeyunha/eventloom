import { CfpWizard } from "@/features/cfp/cfp-wizard";

interface CfpPageProps {
  params: Promise<{ organizationId: string; eventSlug: string }>;
}

export default async function CfpSubmissionPage({ params }: CfpPageProps) {
  const { organizationId, eventSlug } = await params;
  return <CfpWizard organizationId={organizationId} eventSlug={eventSlug} step="submission" />;
}
