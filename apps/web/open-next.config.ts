import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  // Keep ISR/data cache entries in the environment-specific R2 bucket declared by Wrangler.
  incrementalCache: r2IncrementalCache,
});
