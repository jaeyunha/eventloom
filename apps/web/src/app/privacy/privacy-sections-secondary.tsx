import type { LegalSection } from "@/components/legal/legal-document";

export const privacySectionsSecondary: readonly LegalSection[] = [
  {
    id: "rights",
    title: "11. Your rights and choices",
    body: (
      <>
        <p>
          Depending on your location, you may have rights to access, correct, delete, restrict,
          object to, or obtain a copy of personal information, and to appeal a denied request. You
          may also disconnect integrations, manage communication preferences, or ask to close your
          account.
        </p>
        <p>
          Some event information is controlled by the organization running that event. We may direct
          your request to that organization or assist it in responding. Send requests to{" "}
          <a href="mailto:support@namuh.co?subject=Privacy%20request">support@namuh.co</a>. We may
          verify your identity before completing a request.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "12. Cookies and similar storage",
    body: (
      <p>
        We use cookies and browser storage that are necessary for authentication, security, theme
        preferences, and core service operation. If we introduce optional analytics or advertising
        technologies that require consent, we will provide the controls and notices required by
        applicable law.
      </p>
    ),
  },
  {
    id: "children",
    title: "13. Children",
    body: (
      <p>
        Eventloom is not directed to children under 16, and we do not knowingly collect their
        personal information without authorization required by law. Contact us if you believe a
        child has provided personal information improperly.
      </p>
    ),
  },
  {
    id: "changes",
    title: "14. Changes to this Policy",
    body: (
      <p>
        We may update this Policy as Eventloom, our integrations, or legal requirements change. We
        will post the revised version here, change the effective date, and provide additional notice
        when required. Material changes apply prospectively unless law permits otherwise.
      </p>
    ),
  },
  {
    id: "contact",
    title: "15. Contact us",
    body: (
      <p>
        Questions, privacy requests, and complaints can be sent to{" "}
        <a href="mailto:support@namuh.co">support@namuh.co</a>. Include &quot;Privacy&quot; in the
        subject line so we can route your request appropriately.
      </p>
    ),
  },
];
