"use client";

import { useEffect } from "react";

function observeRevealItems(revealItems: readonly HTMLElement[]): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -40px" },
  );

  revealItems.forEach((item) => {
    observer.observe(item);
  });

  return () => observer.disconnect();
}

export function LandingInteractions() {
  useEffect(() => {
    const root = document.getElementById("eventloom-landing");
    if (!root) return;

    const revealItems = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!("IntersectionObserver" in window) || reducedMotion) {
      revealItems.forEach((item) => {
        item.classList.add("is-visible");
      });
      return;
    }

    return observeRevealItems(revealItems);
  }, []);

  return null;
}
