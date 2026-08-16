"use client";

export function reminderRequestPresentation(busy: boolean): Readonly<{
  ariaBusy: boolean;
  action: "idle" | "pending";
}> {
  return {
    ariaBusy: busy,
    action: busy ? "pending" : "idle",
  };
}
