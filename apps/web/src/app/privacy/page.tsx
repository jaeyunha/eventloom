import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { privacySectionsPrimary } from "./privacy-sections-primary";
import { privacySectionsSecondary } from "./privacy-sections-secondary";

const sections = [...privacySectionsPrimary, ...privacySectionsSecondary];

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Eventloom collects, uses, protects, and shares information, including data handled through Airtable and Google OAuth.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      description="This Policy explains the information Eventloom handles, why we handle it, and the choices available to people and organizations using the service."
      effectiveDate="August 14, 2026"
      summary={
        <p>
          We use personal information to operate and secure Eventloom, never sell it, and only use
          connected-service data to provide the integration you authorize. Organization admins
          control much of the program data in their workspace.
        </p>
      }
      sections={sections}
    />
  );
}
