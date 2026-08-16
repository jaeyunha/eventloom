import Link from "next/link";
import type { ReactNode } from "react";
import { ProductNavigation } from "@/components/product-shell/product-navigation";
import styles from "./legal-document.module.css";

export type LegalSection = Readonly<{
  id: string;
  title: string;
  body: ReactNode;
}>;

type LegalDocumentProps = Readonly<{
  title: string;
  description: string;
  effectiveDate: string;
  summary: ReactNode;
  sections: readonly LegalSection[];
}>;

export function LegalDocument({
  title,
  description,
  effectiveDate,
  summary,
  sections,
}: LegalDocumentProps) {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#legal-content">
        Skip to legal content
      </a>
      <ProductNavigation />

      <main className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Eventloom legal</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
          <p className={styles.meta}>
            <span>
              <strong>Effective:</strong> {effectiveDate}
            </span>
            <span>
              <strong>Contact:</strong> <a href="mailto:support@namuh.co">support@namuh.co</a>
            </span>
          </p>
        </header>

        <div className={styles.summary}>
          <span className={styles.summaryLabel}>Plain-language summary</span>
          {summary}
        </div>

        <div className={styles.contentGrid}>
          <aside className={styles.toc} aria-label={`${title} table of contents`}>
            <span className={styles.tocLabel}>On this page</span>
            <ol>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </aside>

          <article className={styles.document} id="legal-content" tabIndex={-1}>
            {sections.map((section) => (
              <section className={styles.section} id={section.id} key={section.id}>
                <h2>{section.title}</h2>
                {section.body}
              </section>
            ))}
          </article>
        </div>

        <footer className={styles.footer}>
          <p>
            <strong>Eventloom</strong>
            <br />
            Open program operations, operated by Namuh.
          </p>
          <nav aria-label="Legal footer navigation">
            <Link href="/">Home</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:support@namuh.co">Support</a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
