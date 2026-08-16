import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { createServer } from "node:net";
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

function reservePort() {
  return new Promise((resolveReservation, rejectReservation) => {
    const server = createServer();
    server.once("error", rejectReservation);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        rejectReservation(new Error("Failed to reserve an isolated Playwright port."));
        return;
      }
      resolveReservation({ port: address.port, server });
    });
  });
}

function closeReservation({ server }) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
}

async function reserveNonJudgePort() {
  while (true) {
    const reservation = await reservePort();
    if (!reservedPorts.has(reservation.port)) return reservation;
    await closeReservation(reservation);
  }
}

async function portsForSpec(index, basePorts) {
  if (basePorts !== null) {
    return {
      web: basePorts.web + index,
      api: basePorts.api + index,
      inspector: basePorts.inspector + index,
    };
  }

  const reservations = [];
  try {
    for (let count = 0; count < 3; count += 1) {
      reservations.push(await reserveNonJudgePort());
    }
    return {
      web: reservations[0].port,
      api: reservations[1].port,
      inspector: reservations[2].port,
    };
  } finally {
    await Promise.all(reservations.map(closeReservation));
  }
}

function stopChildProcessGroup(child) {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
      return;
    }
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") {
      throw error;
    }
  }
}

async function runSpec(specFile, index, total, basePorts) {
  const ports = await portsForSpec(index, basePorts);
  const webPort = String(ports.web);
  const apiPort = String(ports.api);
  const inspectorPort = String(ports.inspector);
  const relativeSpec = relative(repositoryRoot, specFile);

  console.log(
    `\n[isolated-e2e ${index + 1}/${total}] ${relativeSpec} ` +
      `(web ${webPort}, api ${apiPort}, inspector ${inspectorPort})`,
  );

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("bunx", ["playwright", "test", relativeSpec, "--workers=1"], {
      cwd: repositoryRoot,
      detached: process.platform !== "win32",
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

    let settled = false;
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      stopChildProcessGroup(child);
      callback();
    };

    child.on("error", (error) => {
      settle(() => rejectRun(error));
    });
    child.on("exit", (code, signal) => {
      settle(() => {
        if (signal !== null) {
          rejectRun(new Error(`${relativeSpec} terminated by ${signal}.`));
          return;
        }
        resolveRun(code ?? 1);
      });
    });
  });
}

const requestedSpecFiles = process.argv
  .slice(2)
  .map((specFile) => resolve(repositoryRoot, specFile));
const specFiles =
  requestedSpecFiles.length > 0
    ? requestedSpecFiles
    : readdirSync(e2eDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.ts"))
        .map((entry) => join(e2eDirectory, entry.name))
        .sort();

if (specFiles.length === 0) {
  throw new Error("No Playwright spec files were found.");
}

const explicitPortPlan = [
  process.env.PLAYWRIGHT_WEB_PORT,
  process.env.PLAYWRIGHT_API_PORT,
  process.env.PLAYWRIGHT_API_INSPECTOR_PORT,
].some((value) => value !== undefined);

const basePorts = explicitPortPlan
  ? {
      web: parsePort(process.env.PLAYWRIGHT_WEB_PORT?.trim() || "3120", "PLAYWRIGHT_WEB_PORT"),
      api: parsePort(process.env.PLAYWRIGHT_API_PORT?.trim() || "8810", "PLAYWRIGHT_API_PORT"),
      inspector: parsePort(
        process.env.PLAYWRIGHT_API_INSPECTOR_PORT?.trim() || "9250",
        "PLAYWRIGHT_API_INSPECTOR_PORT",
      ),
    }
  : null;

if (basePorts !== null) assertAvailablePlan(specFiles, basePorts);

const failures = [];
for (const [index, specFile] of specFiles.entries()) {
  const exitCode = await runSpec(specFile, index, specFiles.length, basePorts);
  if (exitCode !== 0) failures.push(relative(repositoryRoot, specFile));
}

if (failures.length > 0) {
  throw new Error(`Isolated Playwright failures:\n- ${failures.join("\n- ")}`);
}

console.log(`\nAll ${specFiles.length} isolated Playwright spec files passed.`);
