import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Use the system Chromium where it exists (the preview host); otherwise Playwright's own headless shell.
const launchOptions = existsSync("/usr/bin/chromium") ? { executablePath: "/usr/bin/chromium" } : {};
// The test server listens on 127.0.0.1 only, on a free ephemeral port the OS picks once per run
// (workers inherit it through the environment), so a run never collides with a preview server.
process.env.JL_TEST_PORT ||= execFileSync(process.execPath, ["-e", "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})"], { encoding: "utf8" });
const port = Number(process.env.JL_TEST_PORT);

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  workers: 4,
  webServer: {
    // The same server that serves the site (compressed assets, per-route pages), on the test port.
    command: `JL_HOST=127.0.0.1 JL_PORT=${port} node server.mjs`,
    port,
    reuseExistingServer: false,
  },
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure", launchOptions },
  projects: [
    { name: "phone-320", use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 844 } } },
    { name: "phone-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } }
  ]
});
