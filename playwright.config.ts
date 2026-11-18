import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8092";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: BASE_URL, viewport: { width: 390, height: 844 } },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "MEME_FAKE_AI=1 PORT=8092 DATA_DIR=.e2e-data MEME_RATE_LIMIT=1000 npx tsx src/server/index.ts",
        url: "http://localhost:8092/api/stats",
        reuseExistingServer: false,
      },
});
