import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { termsSectionsPrimary } from "./terms-sections-primary";
import { termsSectionsSecondary } from "./terms-sections-secondary";

const sections = [...termsSectionsPrimary, ...termsSectionsSecondary];

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms governing the hosted Eventloom service, including accounts, integrations, AI assistance, subscriptions, and acceptable use.",
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      description="These Terms set the rules for using hosted Eventloom, including organization accounts, connected services, advisory AI, and future paid subscriptions."
      effectiveDate="August 14, 2026"
      summary={
        <p>
          You keep ownership of your content. We process it to run Eventloom, expect lawful and
          secure use, require people to review consequential AI suggestions, and describe how paid
          subscriptions, cancellations, integrations, and liability work.
        </p>
      }
      sections={sections}
    />
  );
}
