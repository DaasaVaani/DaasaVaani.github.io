import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import messages from "../shared/generated/web/ui.json" with { type: "json" };

type ManifestConfig = Pick<WebConfig, "base" | "appShell" | "themes">;
export const iconSizes = [180, 192, 512] as const;
export function iconSvg(config: Pick<WebConfig, "themes">) {
  return readFileSync(new URL("../resources/app-icon.svg", import.meta.url), "utf8")
    .replaceAll("{{background}}", config.themes.light.background).replaceAll("{{accent}}", config.themes.light.accent);
}
export function appManifest(config: ManifestConfig, language: WebConfig["defaultUiLanguage"]) {
  const labels = messages[language];
  return {
    id: config.base, name: labels.appName, short_name: labels.appName, description: labels.tagline, lang: language,
    start_url: config.base, scope: config.base, display: "standalone",
    background_color: config.themes.light.background, theme_color: config.themes.light.accent,
    prefer_related_applications: false,
    icons: [192, 512].map(size => ({ src: `${config.base}${config.appShell.iconPrefix}-${size}.png`,
      sizes: `${size}x${size}`, type: "image/png", purpose: "any maskable" })),
  };
}
export async function prepareAppManifest(directory: string, config: ManifestConfig, language: WebConfig["defaultUiLanguage"]) {
  const prefix = config.appShell.iconPrefix;
  if ((await readFile(resolve(directory, `${prefix}.svg`), "utf8")).replaceAll("\r\n", "\n") !==
      iconSvg(config).replaceAll("\r\n", "\n")) throw new Error("Stale app icon source; run npm run icons");
  for (const size of iconSizes) {
    const bytes = await readFile(resolve(directory, `${prefix}-${size}.png`));
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        bytes.toString("ascii", 12, 16) !== "IHDR" || bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) {
      throw new Error(`Invalid app icon ${size}; run npm run icons`);
    }
  }
  await writeFile(resolve(directory, config.appShell.manifestFile), JSON.stringify(appManifest(config, language), null, 2) + "\n");
}
