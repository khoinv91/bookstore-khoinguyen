import { defineConfig, devices } from "@playwright/test";

const PORT = 8788;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // dùng chung 1 database D1 local nên chạy tuần tự
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  // Chạy game y như trên Cloudflare (Worker + D1) ngay trên máy, với database trống
  webServer: {
    command:
      `rm -rf .wrangler/e2e && npx wrangler d1 migrations apply mario-db --local --persist-to .wrangler/e2e ` +
      `&& npx wrangler dev --port ${PORT} --ip 127.0.0.1 --persist-to .wrangler/e2e`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
