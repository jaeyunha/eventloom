import type { LegalSection } from "@/components/legal/legal-document";

export const termsSectionsPrimary: readonly LegalSection[] = [
  {
    id: "agreement",
    title: "1. Agreement to these Terms",
    body: (
      <p>
        These Terms of Service (&quot;Terms&quot;) govern access to the hosted Eventloom service,
        websites, and related support provided by Namuh (&quot;Namuh,&quot; &quot;we,&quot;
        &quot;us,&quot; or &quot;our&quot;). By creating an account, accepting an invitation, using
        Eventloom, or ordering a paid plan, you agree to these Terms. If you use Eventloom for an
        organization, you represent that you can bind that organization, and &quot;you&quot;
        includes it.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "2. Eligibility and accounts",
    body: (
      <>
        <p>
          You must be legally able to enter this agreement and provide accurate account information.
          One Eventloom account may hold organizer, reviewer, applicant, submitter, or speaker
          capabilities across multiple organizations and events. Access is determined by the
          permissions and assignments granted to that account, not by separate role identities.
        </p>
        <p>
          You are responsible for your credentials, authorized users, and activity under your
          account. Notify <a href="mailto:support@namuh.co">support@namuh.co</a> promptly if you
          suspect unauthorized access. We may require email verification, multi-step authentication,
          or other reasonable security measures.
        </p>
      </>
    ),
  },
  {
    id: "service",
    title: "3. The service",
    body: (
      <p>
        Eventloom helps organizations collect proposals, manage speakers and applicants, coordinate
        reviews, build schedules, communicate, publish program information, and operate related
        workflows. Features and limits depend on the selected plan. We may improve or change the
        service, but we will not materially reduce a paid plan&apos;s core functionality during its
        current subscription term without a reasonable migration path or remedy.
      </p>
    ),
  },
  {
    id: "customer-content",
    title: "4. Your content and responsibilities",
    body: (
      <>
        <p>
          You retain ownership of proposals, reviews, schedules, files, branding, messages, and
          other content you submit to Eventloom (&quot;Customer Content&quot;). You grant us a
          worldwide, limited license to host, copy, transmit, display, modify, and otherwise process
          Customer Content only as needed to provide, secure, support, and improve the service and
          to comply with law.
        </p>
        <p>
          You are responsible for Customer Content, event rules, privacy notices, reviewer
          instructions, publication decisions, and obtaining permissions from speakers, applicants,
          reviewers, staff, and other people whose information you process. You must not upload
          content you lack the right to use.
        </p>
      </>
    ),
  },
  {
    id: "integrations",
    title: "5. OAuth and third-party services",
    body: (
      <>
        <p>
          Eventloom may offer optional connections to third-party services, including Airtable and
          Google. When you authorize a connection, you direct us to exchange information with that
          provider within the permissions shown on its consent screen. Your use of the provider
          remains subject to its own terms and privacy policy.
        </p>
        <p>
          Organization administrators are responsible for selecting authorized bases, workspaces,
          fields, accounts, and synchronization settings. You can revoke an OAuth grant through
          Eventloom or the provider. A provider may change or discontinue its API, and we are not
          responsible for third-party services, but we will take reasonable steps to protect
          credentials and prevent their availability from blocking ordinary Eventloom operations.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "6. AI-assisted features",
    body: (
      <p>
        AI features in Eventloom are advisory. Suggestions may be incomplete, inaccurate, or
        unsuitable. A person must review, edit, apply, or reject every consequential suggestion,
        including scheduling, review, communication, and publication decisions. You remain
        responsible for the content you submit to an AI feature and for decisions made using its
        output. Do not submit information you are not authorized to process.
      </p>
    ),
  },
  {
    id: "subscriptions",
    title: "7. Paid plans, billing, and renewal",
    body: (
      <>
        <p>
          Paid plans are billed according to the pricing page, checkout, or order form presented
          when you subscribe. Unless stated otherwise, subscriptions renew automatically for the
          same period until canceled. You authorize us and our payment processor to charge the
          payment method on file for fees and applicable taxes.
        </p>
        <p>
          You may cancel renewal before the next billing date. Cancellation normally takes effect at
          the end of the paid term, and fees are non-refundable except where law, an order form, or
          a written refund policy says otherwise. We may change fees prospectively with at least 30
          days&apos; notice before the affected renewal. Overdue amounts may result in restricted
          access after reasonable notice.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "8. Acceptable use",
    body: (
      <>
        <p>You may not use Eventloom to:</p>
        <ul>
          <li>Break the law, infringe rights, deceive people, or facilitate harmful conduct.</li>
          <li>
            Send spam, unlawful marketing, malware, phishing, or communications without required
            consent.
          </li>
          <li>
            Probe, bypass, or disrupt security, authorization, rate limits, tenant isolation, or
            service availability.
          </li>
          <li>
            Access another customer&apos;s data, share credentials improperly, or use automated
            means beyond documented interfaces.
          </li>
          <li>
            Reverse engineer the hosted service except where applicable law expressly permits it.
          </li>
          <li>
            Use the service to build or train a competing product from non-public Eventloom data or
            output.
          </li>
        </ul>
        <p>
          We may investigate suspected violations and remove content or restrict access when
          reasonably necessary to protect the service or others.
        </p>
      </>
    ),
  },
  {
    id: "privacy",
    title: "9. Privacy and security",
    body: (
      <p>
        Our <a href="/privacy">Privacy Policy</a> explains how we handle personal information.
        Organizations are responsible for configuring access, obtaining required notices and
        consents, and using Eventloom consistently with applicable privacy and employment laws. If
        we enter a data processing addendum or order form with you, that document controls for its
        subject matter.
      </p>
    ),
  },
  {
    id: "ownership",
    title: "10. Our service and intellectual property",
    body: (
      <>
        <p>
          Namuh and its licensors retain all rights in the hosted service, product design,
          trademarks, documentation, and technology other than Customer Content. These Terms grant
          only the limited right to use the hosted service during your authorized subscription or
          access period.
        </p>
        <p>
          Source code made available separately is governed by the license identified in its
          repository, not by these hosted-service Terms. If you provide feedback, you grant us a
          perpetual, worldwide, royalty-free right to use it without identifying you or your
          organization.
        </p>
      </>
    ),
  },
  {
    id: "confidentiality",
    title: "11. Confidentiality",
    body: (
      <p>
        Each party may receive non-public information that a reasonable person would understand to
        be confidential. The receiving party will use it only to perform under these Terms, protect
        it with reasonable care, and disclose it only to people and providers who need it and are
        bound to protect it. This does not cover information that is public without breach,
        independently developed, already lawfully known, or lawfully received from another source.
      </p>
    ),
  },
];
