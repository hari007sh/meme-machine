import { expect, test } from "@playwright/test";

test("makes a meme and offers the share actions", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("What's the situation?").fill("when the standup could have been an email");
  await page.getByRole("button", { name: "Make my meme" }).click();
  const img = page.getByRole("img", { name: /meme:/i });
  await expect(img).toBeVisible({ timeout: 20_000 });
  expect(await img.getAttribute("src")).toMatch(/\/i\/[A-Za-z0-9_-]{10}\.png$/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  for (const name of ["Download", "Share", "Remix", "Try another template"]) {
    await expect(page.getByRole("button", { name }).or(page.getByRole("link", { name }))).toBeVisible();
  }
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});

test("shows stats and the build log", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.getByText("Memes made")).toBeVisible();
  await page.goto("/log");
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText(/Day/);
});

test("tells people when the GPU is busy", async ({ page }) => {
  await page.route("**/api/memes", (route) =>
    route.fulfill({ status: 503, headers: { "retry-after": "60" }, contentType: "application/json", body: JSON.stringify({ error: "busy", message: "Busy, try again in a minute." }) }),
  );
  await page.goto("/");
  await page.getByLabel("What's the situation?").fill("anything at all here");
  await page.getByRole("button", { name: "Make my meme" }).click();
  await expect(page.getByText("Busy, try again in a minute")).toBeVisible();
});
