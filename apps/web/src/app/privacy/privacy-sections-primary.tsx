import type { LegalSection } from "@/components/legal/legal-document";

export const privacySectionsPrimary: readonly LegalSection[] = [
  {
    id: "scope",
    title: "1. Scope and who we are",
    body: (
      <>
        <p>
          Eventloom is a conference program operations service operated by Namuh (&quot;Namuh,&quot;
          &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). This Privacy Policy explains how we
          collect, use, disclose, and protect personal information when you visit our public
          websites or use the hosted Eventloom service.
        </p>
        <p>
          Organizations may also deploy Eventloom on infrastructure they control. A self-hosted
          operator is responsible for its own privacy practices, and this Policy does not govern
          personal information processed solely by that independent deployment.
        </p>
      </>
    ),
  },
  {
    id: "information",
    title: "2. Information we collect",
    body: (
      <>
        <p>We collect information in the following categories:</p>
        <ul>
          <li>
            <strong>Account and identity information.</strong> Name, email address, password
            verifier, email-verification status, profile details, account roles, and authentication
            records. If Google sign-in is offered and you choose it, we may receive your name, email
            address, profile image, and a stable Google account identifier.
          </li>
          <li>
            <strong>Program and event content.</strong> Organization and event settings, speaker
            profiles, proposals, reviews, rubric scores, schedules, session details, messages,
            tasks, files, and other content you submit or manage.
          </li>
          <li>
            <strong>Integration information.</strong> OAuth grants, encrypted access and refresh
            tokens, workspace or base identifiers, field mappings, synchronization state, and the
            records you direct us to exchange with services such as Airtable.
          </li>
          <li>
            <strong>Billing information.</strong> Plan, subscription, invoice, transaction, and
            billing-contact details. Payment processors handle complete card or bank credentials; we
            do not intend to store full payment-card numbers.
          </li>
          <li>
            <strong>Usage and device information.</strong> IP address, browser and device type,
            pages and features used, timestamps, referral data, errors, diagnostic events, and
            security logs.
          </li>
          <li>
            <strong>Communications.</strong> Support requests, product feedback, survey responses,
            and records of service-related correspondence.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "sources",
    title: "3. Where information comes from",
    body: (
      <p>
        We receive information directly from you, from organizers or organizations that invite you
        into an event, automatically from your use of the service, and from integrations you
        authorize. If you submit information about another person, you must have permission to do so
        and must provide any notice required by law.
      </p>
    ),
  },
  {
    id: "uses",
    title: "4. How we use information",
    body: (
      <>
        <p>We use personal information to:</p>
        <ul>
          <li>Provide, secure, maintain, troubleshoot, and improve Eventloom.</li>
          <li>Authenticate users and preserve organization, event, and role-based access.</li>
          <li>Process submissions, reviews, schedules, publications, files, and communications.</li>
          <li>Run integrations and synchronizations that an authorized user configures.</li>
          <li>Provide user-requested advisory AI features that remain subject to human review.</li>
          <li>Administer subscriptions, payments, account notices, and customer support.</li>
          <li>Prevent fraud, abuse, security incidents, and violations of our Terms.</li>
          <li>Comply with law, enforce agreements, and protect users, Namuh, and the public.</li>
          <li>
            Analyze aggregated or de-identified service performance and product usage. We do not
            attempt to re-identify data that we have de-identified.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "oauth",
    title: "5. OAuth and connected services",
    body: (
      <>
        <p>
          Connected services are optional. Before you authorize one, its consent screen identifies
          the requested permissions. We use the resulting grant only to provide the connection you
          requested, maintain its security, and comply with law.
        </p>
        <p>
          <strong>Airtable.</strong> If your organization connects Airtable, Eventloom may access
          selected base metadata and records within the authorized scopes, store encrypted OAuth
          credentials, and exchange only the fields configured by an authorized organization member.
          Disconnecting Airtable stops future synchronization and makes the related credentials
          unusable, subject to short-lived security and recovery records.
        </p>
        <p>
          <strong>Google.</strong> If Google sign-in becomes available and you select it, Eventloom
          uses basic identity information to create or authenticate your Eventloom account. Google
          sign-in does not by itself grant access to Google Drive, Calendar, Gmail, or other Google
          content. Any future Google feature requiring additional scopes will ask for separate,
          specific authorization.
        </p>
        <p>
          Eventloom&apos;s use and transfer of information received from Google APIs will adhere to
          the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements. We do not sell connected-account data or use it
          for personalized advertising.
        </p>
      </>
    ),
  },
  {
    id: "legal-bases",
    title: "6. Legal bases",
    body: (
      <p>
        Where a legal basis is required, we process information to perform our contract with you or
        your organization, pursue legitimate interests such as service security and improvement,
        comply with legal obligations, and act on consent where we ask for it. You may withdraw
        consent at any time, but withdrawal does not affect processing already completed.
      </p>
    ),
  },
  {
    id: "disclosures",
    title: "7. How we disclose information",
    body: (
      <>
        <p>We may disclose information to:</p>
        <ul>
          <li>
            <strong>Your organization and authorized collaborators</strong> according to the event,
            role, assignment, and publication settings they control.
          </li>
          <li>
            <strong>Service providers</strong> that support hosting, storage, security, email,
            calendar delivery, analytics, customer support, payments, and user-requested AI
            features. They may process information only to provide contracted services to us.
          </li>
          <li>
            <strong>Connected services</strong> such as Airtable or Google when you or your
            organization direct the connection.
          </li>
          <li>
            <strong>Authorities or other parties</strong> when reasonably necessary to comply with
            law, protect rights and safety, investigate abuse, or enforce agreements.
          </li>
          <li>
            <strong>A successor</strong> in a merger, financing, acquisition, reorganization, or
            sale of assets, subject to appropriate confidentiality and notice obligations.
          </li>
        </ul>
        <p>We do not sell personal information.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "8. Retention and deletion",
    body: (
      <p>
        We retain account and event information while it is needed to provide the service and as
        directed by the controlling organization. After deletion or termination, we delete,
        de-identify, or isolate information within a commercially reasonable period, subject to
        backups, fraud prevention, dispute resolution, audit integrity, and legal obligations.
        Billing records may be kept for legally required accounting periods. OAuth credentials are
        removed or rendered unusable when a connection is revoked, subject to short-lived security
        records.
      </p>
    ),
  },
  {
    id: "security",
    title: "9. Security",
    body: (
      <p>
        We use administrative, technical, and organizational safeguards designed to protect
        information, including access controls, tenant and event authorization, encrypted transport,
        restricted production access, audit records, and protected credential storage. No system is
        completely secure. You are responsible for protecting your login credentials and promptly
        notifying us of suspected unauthorized access.
      </p>
    ),
  },
  {
    id: "international",
    title: "10. International transfers",
    body: (
      <p>
        Eventloom and its service providers may process information in countries other than your
        own. Where required, we use recognized transfer mechanisms and contractual protections. An
        organization that controls an Eventloom workspace may have additional obligations to its
        speakers, reviewers, applicants, and staff.
      </p>
    ),
  },
];
