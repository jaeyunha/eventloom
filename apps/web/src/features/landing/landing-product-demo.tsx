"use client";

import { type KeyboardEvent, useState } from "react";
import { LandingIcon } from "./landing-icon";
import { LandingProductPanels, type ProductPanel } from "./landing-product-panels";

const panels: readonly ProductPanel[] = ["collect", "review", "schedule", "publish"];

function DemoSidebar() {
  return (
    <aside className="app-sidebar" aria-hidden="true">
      <div className="context-switcher">
        <strong>Open Systems Summit</strong>
        <span>Sep 18–20 · Seoul</span>
      </div>
      <div className="side-group">
        <span className="side-label">Program</span>
        <span className="side-item">
          <LandingIcon name="overview" />
          Overview
        </span>
        <span className="side-item">
          <LandingIcon name="submissions" />
          Submissions
        </span>
        <span className="side-item">
          <LandingIcon name="check" />
          Reviews
        </span>
        <span className="side-item active">
          <LandingIcon name="agenda" />
          Agenda
        </span>
        <span className="side-item">
          <LandingIcon name="speakers" />
          Speakers
        </span>
      </div>
      <div className="side-group">
        <span className="side-label">Publish &amp; measure</span>
        <span className="side-item">
          <LandingIcon name="public-program" />
          Public program
        </span>
        <span className="side-item">
          <LandingIcon name="deliveries" />
          Deliveries
        </span>
      </div>
    </aside>
  );
}

export function LandingProductDemo() {
  const [activePanel, setActivePanel] = useState<ProductPanel>("schedule");

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? panels.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % panels.length
            : (index - 1 + panels.length) % panels.length;
    const nextPanel = panels[nextIndex] ?? "schedule";
    setActivePanel(nextPanel);
    document.getElementById(`tab-${nextPanel}`)?.focus();
  }

  return (
    <div className="product-stage" id="product-proof">
      <div className="product-frame">
        <div className="window-bar">
          <div className="window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="window-title">
            <span className="live-dot" aria-hidden="true" />
            Eventloom · Organizer workspace
          </div>
          <span className="window-meta">ILLUSTRATIVE WORKSPACE</span>
        </div>
        <div className="app-shell">
          <DemoSidebar />
          <div className="app-main">
            <div className="app-top">
              <div>
                <small>Program workspace / Agenda</small>
                <h2>Open Systems Summit</h2>
              </div>
              <div className="app-actions">
                <span className="app-action">Validate</span>
                <span className="app-action primary">Publish revision</span>
              </div>
            </div>
            <div className="workflow-tabs" role="tablist" aria-label="Eventloom workflow preview">
              {panels.map((panel, index) => {
                const selected = panel === activePanel;
                return (
                  <button
                    className="workflow-tab"
                    id={`tab-${panel}`}
                    key={panel}
                    role="tab"
                    type="button"
                    aria-selected={selected}
                    aria-controls={`panel-${panel}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActivePanel(panel)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                  >
                    {panel.charAt(0).toUpperCase() + panel.slice(1)}
                  </button>
                );
              })}
            </div>
            <LandingProductPanels activePanel={activePanel} />
          </div>
        </div>
      </div>
    </div>
  );
}
