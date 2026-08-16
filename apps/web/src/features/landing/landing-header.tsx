"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LandingIcon } from "./landing-icon";

function subscribeToHydration(): () => void {
  return () => undefined;
}

function clientHydrationSnapshot(): boolean {
  return true;
}

function serverHydrationSnapshot(): boolean {
  return false;
}

export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    clientHydrationSnapshot,
    serverHydrationSnapshot,
  );
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navLinksRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    if (!menuOpen) return;
    navLinksRef.current?.querySelector<HTMLElement>("a")?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  return (
    <header className={`site-header${menuOpen ? " open" : ""}`}>
      <nav className="nav wrap" aria-label="Primary navigation">
        <Link className="brand" href="#top" aria-label="Eventloom home">
          <span className="brand-mark" aria-hidden="true" />
          <span>Eventloom</span>
        </Link>
        <div className="nav-links" id="nav-links" ref={navLinksRef}>
          <Link href="#workflow" onClick={closeMenu}>
            Workflow
          </Link>
          <Link href="#workspaces" onClick={closeMenu}>
            Workspaces
          </Link>
          <Link href="#open-source" onClick={closeMenu}>
            Open source
          </Link>
          <Link href="#publishing" onClick={closeMenu}>
            Publishing model
          </Link>
          <Link className="nav-login" href="/login">
            Sign in
            <LandingIcon name="chevron-right" />
          </Link>
          <button
            className="theme-toggle"
            type="button"
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
            title={isDark ? "Use light theme" : "Use dark theme"}
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            <LandingIcon className="theme-icon-moon" name="moon" />
            <LandingIcon className="theme-icon-sun" name="sun" />
            <span className="theme-label">{isDark ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
        <button
          ref={menuButtonRef}
          className="menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="nav-links"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          onClick={() => {
            if (menuOpen) {
              closeMenu();
              return;
            }
            setMenuOpen(true);
          }}
        >
          <LandingIcon name="menu" />
        </button>
      </nav>
    </header>
  );
}
