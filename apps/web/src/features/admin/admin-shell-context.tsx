import { createContext, type ReactNode, useContext } from "react";

const OrganizerOrganizationContext = createContext<string | null>(null);

export function useOrganizerOrganizationId(): string | null {
  return useContext(OrganizerOrganizationContext);
}

export function OrganizerOrganizationProvider({
  children,
  organizationId,
}: Readonly<{ children: ReactNode; organizationId: string }>) {
  return (
    <OrganizerOrganizationContext.Provider value={organizationId}>
      {children}
    </OrganizerOrganizationContext.Provider>
  );
}
