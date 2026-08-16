import { pathToFileURL } from "node:url";
import { runWorkerSecretSync } from "./worker-secret-sync.mjs";

export const environment = "staging";
export const confirmationToken = "open-sessionboard:staging";

export function main(argv = process.argv.slice(2)) {
  return runWorkerSecretSync({
    environment,
    confirmationToken,
    argv,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
