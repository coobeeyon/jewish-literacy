import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Use the system Chromium where it exists (the preview host); otherwise Playwright's own headless shell.
const launchOptions = existsSync("/usr/bin/chromium") ? { executablePath: "/usr/bin/chromium" } : {};

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  workers: 4,
  webServer: {
    // The same server that serves the app (compressed assets, app routes), on the test port.
    command: "JL_HOST=127.0.0.1 JL_PORT=4173 node server.mjs",
    port: 4173,
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure", launchOptions },
  projects: [
    { name: "phone-320", use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 844 } } },
    { name: "phone-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } }
  ]
});
