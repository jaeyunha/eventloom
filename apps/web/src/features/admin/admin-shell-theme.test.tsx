import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellSource = readFileSync(new URL("./admin-shell.tsx", import.meta.url), "utf8");
const shellStyles = readFileSync(new URL("./admin-shell.module.css", import.meta.url), "utf8");

describe("organizer workspace theme", () => {
  it("exposes the shared theme control from the workspace header", () => {
    expect(shellSource).toContain(
      'import { ThemeToggle } from "@/components/product-shell/theme-toggle";',
    );
    expect(shellSource).toContain("<ThemeToggle />");
  });

  it("defines a dark workspace palette instead of mixing light shell surfaces", () => {
    expect(shellStyles).toContain(":global(.dark) .adminShell");
    expect(shellStyles).toContain(":global(.dark) .workspaceHeader");
    expect(shellStyles).toContain(":global(.dark) .metricsSection");
  });

  it("keeps calendar rail and outside-month cells on dark surfaces", () => {
    expect(shellStyles).toContain(":global(.dark) .calendarRail");
    expect(shellStyles).toContain(":global(.dark) .calendarCellOutside");
  });
});
