import { describe, expect, it } from "vitest";
import { localRuntimeCommand } from "./run-local-service";

const environment = {
  API_PORT: "8987",
  API_INSPECTOR_PORT: "9287",
  WRANGLER_PERSIST_TO: ".wrangler/state-product-evaluation-loop",
  WEB_PORT: "3045",
  PLAYWRIGHT_WEB_PORT: "3046",
};

describe("local service launcher", () => {
  it("passes isolated API listeners and persistence to Wrangler", () => {
    expect(localRuntimeCommand("api-dev", environment).args).toEqual([
      "wrangler",
      "dev",
      "--env-file",
      expect.stringMatching(/\/\.env$/u),
      "--ip",
      "127.0.0.1",
      "--port",
      "8987",
      "--inspector-port",
      "9287",
      "--persist-to",
      ".wrangler/state-product-evaluation-loop",
    ]);
  });

  it("uses the same persistence directory for local D1 migrations", () => {
    expect(localRuntimeCommand("api-migrate", environment).args).toEqual([
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--persist-to",
      ".wrangler/state-product-evaluation-loop",
    ]);
  });

  it("passes the isolated listener to Next.js", () => {
    expect(localRuntimeCommand("web-dev", environment)).toEqual({
      command: "node",
      cwd: expect.stringMatching(/\/apps\/web$/u),
      args: [
        expect.stringMatching(/\/apps\/web\/node_modules\/next\/dist\/bin\/next$/u),
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3045",
      ],
    });
  });

  it("passes the isolated Playwright listener without workspace dotenv loading", () => {
    expect(localRuntimeCommand("web-playwright", environment).args).toEqual([
      expect.stringMatching(/\/apps\/web\/node_modules\/next\/dist\/bin\/next$/u),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3046",
    ]);
  });
});
