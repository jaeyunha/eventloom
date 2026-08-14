import type { Metadata } from "next";
import { ProductNavigation } from "@/components/product-shell/product-navigation";
import {
  type PublicEventDirectoryResponse,
  PublicEventsDirectory,
} from "@/features/events/public-events-directory";

export const metadata: Metadata = {
  title: "Public events",
  description: "Browse published event programs and open calls for speakers.",
  robots: { index: true, follow: true },
};

export default async function PublicEventsPage() {
  const apiBaseUrl = process.env.API_UPSTREAM_ORIGIN?.trim();
  const organizations =
    apiBaseUrl === undefined
      ? []
      : await fetch(new URL("/api/public/events", apiBaseUrl), {
          cache: "no-store",
        })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`Public event directory returned HTTP ${response.status}.`);
            }
            return (await response.json()) as PublicEventDirectoryResponse;
          })
          .then((response) => response.data)
          .catch((error: unknown) => {
            console.error(
              JSON.stringify({
                event: "public_event_directory_load_failed",
                errorName: error instanceof Error ? error.name : "UnknownError",
                errorMessage:
                  error instanceof Error ? error.message : "Unknown public event directory error",
              }),
            );
            return [];
          });

  return (
    <div className="home-shell">
      <a className="skip-link" href="#events-directory">
        Skip to events
      </a>
      <ProductNavigation />

      <main className="event-directory-main" id="events-directory" tabIndex={-1}>
        <header className="event-directory-hero">
          <p className="home-kicker">Public events</p>
          <h1>Find an event, then choose where you want to go.</h1>
          <p>
            Browse published programs across organizations. When a call for speakers is open, you
            can start a proposal from the same event.
          </p>
        </header>

        <PublicEventsDirectory organizations={organizations} />
      </main>

      <footer className="home-footer">
        <div>
          <strong>Eventloom</strong>
          <span>Public programs and open calls, organized by event.</span>
        </div>
        <a className="home-inline-link" href="/">
          Back to home
        </a>
      </footer>
    </div>
  );
}
