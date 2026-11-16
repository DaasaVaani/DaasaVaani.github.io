import { expect, test, type Locator, type Page } from "@playwright/test";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { config, personalSnapshot, serveLyrics } from "../lyric-browser";
import { lyricId } from "../lyric-fixture";
import { gzipSync } from "node:zlib";
import backupVectors from "../../shared/fixtures/personal/full-backup.json" with { type: "json" };

async function contrast(element: Locator, property: "color" | "outlineColor" | "borderTopColor", minimum: number) {
  await expect(element).toBeVisible();
  const measured = await element.evaluate((element, property) => {
    function rgb(value: string) {
      const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value);
      if (!match) throw new Error(`Unsupported computed color: ${value}`);
      const [, red, green, blue, alpha] = match;
      return { channels: [Number(red), Number(green), Number(blue)], alpha: alpha === undefined ? 1 : Number(alpha) };
    }
    function background(start: Element | null): number[] {
      let surface: number[] | undefined;
      for (let current = start; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.opacity !== "1" || style.backgroundImage !== "none") {
          throw new Error("Contrast measurement requires opaque elements without background images");
        }
        const color = rgb(style.backgroundColor);
        if (color.alpha === 1) surface ??= color.channels;
        if (!surface && color.alpha !== 0) throw new Error("Contrast measurement does not silently ignore translucent backgrounds");
      }
      if (surface) return surface;
      throw new Error("No explicit opaque background was found");
    }
    function luminance(channels: number[]) {
      return channels.reduce((total, channel, index) => {
        const value = channel / 255, weight = [0.2126, 0.7152, 0.0722][index];
        if (weight === undefined) throw new Error("Invalid computed channel count");
        return total + weight * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      }, 0);
    }
    const style = getComputedStyle(element), foreground = rgb(style[property]);
    if (foreground.alpha !== 1) throw new Error("Contrast measurement requires an opaque foreground");
    const surfaces = property === "outlineColor" ? [background(element.parentElement)]
      : property === "borderTopColor" ? [background(element), background(element.parentElement)] : [background(element)];
    const first = luminance(foreground.channels);
    return { foreground: style[property], ratios: surfaces.map(surface => {
      const second = luminance(surface);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }) };
  }, property);
  for (const ratio of measured.ratios) expect(ratio, `${property} ${measured.foreground}`).toBeGreaterThanOrEqual(minimum);
}

async function keyboardFocus(page: Page, element: Locator) {
  await page.keyboard.press("Tab");
  await element.focus();
  await expect(element).toBeFocused();
  expect(await element.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  await expect(element).toHaveCSS("outline-style", "solid");
  await expect(element).toHaveCSS("outline-width", "3px");
  await expect(element).toHaveCSS("outline-offset", "4px");
  await contrast(element, "outlineColor", 3);
}

for (const language of ["en", "kn"] as const) {
  for (const theme of ["light", "dark", "warm"] as const) {
    test(`${language} ${theme} rendered text controls highlights and keyboard focus retain measured contrast without changing lyrics`, async ({ page }) => {
      const requests = await serveLyrics(page), labels = messages[language];
      await page.goto("/#/settings");
      await page.getByRole("button", { name: messages[language].languageName, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      const selected = page.getByRole("button", { name: labels[theme], exact: true });
      await selected.click();
      await expect(selected).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const saved = await personalSnapshot(page), route = page.url();

      await page.reload();
      await expect(selected).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("main")).toBeFocused();
      const skip = page.getByRole("link", { name: labels.skipToContent, exact: true });
      const precedingLinks = await page.locator("header").first().getByRole("link").count() + 1;
      for (let step = 0; step < precedingLinks; step++) await page.keyboard.press("Shift+Tab");
      await expect(skip).toBeFocused();
      await contrast(skip, "color", 4.5);
      await contrast(skip, "outlineColor", 3);
      await skip.press("Enter");
      await expect(page.getByRole("main")).toBeFocused();
      expect(page.url()).toBe(route);
      await page.keyboard.press("Tab");
      expect(await page.getByRole("main").evaluate(main => document.activeElement !== main && main.contains(document.activeElement))).toBe(true);

      for (const element of [
        page.getByRole("heading", { name: labels.settings, exact: true }),
        page.getByRole("navigation").getByRole("link", { name: labels.settings, exact: true }),
        page.getByRole("navigation").getByRole("link", { name: labels.library, exact: true }),
        selected,
        page.getByRole("button", { name: labels[theme === "light" ? "dark" : "light"], exact: true }),
        page.getByRole("combobox", { name: labels.readingDensity, exact: true }),
        page.getByRole("textbox").first(),
        page.getByRole("complementary").first(),
      ]) await contrast(element, "color", 4.5);
      for (const control of [
        page.getByRole("combobox", { name: labels.readingDensity, exact: true }), page.getByRole("textbox").first(),
      ]) {
        await contrast(control, "borderTopColor", 3);
        await keyboardFocus(page, control);
      }

      await keyboardFocus(page, selected);
      await keyboardFocus(page, page.getByRole("navigation").getByRole("link", { name: labels.library, exact: true }));
      await page.emulateMedia({ colorScheme: theme === "dark" ? "light" : "dark" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(await personalSnapshot(page)).toEqual(saved);

      await page.goto(`/#/lyrics/${lyricId(1)}`);
      const lyric = page.locator('div[lang="kn"]');
      await expect(lyric.locator("p")).toHaveCount(4);
      await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory[0].entries).toHaveLength(1);
      const literal = await lyric.locator("p").evaluateAll(lines => lines.map(line => ({
        id: line.id, text: line.textContent, layout: line.hasAttribute("data-layout"),
      })));
      const readState = await personalSnapshot(page), count = requests.length;
      await contrast(lyric, "color", 4.5);
      await contrast(page.getByRole("heading", { level: 1 }), "color", 4.5);
      await keyboardFocus(page, page.getByRole("button", { name: labels.increaseLyricFontSize, exact: true }));
      expect(await lyric.locator("p").evaluateAll(lines => lines.map(line => ({
        id: line.id, text: line.textContent, layout: line.hasAttribute("data-layout"),
      })))).toEqual(literal);
      expect(await personalSnapshot(page)).toEqual(readState);
      expect(requests).toHaveLength(count);

      await page.goto("/#/item/fixture-one");
      const line = lyric.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true });
      await expect(line).toHaveText("ರಾಮ ಕೃಷ್ಣ");
      const lineId = await line.getAttribute("id");
      if (!lineId) throw new Error("Missing synthetic selected-line identity");
      await page.goto(`/#/item/fixture-one?line=${encodeURIComponent(lineId)}`);
      await expect(line).toHaveAttribute("data-selected", "true");
      await contrast(line, "color", 4.5);
      await contrast(page.getByText(labels.canonical, { exact: true }), "color", 4.5);
      await contrast(page.locator('[class*="muted"]:visible').first(), "color", 4.5);
      await expect(line).toHaveText("ರಾಮ ಕೃಷ್ಣ");
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    });
  }
}

for (const language of ["en", "kn"] as const) {
  for (const theme of ["light", "dark", "warm"] as const) {
    test(`${language} ${theme} read-only backup preview has themed text boundaries and keyboard focus online and offline`, async ({ page, context }) => {
      const fixture = backupVectors.accepted[1]?.value;
      if (!fixture || fixture.platform !== "web") throw new Error("Missing permitted web backup fixture");
      const labels = messages[language], requests: string[] = [];
      page.on("request", request => { if (request.url().includes("/library/")) requests.push(request.url()); });
      await page.goto("/#/settings");
      await page.getByRole("button", { name: messages[language].languageName, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await page.getByRole("button", { name: labels[theme], exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await page.reload();
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      const backup = page.getByRole("region", { name: labels.backupTitle, exact: true });
      await expect(backup).toBeVisible();
      const before = await personalSnapshot(page);
      for (const offline of [false, true]) {
        await context.setOffline(offline);
        if (offline) {
          await page.reload();
          await expect(backup).toBeVisible();
        }
        await backup.getByLabel(labels.backupChoose, { exact: true }).setInputFiles({
          name: "synthetic-theme.dvbackup.json.gz", mimeType: "application/gzip",
          buffer: gzipSync(Buffer.from(JSON.stringify(fixture))),
        });
        const preview = backup.getByRole("textbox", { name: labels.backupPreview, exact: true });
        await expect(preview).toBeVisible();
        await expect(preview).toHaveAttribute("readonly", "");
        expect(JSON.parse(await preview.inputValue())).toEqual(fixture);
        const styles = await preview.evaluate(element => {
          const computed = getComputedStyle(element), root = getComputedStyle(document.documentElement);
          const parent = element.parentElement;
          if (!parent) throw new Error("Backup preview has no surrounding surface");
          const color = document.createElement("span");
          parent.appendChild(color);
          const resolved: Record<string, string> = {};
          try {
            for (const token of ["text", "surface", "border"]) {
              color.style.color = root.getPropertyValue(`--${token}`);
              resolved[token] = getComputedStyle(color).color;
            }
          } finally { color.remove(); }
          return {
            text: computed.color, surface: computed.backgroundColor, border: computed.borderTopColor,
            font: computed.fontFamily, surroundingFont: getComputedStyle(parent).fontFamily,
            resolved, minWidth: computed.minWidth,
          };
        });
        expect(styles.text).toBe(styles.resolved.text);
        expect(styles.surface).toBe(styles.resolved.surface);
        expect(styles.border).toBe(styles.resolved.border);
        expect(styles.font).toBe(styles.surroundingFont);
        expect(styles.minWidth).toBe("0px");
        await contrast(preview, "color", 4.5);
        await contrast(preview, "borderTopColor", 3);
        await keyboardFocus(page, preview);
        await preview.press("ControlOrMeta+A");
        expect(await preview.evaluate(element => {
          if (!(element instanceof HTMLTextAreaElement)) throw new Error("Expected backup textarea");
          return element.selectionStart === 0 && element.selectionEnd === element.value.length;
        })).toBe(true);
        await preview.press("Backspace");
        expect(JSON.parse(await preview.inputValue())).toEqual(fixture);
        expect(await personalSnapshot(page)).toEqual(before);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await preview.evaluate(element => element.getBoundingClientRect().width))
          .toBeLessThanOrEqual(await backup.evaluate(element => element.getBoundingClientRect().width));
        await backup.getByRole("button", { name: labels.cancel, exact: true }).click();
        await expect(preview).toHaveCount(0);
        expect(await personalSnapshot(page)).toEqual(before);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        expect(requests).toEqual([]);
        expect(new URL(page.url()).pathname).toBe(config.base);
      }
      await context.setOffline(false);
    });
  }
}
