"use client";

import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import styles from "./agenda-placement-queue.module.css";
import {
  AGENDA_PLACEMENT_TRAY_LIMIT,
  type AgendaPlacementDurationFilter,
  type AgendaPlacementSort,
  agendaPlacementQueueOptions,
  DEFAULT_AGENDA_PLACEMENT_FILTERS,
  filterAgendaPlacementSessions,
} from "./agenda-placement-queue-model";
import type { AgendaSession } from "./types";

interface AgendaPlacementQueueProps {
  sessions: readonly AgendaSession[];
  busy: boolean;
  onChooseSession: (sessionId: string) => void;
}

function sessionSupportingText(session: AgendaSession): string {
  return [
    session.format,
    `${session.durationMinutes} minutes`,
    session.speakerNames.join(", "),
  ].join(" · ");
}

export function AgendaPlacementQueue({
  sessions,
  busy,
  onChooseSession,
}: AgendaPlacementQueueProps) {
  const traySearchId = useId();
  const browserSearchId = useId();
  const [browserOpen, setBrowserOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("all");
  const [format, setFormat] = useState("all");
  const [duration, setDuration] = useState<AgendaPlacementDurationFilter>("all");
  const [sort, setSort] = useState<AgendaPlacementSort>("title");
  const filters = useMemo(
    () => ({
      query,
      track,
      format,
      duration,
      sort,
    }),
    [duration, format, query, sort, track],
  );
  const filteredSessions = useMemo(
    () => filterAgendaPlacementSessions(sessions, filters),
    [filters, sessions],
  );
  const options = useMemo(() => agendaPlacementQueueOptions(sessions), [sessions]);
  const traySessions = filteredSessions.slice(0, AGENDA_PLACEMENT_TRAY_LIMIT);
  const hasLargeQueue = sessions.length > AGENDA_PLACEMENT_TRAY_LIMIT;
  const hasActiveFilters =
    query !== DEFAULT_AGENDA_PLACEMENT_FILTERS.query ||
    track !== DEFAULT_AGENDA_PLACEMENT_FILTERS.track ||
    format !== DEFAULT_AGENDA_PLACEMENT_FILTERS.format ||
    duration !== DEFAULT_AGENDA_PLACEMENT_FILTERS.duration ||
    sort !== DEFAULT_AGENDA_PLACEMENT_FILTERS.sort;

  function chooseSession(sessionId: string) {
    setBrowserOpen(false);
    onChooseSession(sessionId);
  }

  function clearFilters() {
    setQuery(DEFAULT_AGENDA_PLACEMENT_FILTERS.query);
    setTrack(DEFAULT_AGENDA_PLACEMENT_FILTERS.track);
    setFormat(DEFAULT_AGENDA_PLACEMENT_FILTERS.format);
    setDuration(DEFAULT_AGENDA_PLACEMENT_FILTERS.duration);
    setSort(DEFAULT_AGENDA_PLACEMENT_FILTERS.sort);
  }

  return (
    <>
      <section
        className={styles.queue}
        data-queue-total={sessions.length}
        data-queue-visible={traySessions.length}
      >
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Placement queue</span>
            <h3>Sessions to place</h3>
          </div>
          <span className={styles.total}>
            {sessions.length} session{sessions.length === 1 ? "" : "s"}
          </span>
        </div>

        {hasLargeQueue ? (
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <label className={styles.srOnly} htmlFor={traySearchId}>
                Search sessions to place
              </label>
              <Search aria-hidden="true" size={16} />
              <Input
                id={traySearchId}
                type="search"
                value={query}
                placeholder="Search title, speaker, track, or format"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              aria-haspopup="dialog"
              aria-expanded={browserOpen}
              onClick={() => setBrowserOpen(true)}
            >
              Browse all
              <span className={styles.buttonCount}>{sessions.length}</span>
            </Button>
          </div>
        ) : null}

        {traySessions.length === 0 ? (
          <div className={styles.empty}>
            <strong>{sessions.length === 0 ? "Placement queue complete" : "No matches"}</strong>
            <span>
              {sessions.length === 0
                ? "Drag a scheduled session here to return it to the queue."
                : "Try a different title, speaker, track, or format."}
            </span>
          </div>
        ) : (
          <>
            <p className={styles.context}>
              {hasLargeQueue
                ? "A compact working set stays beside the timetable. Search here or browse the full queue."
                : "Accepted sessions waiting for a time and room."}
            </p>
            <ul className={styles.tray}>
              {traySessions.map((session) => (
                <li
                  className={styles.card}
                  data-queue-session={session.id}
                  draggable
                  key={session.id}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", session.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <div className={styles.cardCopy}>
                    <strong>{session.title}</strong>
                    <span>{sessionSupportingText(session)}</span>
                    <span>
                      Tracks:{" "}
                      {session.trackNames.length > 0 ? session.trackNames.join(", ") : "None"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => chooseSession(session.id)}
                  >
                    Choose time and room
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}

        {filteredSessions.length > traySessions.length ? (
          <p className={styles.remainder}>
            Showing {traySessions.length} of {filteredSessions.length} matching sessions.
          </p>
        ) : null}
      </section>

      <Dialog open={browserOpen} onOpenChange={setBrowserOpen}>
        <DialogContent className={styles.browserDialog}>
          <DialogHeader className={styles.browserHeader}>
            <span className={styles.eyebrow}>Session inventory</span>
            <DialogTitle>Browse placement queue</DialogTitle>
            <DialogDescription>
              Find an accepted session, then place it without expanding the schedule workspace.
            </DialogDescription>
          </DialogHeader>

          <div className={styles.browserControls}>
            <div className={styles.browserSearch}>
              <label htmlFor={browserSearchId}>Search sessions</label>
              <span className={styles.search}>
                <Search aria-hidden="true" size={16} />
                <Input
                  id={browserSearchId}
                  type="search"
                  value={query}
                  placeholder="Title, speaker, track, or format"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </span>
            </div>
            <div className={styles.filterGrid}>
              <label>
                <span>Track</span>
                <select value={track} onChange={(event) => setTrack(event.target.value)}>
                  <option value="all">All tracks</option>
                  {options.tracks.map((trackName) => (
                    <option key={trackName} value={trackName}>
                      {trackName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Format</span>
                <select value={format} onChange={(event) => setFormat(event.target.value)}>
                  <option value="all">All formats</option>
                  {options.formats.map((formatName) => (
                    <option key={formatName} value={formatName}>
                      {formatName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Duration</span>
                <select
                  value={duration}
                  onChange={(event) =>
                    setDuration(event.target.value as AgendaPlacementDurationFilter)
                  }
                >
                  <option value="all">Any duration</option>
                  <option value="up-to-30">Up to 30 minutes</option>
                  <option value="31-to-60">31–60 minutes</option>
                  <option value="over-60">Over 60 minutes</option>
                </select>
              </label>
              <label>
                <span>Sort</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as AgendaPlacementSort)}
                >
                  <option value="title">Title A–Z</option>
                  <option value="shortest">Shortest first</option>
                  <option value="longest">Longest first</option>
                </select>
              </label>
            </div>
          </div>

          <div className={styles.resultSummary} role="status">
            <span>
              <strong>{filteredSessions.length}</strong> of {sessions.length} sessions
            </span>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>

          {filteredSessions.length === 0 ? (
            <div className={styles.browserEmpty}>
              <strong>No sessions match these filters</strong>
              <span>Clear filters or broaden the search to continue.</span>
            </div>
          ) : (
            <ul className={styles.browserList} aria-label="Filtered placement queue">
              {filteredSessions.map((session) => (
                <li
                  className={styles.browserItem}
                  draggable
                  key={session.id}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", session.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <div className={styles.browserItemCopy}>
                    <strong>{session.title}</strong>
                    <span>{sessionSupportingText(session)}</span>
                    <span>
                      {session.trackNames.length > 0 ? session.trackNames.join(", ") : "No track"} ·
                      Needs {session.capacityRequired} seats
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => chooseSession(session.id)}
                  >
                    Place
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
