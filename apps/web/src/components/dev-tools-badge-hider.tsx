"use client";

import { useEffect } from "react";

const STYLE_MARKER = "data-open-sessionboard-dev-tools";

function hideNextDevToolsBadge(): boolean {
  const portal = document.querySelector("nextjs-portal");
  const root = portal?.shadowRoot;
  if (root === null || root === undefined) return false;
  if (root.querySelector(`style[${STYLE_MARKER}]`) !== null) return true;

  const style = document.createElement("style");
  style.setAttribute(STYLE_MARKER, "hidden");
  style.textContent = `
    button[aria-label="Open issues overlay"],
    button[aria-label="Collapse issues badge"] {
      display: none !important;
    }
  `;
  root.append(style);
  return true;
}

export function DevToolsBadgeHider() {
  useEffect(() => {
    if (hideNextDevToolsBadge()) return;

    let frame = 0;
    const observer = new MutationObserver(() => {
      if (hideNextDevToolsBadge()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    function checkNextFrame(): void {
      if (hideNextDevToolsBadge()) {
        observer.disconnect();
        return;
      }
      frame = window.requestAnimationFrame(checkNextFrame);
    }
    frame = window.requestAnimationFrame(checkNextFrame);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
