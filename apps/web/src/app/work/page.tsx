import { redirect } from "next/navigation";
import { isManagedWebDeployment, organizationRequestUrl } from "@/env";
import { WorkHubView } from "@/features/work/work-hub";
import { loadWorkHubModel } from "@/features/work/work-hub-loader";

export default async function WorkPage() {
  const model = await loadWorkHubModel();
  if (model === null) {
    redirect(`/login?next=${encodeURIComponent("/work")}`);
  }

  const organizationRequest = isManagedWebDeployment()
    ? { contactUrl: organizationRequestUrl() }
    : null;

  return <WorkHubView model={model} organizationRequest={organizationRequest} />;
}
