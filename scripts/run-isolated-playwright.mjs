import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const e2eDirectory = join(repositoryRoot, "tests/e2e");
const reservedPorts = new Set([3115, 8887]);
const nextDistDir =
  process.env.PLAYWRIGHT_NEXT_DIST_DIR?.trim() || `.next-playwright-isolated-${process.pid}`;

function parsePort(value, name) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${name} must be a TCP port between 1024 and 65535.`);
  }
  return port;
}

function assertAvailablePlan(specFiles, basePorts) {
  for (const [index, specFile] of specFiles.entries()) {
    for (const [name, basePort] of Object.entries(basePorts)) {
      const port = basePort + index;
      if (port > 65_535) {
        throw new Error(`${name} port plan exceeds 65535 at ${specFile}.`);
      }
      if (reservedPorts.has(port)) {
        throw new Error(`${name} port plan would use reserved judge port ${port}.`);
      }
    }
  }
}

function runSpec(specFile, index, total, basePorts) {
  const webPort = String(basePorts.web + index);
  const apiPort = String(basePorts.api + index);
  const inspectorPort = String(basePorts.inspector + index);
  const relativeSpec = relative(repositoryRoot, specFile);

  console.log(
    `\n[isolated-e2e ${index + 1}/${total}] ${relativeSpec} ` +
      `(web ${webPort}, api ${apiPort}, inspector ${inspectorPort})`,
  );

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("bunx", ["playwright", "test", relativeSpec, "--workers=1"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        PLAYWRIGHT_WEB_PORT: webPort,
        PLAYWRIGHT_API_PORT: apiPort,
        PLAYWRIGHT_API_INSPECTOR_PORT: inspectorPort,
        PLAYWRIGHT_NEXT_DIST_DIR: nextDistDir,
        PLAYWRIGHT_REUSE_EXISTING_SERVER: "false",
      },
      stdio: "inherit",
    });

    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (signal !== null) {
        rejectRun(new Error(`${relativeSpec} terminated by ${signal}.`));
        return;
      }
      resolveRun(code ?? 1);
    });
  });
}

const specFiles = readdirSync(e2eDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.ts"))
  .map((entry) => join(e2eDirectory, entry.name))
  .sort();

if (specFiles.length === 0) {
  throw new Error("No Playwright spec files were found.");
}

const basePorts = {
  web: parsePort(process.env.PLAYWRIGHT_WEB_PORT?.trim() || "3120", "PLAYWRIGHT_WEB_PORT"),
  api: parsePort(process.env.PLAYWRIGHT_API_PORT?.trim() || "8810", "PLAYWRIGHT_API_PORT"),
  inspector: parsePort(
    process.env.PLAYWRIGHT_API_INSPECTOR_PORT?.trim() || "9250",
    "PLAYWRIGHT_API_INSPECTOR_PORT",
  ),
};

assertAvailablePlan(specFiles, basePorts);

const failures = [];
for (const [index, specFile] of specFiles.entries()) {
  const exitCode = await runSpec(specFile, index, specFiles.length, basePorts);
  if (exitCode !== 0) failures.push(relative(repositoryRoot, specFile));
}

if (failures.length > 0) {
  throw new Error(`Isolated Playwright failures:\n- ${failures.join("\n- ")}`);
}

console.log(`\nAll ${specFiles.length} isolated Playwright spec files passed.`);
