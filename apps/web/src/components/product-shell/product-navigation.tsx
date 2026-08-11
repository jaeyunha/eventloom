const productNavigationLinks = [
  { href: "/cfp/devflow-conf-2027", label: "Call for speakers" },
  { href: "/embed/devflow-conf-2027/sessions", label: "Public program" },
  { href: "/login", label: "Sign in" },
] as const;

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
            <small>Conference program operations</small>
          </span>
        </a>

        <nav className="product-nav" aria-label="Product navigation">
          <ul>
            {productNavigationLinks.map((link) => (
              <li key={link.href}>
                <a
                  className={
                    link.href === "/login"
                      ? "product-nav-link product-nav-link-primary"
                      : "product-nav-link"
                  }
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
