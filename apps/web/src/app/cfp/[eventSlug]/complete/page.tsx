import { CfpComplete } from "@/features/cfp/cfp-wizard";

interface CfpPageProps {
  params: Promise<{ eventSlug: string }>;
}

export default async function CfpCompletePage({ params }: CfpPageProps) {
  const { eventSlug } = await params;
  return <CfpComplete eventSlug={eventSlug} />;
}
