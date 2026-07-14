import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults are deliberate. This app is server-rendered on every request
// (`export const dynamic = "force-dynamic"` on the dashboard layout) because an
// ops console showing a cached count of stuck payments is worse than one showing
// none — so there is no ISR cache to configure, and adding an incremental cache
// here would only invite someone to serve a stale alert.
export default defineCloudflareConfig();
