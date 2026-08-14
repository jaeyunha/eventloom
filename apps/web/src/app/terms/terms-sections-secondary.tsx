import type { LegalSection } from "@/components/legal/legal-document";

export const termsSectionsSecondary: readonly LegalSection[] = [
  {
    id: "termination",
    title: "12. Suspension and termination",
    body: (
      <>
        <p>
          You may stop using Eventloom at any time and may cancel a subscription as described above.
          We may suspend or terminate access for material breach, security risk, unlawful use,
          non-payment, or harm to the service or others. When practical, we will give notice and an
          opportunity to cure before suspension.
        </p>
        <p>
          Following termination, your right to use the hosted service ends. Subject to plan,
          contract, law, and technical limits, organization administrators should export needed
          Customer Content before access ends. Provisions that by their nature should survive,
          including payment, ownership, confidentiality, disclaimers, liability limits, and
          disputes, will survive.
        </p>
      </>
    ),
  },
  {
    id: "warranties",
    title: "13. Disclaimers",
    body: (
      <p>
        To the fullest extent permitted by law, Eventloom is provided &quot;as is&quot; and &quot;as
        available.&quot; We disclaim implied warranties of merchantability, fitness for a particular
        purpose, non-infringement, and uninterrupted or error-free operation. We do not guarantee
        proposal quality, review outcomes, attendance, deliverability, integration availability, AI
        output, or event success. Any service-level commitment applies only if stated in a signed
        order form.
      </p>
    ),
  },
  {
    id: "liability",
    title: "14. Limitation of liability",
    body: (
      <>
        <p>
          To the fullest extent permitted by law, neither party will be liable for indirect,
          incidental, special, consequential, exemplary, or punitive damages, or for lost profits,
          revenue, goodwill, or data, even if advised that such damages are possible.
        </p>
        <p>
          Except for payment obligations, breach of confidentiality, infringement or
          misappropriation, indemnity obligations, fraud, willful misconduct, or liability that
          cannot legally be limited, each party&apos;s total liability arising from the service will
          not exceed the amount you paid for Eventloom during the 12 months before the event giving
          rise to the claim. For free use, Namuh&apos;s total liability will not exceed USD 100.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "15. Indemnity",
    body: (
      <p>
        To the extent permitted by law, you will defend and indemnify Namuh and its personnel
        against third-party claims arising from Customer Content, your event operations, your
        violation of these Terms, or your infringement of another person&apos;s rights. We will
        provide prompt notice and reasonable cooperation, and you may control the defense so long as
        any settlement does not admit fault or impose non-monetary obligations on us without
        consent.
      </p>
    ),
  },
  {
    id: "disputes",
    title: "16. Governing terms and disputes",
    body: (
      <p>
        A signed order form controls over these Terms if they conflict. The order form may identify
        the contracting Namuh entity, governing law, and venue. If it does not, the laws and courts
        of the place where the contracting Namuh entity has its principal place of business govern,
        excluding conflict-of-law rules. Before filing a formal claim, each party will give the
        other written notice and 30 days to try to resolve the dispute informally, unless urgent
        relief is reasonably necessary.
      </p>
    ),
  },
  {
    id: "changes",
    title: "17. Changes to these Terms",
    body: (
      <p>
        We may update these Terms to reflect service, legal, or business changes. We will post the
        revised Terms and update the effective date. If a change materially reduces your rights
        during a paid term, we will provide reasonable advance notice. Continued use after the
        change takes effect constitutes acceptance where permitted by law.
      </p>
    ),
  },
  {
    id: "contact",
    title: "18. Contact",
    body: (
      <p>
        Questions or legal notices regarding these Terms may be sent to{" "}
        <a href="mailto:support@namuh.co?subject=Terms%20of%20Service">support@namuh.co</a>.
        Electronic notices may be sent to the email address associated with your account or
        organization.
      </p>
    ),
  },
];
