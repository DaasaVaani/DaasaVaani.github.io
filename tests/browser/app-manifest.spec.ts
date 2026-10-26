import { test, expect } from "@playwright/test";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { config, defaultUiLanguage, personalSnapshot } from "../lyric-browser";

const labels = messages.en;
test("root and direct entry expose a valid, stable Chromium installable app manifest", async ({ page, context }) => {
  const session = await context.newCDPSession(page);
  try {
    for (const route of [config.base, config.base + config.listLinkPath]) {
      await page.goto(route + "#/settings");
      await expect(page.getByRole("button", { name: labels.warm, exact: true })).toBeVisible();
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", config.base + config.appShell.manifestFile);
      const response = await page.request.get(config.base + config.appShell.manifestFile);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain("application/manifest+json");
      const manifest = await response.json();
      expect(manifest).toMatchObject({ id: config.base, start_url: config.base, scope: config.base,
        display: "standalone", name: messages[defaultUiLanguage].appName, prefer_related_applications: false });
      const parsed = await session.send("Page.getAppManifest");
      expect(parsed.url).toBe(new URL(config.base + config.appShell.manifestFile, page.url()).href);
      expect(parsed.errors).toEqual([]);
      expect(JSON.parse(parsed.data ?? "")).toEqual(manifest);
      await expect.poll(async () => (await session.send("Page.getInstallabilityErrors")).installabilityErrors).toEqual([]);
    }
  } finally { await session.detach(); }
});

test("generated favicon and touch/install PNGs decode at exact sizes in the maskable safe area", async ({ page }) => {
  await page.goto(config.base + "#/settings");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", `${config.base}${config.appShell.iconPrefix}.svg`);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", `${config.base}${config.appShell.iconPrefix}-180.png`);
  const results = await page.evaluate(async ({ base, prefix }) => {
    const results = [];
    for (const [suffix, size] of [[".svg", 512], ["-180.png", 180], ["-192.png", 192], ["-512.png", 512]] as const) {
      const image = new Image();
      image.src = base + prefix + suffix;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas decoding unavailable");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, size, size).data;
      const background = Array.from(pixels.slice(0, 4));
      let outside = 0, ink = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4;
        if (pixels[offset] !== background[0] || pixels[offset + 1] !== background[1] || pixels[offset + 2] !== background[2]) {
          ink++;
          if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4) outside++;
        }
      }
      const center = ((Math.floor(size / 2) * size) + Math.floor(size / 2)) * 4;
      results.push({ size, width: image.naturalWidth, height: image.naturalHeight, background,
        accent: Array.from(pixels.slice(center, center + 4)), outside, ink });
    }
    return results;
  }, { base: config.base, prefix: config.appShell.iconPrefix });
  const rgba = (hex: string) => [...[1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16)), 255];
  for (const result of results) {
    expect(result.width).toBe(result.size);
    expect(result.height).toBe(result.size);
    expect(result.background).toEqual(rgba(config.themes.light.background));
    expect(result.accent).toEqual(rgba(config.themes.light.accent));
    expect(result.outside).toBe(0);
    expect(result.ink).toBeGreaterThan(result.size);
  }
});

test("browser chrome follows resolved theme without changing manifest identity or writing on device change", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(config.base + "#/settings");
  const chrome = page.locator('meta[name="theme-color"]');
  await expect(chrome).toHaveCount(1);
  await expect(chrome).toHaveAttribute("content", config.themes.light.accent);
  const initial = await personalSnapshot(page);
  const manifest = await (await page.request.get(config.base + config.appShell.manifestFile)).json();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(chrome).toHaveAttribute("content", config.themes.light.accent);
  expect(await personalSnapshot(page)).toEqual(initial);
  await page.getByRole("button", { name: labels.followDevice, exact: true }).click();
  await expect(chrome).toHaveAttribute("content", config.themes.dark.accent);
  const device = await personalSnapshot(page);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(chrome).toHaveAttribute("content", config.themes.light.accent);
  expect(await personalSnapshot(page)).toEqual(device);
  await page.getByRole("button", { name: labels.warm, exact: true }).click();
  await expect(chrome).toHaveAttribute("content", config.themes.warm.accent);
  const warm = await personalSnapshot(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(chrome).toHaveAttribute("content", config.themes.warm.accent);
  expect(await personalSnapshot(page)).toEqual(warm);
  await page.getByRole("button", { name: messages.kn.languageName, exact: true }).click();
  await expect(page).toHaveTitle(messages.kn.appName);
  expect(await (await page.request.get(config.base + config.appShell.manifestFile)).json()).toEqual(manifest);
});
