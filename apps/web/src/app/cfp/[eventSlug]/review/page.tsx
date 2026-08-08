import { CfpWizard } from "../../../../features/cfp/cfp-wizard";

interface CfpPageProps {
  params: Promise<{ eventSlug: string }>;
}

export default async function CfpReviewPage({ params }: CfpPageProps) {
  const { eventSlug } = await params;
  return <CfpWizard eventSlug={eventSlug} step="review" />;
}
