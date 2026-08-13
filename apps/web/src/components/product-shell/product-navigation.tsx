import { ThemeToggle } from "./theme-toggle";

const productNavigationLinks = [
  { href: "/#workflow", label: "Product", primary: false },
  { href: "/#workspaces", label: "Workspaces", primary: false },
  { href: "/events", label: "Live demo", primary: false },
  { href: "/login", label: "Sign in", primary: true },
] as const;

export function ProductNavigation() {
  return (
    <header className="product-nav-shell">
      <div className="product-nav-inner">
        <a className="product-brand" href="/" aria-label="Eventloom home">
          <span className="product-brand-mark" aria-hidden="true">
            EL
          </span>
          <span>
            <strong>Eventloom</strong>
            <small>Conference program operations</small>
          </span>
        </a>

        <nav className="product-nav" aria-label="Product navigation">
          <ul>
            {productNavigationLinks.map((link) => (
              <li key={link.href}>
                <a
                  className={`product-nav-link${link.primary ? " product-nav-link-primary" : ""}`}
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <ThemeToggle />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
