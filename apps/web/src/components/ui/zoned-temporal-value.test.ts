import { beforeEach, describe, expect, it, vi } from "vitest";

const reactHarness = vi.hoisted(() => ({
  effectCursor: 0,
  effectDependencies: [] as Array<readonly unknown[] | undefined>,
  refCursor: 0,
  refSlots: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  stateSlots: [] as unknown[],
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: (effect: () => void, dependencies?: readonly unknown[]) => {
      const index = reactHarness.effectCursor;
      reactHarness.effectCursor += 1;
      const previous = reactHarness.effectDependencies[index];
      reactHarness.effectDependencies[index] = dependencies;
      if (
        previous === undefined ||
        dependencies === undefined ||
        dependencies.some(
          (dependency, dependencyIndex) => !Object.is(dependency, previous[dependencyIndex]),
        )
      ) {
        effect();
      }
    },
    useRef: <T>(initial: T) => {
      const index = reactHarness.refCursor;
      reactHarness.refCursor += 1;
      if (!(index in reactHarness.refSlots)) reactHarness.refSlots[index] = { current: initial };
      return reactHarness.refSlots[index] as { current: T };
    },
    useState: <T>(initial: T | (() => T)) => {
      const index = reactHarness.stateCursor;
      reactHarness.stateCursor += 1;
      if (!(index in reactHarness.stateSlots)) {
        reactHarness.stateSlots[index] =
          typeof initial === "function" ? (initial as () => T)() : initial;
      }
      const setState = (next: T | ((current: T) => T)) => {
        const current = reactHarness.stateSlots[index] as T;
        reactHarness.stateSlots[index] =
          typeof next === "function" ? (next as (value: T) => T)(current) : next;
      };
      return [reactHarness.stateSlots[index] as T, setState] as const;
    },
  };
});

import { useZonedTemporalRange, useZonedTemporalValue } from "./zoned-temporal-value";

function beginRender(): void {
  reactHarness.effectCursor = 0;
  reactHarness.refCursor = 0;
  reactHarness.stateCursor = 0;
}

describe("zoned temporal value", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reactHarness.effectDependencies.length = 0;
    reactHarness.refSlots.length = 0;
    reactHarness.stateSlots.length = 0;
    beginRender();
  });

  it("immediately propagates a cleared zoned value to its parent", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    const value = useZonedTemporalValue({
      value: "2026-08-24T23:00:00.000Z",
      valueTimeZone: "America/Los_Angeles",
      onChange,
      onValidityChange,
    });

    value.updateDraft("");

    expect(onChange).toHaveBeenCalledWith("");
    expect(onValidityChange).toHaveBeenCalledWith(true);
  });

  it("marks a nonexistent DST draft invalid without re-emitting the previous instant", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    const value = useZonedTemporalValue({
      value: "2026-03-08T09:30:00.000Z",
      valueTimeZone: "America/Los_Angeles",
      onChange,
      onValidityChange,
    });

    value.updateDraft("2026-03-08T02:30");

    expect(onChange).not.toHaveBeenCalled();
    expect(onValidityChange).toHaveBeenCalledWith(false);
  });

  it("restores validity when the server replaces an invalid local draft", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    const initialValue = "2026-03-08T09:30:00.000Z";
    const options = {
      value: initialValue,
      valueTimeZone: "America/Los_Angeles",
      onChange,
      onValidityChange,
    };
    const value = useZonedTemporalValue(options);

    value.updateDraft("2026-03-08T02:30");
    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    beginRender();
    useZonedTemporalValue(options);
    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    beginRender();
    useZonedTemporalValue({
      ...options,
      value: "2026-03-08T10:30:00.000Z",
    });
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it("restores range validity when the server replaces an invalid round draft", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    const options = {
      startValue: "2026-03-08T09:00:00.000Z",
      endValue: "2026-03-08T11:00:00.000Z",
      valueTimeZone: "America/Los_Angeles",
      onChange,
      onValidityChange,
    };
    const range = useZonedTemporalRange(options);

    range.updateRange({ start: "2026-03-08T02:30", end: "2026-03-08T04:00" });
    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    beginRender();
    useZonedTemporalRange(options);
    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    beginRender();
    useZonedTemporalRange({
      ...options,
      startValue: "2026-03-08T10:00:00.000Z",
      endValue: "2026-03-08T12:00:00.000Z",
    });
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it("propagates a cleared zoned range and invalidates an unresolved boundary", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    const range = useZonedTemporalRange({
      startValue: "2026-03-08T09:00:00.000Z",
      endValue: "2026-03-08T11:00:00.000Z",
      valueTimeZone: "America/Los_Angeles",
      onChange,
      onValidityChange,
    });

    range.updateRange({ start: "", end: "" });
    expect(onChange).toHaveBeenLastCalledWith({ start: "", end: "" });
    expect(onValidityChange).toHaveBeenLastCalledWith(true);

    onChange.mockClear();
    range.updateRange({ start: "2026-03-08T02:30", end: "2026-03-08T04:00" });
    expect(onChange).not.toHaveBeenCalled();
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });
});
