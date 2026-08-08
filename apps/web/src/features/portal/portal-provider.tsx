"use client";

import { useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortalApi, type PortalApi, PortalApiError } from "./api";
import type { PortalProfile, PortalTask, PortalTaskStatus, PortalView } from "./types";

interface PortalContextValue {
  eventId: string;
  eventQuery: string;
  view: PortalView | null;
  loading: boolean;
  error: string | null;
  mutationError: string | null;
  busyTaskIds: ReadonlySet<string>;
  savingProfile: boolean;
  reload(): Promise<void>;
  saveBiography(profile: PortalProfile, biography: string): Promise<boolean>;
  transitionTask(task: PortalTask, toStatus: PortalTaskStatus, note?: string): Promise<boolean>;
  uploadTask(task: PortalTask, file: File): Promise<boolean>;
  clearMutationError(): void;
}

const PortalContext = createContext<PortalContextValue | null>(null);

function messageFrom(error: unknown): string {
  if (error instanceof PortalApiError || error instanceof Error) {
    return error.message;
  }
  return "The speaker portal request could not be completed.";
}

function withUpdatedTask(view: PortalView, task: PortalTask): PortalView {
  const tasks = view.tasks.map((candidate) => (candidate.id === task.id ? task : candidate));
  return {
    ...view,
    tasks,
    outstandingTaskCount: tasks.filter(
      (candidate) => candidate.status !== "completed" && candidate.status !== "waived",
    ).length,
  };
}

export function PortalProvider({ children }: Readonly<{ children: ReactNode }>) {
  const searchParams = useSearchParams();
  const configuredEventId = process.env.NEXT_PUBLIC_PORTAL_EVENT_ID?.trim();
  const eventId = searchParams.get("event")?.trim() || configuredEventId || "current";
  const eventQuery = eventId === "current" ? "" : `?event=${encodeURIComponent(eventId)}`;
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  const api = useMemo<PortalApi | null>(
    () => (apiBaseUrl ? createPortalApi(apiBaseUrl) : null),
    [apiBaseUrl],
  );
  const [view, setView] = useState<PortalView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busyTaskIds, setBusyTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [savingProfile, setSavingProfile] = useState(false);

  const reload = useCallback(async () => {
    if (!api) {
      setError("The speaker portal API URL is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setView(await api.getPortal(eventId));
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  }, [api, eventId]);

  useEffect(() => {
    if (!api) {
      setError("The speaker portal API URL is not configured.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .getPortal(eventId, controller.signal)
      .then(setView)
      .catch((loadError: unknown) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setError(messageFrom(loadError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [api, eventId]);

  const saveBiography = useCallback(
    async (profile: PortalProfile, biography: string) => {
      if (!api) {
        setMutationError("The speaker portal API URL is not configured.");
        return false;
      }
      setSavingProfile(true);
      setMutationError(null);
      try {
        const updated = await api.updateBiography({
          eventId,
          participantId: profile.participantId,
          biography,
          expectedVersion: profile.version,
        });
        setView((current) =>
          current
            ? {
                ...current,
                profiles: current.profiles.map((candidate) =>
                  candidate.participantId === updated.participantId ? updated : candidate,
                ),
              }
            : current,
        );
        return true;
      } catch (saveError) {
        setMutationError(messageFrom(saveError));
        return false;
      } finally {
        setSavingProfile(false);
      }
    },
    [api, eventId],
  );

  const transitionTask = useCallback(
    async (task: PortalTask, toStatus: PortalTaskStatus, note?: string) => {
      if (!api) {
        setMutationError("The speaker portal API URL is not configured.");
        return false;
      }
      setBusyTaskIds((current) => new Set(current).add(task.id));
      setMutationError(null);
      try {
        const updated = await api.transitionTask({
          eventId,
          taskId: task.id,
          toStatus,
          expectedVersion: task.version,
          ...(note === undefined ? {} : { note }),
        });
        setView((current) => (current ? withUpdatedTask(current, updated) : current));
        return true;
      } catch (transitionError) {
        setMutationError(messageFrom(transitionError));
        return false;
      } finally {
        setBusyTaskIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
      }
    },
    [api, eventId],
  );

  const uploadTask = useCallback(
    async (task: PortalTask, file: File) => {
      if (!api) {
        setMutationError("The speaker portal API URL is not configured.");
        return false;
      }
      const kind = task.acceptedAssetKinds?.[0];
      if (!kind) {
        setMutationError("This upload task does not specify an accepted file kind.");
        return false;
      }
      setBusyTaskIds((current) => new Set(current).add(task.id));
      setMutationError(null);
      try {
        await api.uploadTaskFile({
          eventId,
          participantId: task.participantId,
          taskId: task.id,
          kind,
          file,
        });
        const updated = await api.transitionTask({
          eventId,
          taskId: task.id,
          toStatus: "submitted",
          expectedVersion: task.version,
          note: `Uploaded ${file.name}`,
        });
        setView((current) => (current ? withUpdatedTask(current, updated) : current));
        return true;
      } catch (uploadError) {
        setMutationError(messageFrom(uploadError));
        return false;
      } finally {
        setBusyTaskIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
      }
    },
    [api, eventId],
  );

  const value = useMemo<PortalContextValue>(
    () => ({
      eventId,
      eventQuery,
      view,
      loading,
      error,
      mutationError,
      busyTaskIds,
      savingProfile,
      reload,
      saveBiography,
      transitionTask,
      uploadTask,
      clearMutationError: () => setMutationError(null),
    }),
    [
      busyTaskIds,
      error,
      eventId,
      eventQuery,
      loading,
      mutationError,
      reload,
      saveBiography,
      savingProfile,
      transitionTask,
      uploadTask,
      view,
    ],
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalContextValue {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error("usePortal must be used inside PortalProvider.");
  }
  return context;
}
