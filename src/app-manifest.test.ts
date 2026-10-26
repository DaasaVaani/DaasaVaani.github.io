import { describe, expect, test } from "vitest";
import { mkdtemp, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import messages from "../shared/generated/web/ui.json" with { type: "json" };
import { appManifest, iconSizes, iconSvg, prepareAppManifest } from "../tools/app-manifest";

describe("installation metadata", () => {
  test("identity and launch scope follow only the owned deployment base", () => {
    for (const base of ["/", "/site/"]) {
      for (const language of ["en", "kn"] as const) {
        const config = { ...__WEB_CONFIG__, base };
        const manifest = appManifest(config, language);
        expect(manifest).toEqual({
          id: base, start_url: base, scope: base, display: "standalone",
          name: messages[language].appName, short_name: messages[language].appName,
          description: messages[language].tagline, lang: language,
          background_color: config.themes.light.background, theme_color: config.themes.light.accent,
          prefer_related_applications: false,
          icons: [192, 512].map(size => ({
            src: `${base}${config.appShell.iconPrefix}-${size}.png`, sizes: `${size}x${size}`,
            type: "image/png", purpose: "any maskable",
          })),
        });
      }
    }
  });
  test("original icon template resolves owned colors with no font or external resource", () => {
    const svg = iconSvg(__WEB_CONFIG__);
    expect(svg).toContain(`fill="${__WEB_CONFIG__.themes.light.background}"`);
    expect(svg).toContain(`stroke="${__WEB_CONFIG__.themes.light.accent}"`);
    expect(svg).not.toMatch(/\{\{|<text|<image|<script|href=|url\(/u);
  });
  test("build requires current committed artwork and correctly sized PNG headers", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "daasavaani-manifest-test-"));
    const { iconPrefix, manifestFile } = __WEB_CONFIG__.appShell;
    const svgPath = resolve(directory, `${iconPrefix}.svg`);
    try {
      for (const suffix of [".svg", ...iconSizes.map(size => `-${size}.png`)]) {
        await copyFile(resolve("public", iconPrefix + suffix), resolve(directory, iconPrefix + suffix));
      }
      await prepareAppManifest(directory, __WEB_CONFIG__, "en");
      expect(JSON.parse(await readFile(resolve(directory, manifestFile), "utf8"))).toEqual(appManifest(__WEB_CONFIG__, "en"));
      await writeFile(svgPath, "<svg/>");
      await expect(prepareAppManifest(directory, __WEB_CONFIG__, "en")).rejects.toThrow("Stale app icon source");
      await writeFile(svgPath, iconSvg(__WEB_CONFIG__));
      for (const size of iconSizes) {
        const path = resolve(directory, `${iconPrefix}-${size}.png`), bytes = await readFile(path);
        await writeFile(path, bytes.subarray(0, 20));
        await expect(prepareAppManifest(directory, __WEB_CONFIG__, "en")).rejects.toThrow(`Invalid app icon ${size}`);
        const wrongSize = Buffer.from(bytes);
        wrongSize.writeUInt32BE(size + 1, 16);
        await writeFile(path, wrongSize);
        await expect(prepareAppManifest(directory, __WEB_CONFIG__, "en")).rejects.toThrow(`Invalid app icon ${size}`);
        await writeFile(path, bytes);
      }
      const changedPalette = { ...__WEB_CONFIG__, themes: { ...__WEB_CONFIG__.themes,
        light: { ...__WEB_CONFIG__.themes.light, accent: "#000000" } } };
      await expect(prepareAppManifest(directory, changedPalette, "en")).rejects.toThrow("Stale app icon source");
    } finally { await rm(directory, { recursive: true }); }
  });
});
