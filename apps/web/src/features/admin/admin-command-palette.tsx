"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import styles from "./admin-command-palette.module.css";
import {
  type AdminCommandEvent,
  type AdminCommandPage,
  buildAdminCommandResults,
  loadAdminCommandEvents,
  nextCommandSelectionIndex,
} from "./admin-command-palette-model";
import {
  type AdminCommandEventState,
  AdminCommandPaletteResults,
} from "./admin-command-palette-results";

const noCommandEvents: readonly AdminCommandEvent[] = [];

export function AdminCommandPalette({
  currentEventId,
  onOpenChange,
  open,
  organizationId,
  pages,
  triggerClassName,
}: Readonly<{
  currentEventId: string | null;
  onOpenChange(open: boolean): void;
  open: boolean;
  organizationId: string | null;
  pages: readonly AdminCommandPage[];
  triggerClassName: string | undefined;
}>) {
  const router = useRouter();
  const requestController = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [eventState, setEventState] = useState<AdminCommandEventState>({ status: "idle" });
  const events = eventState.status === "loaded" ? eventState.events : noCommandEvents;
  const results = useMemo(
    () =>
      buildAdminCommandResults({
        currentEventId,
        events,
        organizationId,
        pages,
        query,
      }),
    [currentEventId, events, organizationId, pages, query],
  );
  const [activeIndex, setActiveIndex] = useState(-1);
  const resultSignature = results.map((result) => result.key).join("\u0000");

  const loadEvents = useCallback(() => {
    requestController.current?.abort();
    if (organizationId === null) {
      setEventState({ events: noCommandEvents, status: "loaded" });
      return;
    }
    const controller = new AbortController();
    requestController.current = controller;
    setEventState({ status: "loading" });
    void loadAdminCommandEvents(organizationId, controller.signal)
      .then((loadedEvents) => {
        if (!controller.signal.aborted) {
          setEventState({ events: loadedEvents, status: "loaded" });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!controller.signal.aborted) setEventState({ status: "error" });
      });
  }, [organizationId]);

  useEffect(() => {
    if (!open) {
      requestController.current?.abort();
      return;
    }
    setQuery("");
    loadEvents();
    return () => requestController.current?.abort();
  }, [loadEvents, open]);

  useEffect(() => {
    setActiveIndex(resultSignature.length === 0 ? -1 : 0);
  }, [resultSignature]);

  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .getElementById(`admin-command-result-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function chooseActiveResult(): void {
    const result = results[activeIndex];
    if (!result) return;
    onOpenChange(false);
    router.push(result.href);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const direction =
      event.key === "ArrowDown" ? "next" : event.key === "ArrowUp" ? "previous" : null;
    if (direction !== null) {
      event.preventDefault();
      setActiveIndex((current) => nextCommandSelectionIndex(current, results.length, direction));
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseActiveResult();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          aria-label="Search or jump to"
          aria-keyshortcuts="Meta+K Control+K"
          className={triggerClassName}
          title="Search or jump to (⌘ K)"
          type="button"
        >
          <Search aria-hidden="true" />
          <span>Search or jump to</span>
          <kbd>⌘ K</kbd>
        </button>
      </DialogTrigger>
      <DialogContent
        aria-label="Search events and pages"
        className={styles.dialog}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search events and pages</DialogTitle>
          <DialogDescription>
            Search the current organization and open a destination.
          </DialogDescription>
        </DialogHeader>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <span className="sr-only">Search events and pages</span>
          <input
            aria-activedescendant={
              activeIndex < 0 ? undefined : `admin-command-result-${activeIndex}`
            }
            aria-controls="admin-command-results"
            aria-expanded="true"
            aria-haspopup="listbox"
            ref={searchInputRef}
            placeholder="Search events and pages…"
            role="combobox"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className={styles.searchShortcut}>Esc</kbd>
        </label>
        <AdminCommandPaletteResults
          activeIndex={activeIndex}
          eventState={eventState}
          query={query}
          results={results}
          onActiveIndexChange={setActiveIndex}
          onOpenChange={onOpenChange}
          onRetry={loadEvents}
        />
        <div className={styles.footer} aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            Navigate
          </span>
          <span>
            <kbd>↵</kbd>
            Open
          </span>
          <span>
            <kbd>Esc</kbd>
            Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
