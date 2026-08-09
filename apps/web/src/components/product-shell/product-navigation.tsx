export interface ProductNavigationLink {
  readonly href: string;
  readonly label: string;
  readonly description: string;
}

export interface ProductNavigationSection {
  readonly label: string;
  readonly links: readonly ProductNavigationLink[];
}

export const productNavigationSections: readonly ProductNavigationSection[] = [
  {
    label: "Primary workspaces",
    links: [
      {
        href: "/cfp/open-sessionboard-conf",
        label: "Call for speakers (CFP)",
        description: "Collect proposals and participant details.",
      },
      {
        href: "/portal",
        label: "Speaker portal",
        description: "Manage submissions, tasks, and profile details.",
      },
      {
        href: "/admin",
        label: "Organizer workspace",
        description: "Coordinate the program and make final decisions.",
      },
      {
        href: "/review",
        label: "Reviewer workspace",
        description: "Complete assigned, human-led evaluations.",
      },
      {
        href: "/admin/organizations/local-organization/events/demo-event/agenda",
        label: "Agenda workspace",
        description: "Build a conflict-safe event schedule.",
      },
    ],
  },
  {
    label: "Public and developer surfaces",
    links: [
      {
        href: "/embed/open-sessionboard-conf/speakers",
        label: "Public speaker gallery",
        description: "Show explicitly published speaker profiles.",
      },
      {
        href: "/embed/open-sessionboard-conf/agenda",
        label: "Public agenda",
        description: "Share the published program projection.",
      },
      {
        href: "/docs/api",
        label: "API docs",
        description: "Explore the versioned public API contract.",
      },
    ],
  },
];

export function ProductNavigation() {
  return (
    <header className="product-nav-shell">
      <div className="product-nav-inner">
        <a className="product-brand" href="/" aria-label="Open Sessionboard home">
          <span className="product-brand-mark" aria-hidden="true">
            OS
          </span>
          <span>
            <strong>Open Sessionboard</strong>
            <small>Program operations, kept deliberate.</small>
          </span>
        </a>

        <nav className="product-nav" aria-label="Product navigation">
          <div className="product-nav-groups">
            {productNavigationSections.map((section) => (
              <section className="product-nav-section" key={section.label}>
                <h2>{section.label}</h2>
                <ul>
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <a className="product-nav-link" href={link.href}>
                        <span>{link.label}</span>
                        <small>{link.description}</small>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
