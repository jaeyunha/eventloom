import type { Metadata } from "next";
import { CrmWorkspace } from "@/features/crm/crm-workspace";

export const metadata: Metadata = {
  title: "Organization CRM",
  description: "Manage organization contacts, segments, event relationships, and outreach.",
};

interface CrmPageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function CrmPage({ params }: CrmPageProps) {
  const { organizationId } = await params;
  return <CrmWorkspace organizationId={organizationId} />;
}
