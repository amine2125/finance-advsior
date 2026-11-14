import { defineConfig } from "@playwright/test";

// Browser end-to-end tests. They run against a live stack (local `uvicorn` + `vite`, or the CloudFront URL via AEGIS_URL)
// and therefore call Amazon Bedrock for the debate; they are not part of the offline CI test suite.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: { baseURL: process.env.AEGIS_URL || "http://127.0.0.1:5173", viewport: { width: 1600, height: 1000 }, screenshot: "only-on-failure" },
  reporter: [["list"]],
  workers: 1,
});
