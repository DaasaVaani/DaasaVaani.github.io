import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { readFile, mkdir, copyFile, appendFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { strictYaml } from "./shared/tools/generate-catalog.mjs";
import Ajv2020 from "ajv/dist/2020";
import schema from "./settings/web.schema.json" with { type: "json" };
import personalSchema from "./shared/schemas/personal-transfer-settings.schema.json" with { type: "json" };
import defaultsSchema from "./shared/schemas/ui-defaults.schema.json" with { type: "json" };
import publicationSettingsSchema from "./shared/schemas/publication-policy-settings.schema.json" with { type: "json" };
import { verifyUnicodeResources } from "./tools/unicode-resources.ts";
import { prepareAppShell } from "./tools/app-shell.ts";
import { appManifest, prepareAppManifest } from "./tools/app-manifest.ts";

verifyUnicodeResources();
const config = strictYaml(readFileSync(new URL("./settings/web.yml", import.meta.url), "utf8"));
const bounds = strictYaml(readFileSync(new URL("./shared/settings/publication-policy.yml", import.meta.url), "utf8"));
const validate = new Ajv2020({ strict: true }).compile<Omit<WebConfig, "defaultUiLanguage" | "defaultTheme" | "defaultRecentHistoryEnabled" | "defaultReadingDensity" | "readingDensities" | "uiLanguages" | "uiThemes" | "maxFavorites">>(schema);
if (!validate(config)) throw new Error("Invalid web settings: " + JSON.stringify(validate.errors));
if (config.readerFontSizeMin >= config.readerFontSizeMax || config.readerFontSize < config.readerFontSizeMin ||
    config.readerFontSize > config.readerFontSizeMax || config.readerFontSizeStep > config.readerFontSizeMax - config.readerFontSizeMin ||
    config.readerLineHeights.compact >= config.readerLineHeights.normal || config.readerLineHeights.normal >= config.readerLineHeights.relaxed) {
  throw new Error("Inconsistent reader font bounds, step or density line heights");
}
const defaults = strictYaml(readFileSync(new URL("./shared/settings/defaults.yml", import.meta.url), "utf8"));
const validateDefaults = new Ajv2020({ strict: true }).compile<{
  uiLanguage: WebConfig["defaultUiLanguage"]; theme: WebConfig["defaultTheme"];
  recentHistoryEnabled: boolean;
  readingDensity: WebConfig["defaultReadingDensity"]; supportedReadingDensities: WebConfig["readingDensities"];
  supportedUiLanguages: WebConfig["uiLanguages"]; supportedThemes: WebConfig["uiThemes"];
}>(defaultsSchema);
if (!validateDefaults(defaults)) throw new Error("Invalid portable defaults: " + JSON.stringify(validateDefaults.errors));
const personal = strictYaml(readFileSync(new URL("./shared/settings/personal-transfer.yml", import.meta.url), "utf8"));
const validatePersonal = new Ajv2020({ strict: true }).compile<typeof __TRANSFER_LIMITS__ & typeof __BACKUP_LIMITS__ & PersonalLimits>(personalSchema);
if (!validatePersonal(personal)) throw new Error("Invalid portable personal limits: " + JSON.stringify(validatePersonal.errors));
const canonical = new URL(config.canonicalBaseUrl);
if (canonical.protocol !== "https:" || canonical.username || canonical.password || canonical.search || canonical.hash) throw new Error("Invalid canonical Website URL");
const lyricDescriptor = new URL(config.lyricPreview.descriptorUrl);
if (lyricDescriptor.protocol !== "https:" || lyricDescriptor.username || lyricDescriptor.password) throw new Error("Invalid lyric preview URL");
const validatePublicationSettings = new Ajv2020({ strict: true }).compile<typeof __BOUNDS__>(publicationSettingsSchema);
if (!validatePublicationSettings(bounds)) throw new Error("Invalid publication safety settings: " + JSON.stringify(validatePublicationSettings.errors));
const fixturePrefix = new URL(".", new URL(config.descriptorUrl, "http://localhost")).pathname;
const descriptorPath = new URL(config.descriptorUrl, "http://localhost").pathname;
const fixtureDirectory = fileURLToPath(new URL("public" + fixturePrefix, import.meta.url));
function fixtureArtifacts(directory: string) {
  return (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== descriptorPath && (!path.startsWith(fixturePrefix) ||
        !/^objects\/[0-9a-f]{64}\.json\.gz$/.test(path.slice(fixturePrefix.length)))) return next();
    readFile(resolve(directory, path.slice(1))).then(bytes => {
      response.setHeader("Content-Type", path === descriptorPath ? "application/json" : "application/octet-stream");
      if (path === descriptorPath) response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Encoding", "identity");
      response.setHeader("Content-Length", bytes.length);
      response.end(bytes);
    }).catch(next);
  };
}
export default defineConfig({
  plugins: [react(), {
    name: "encoded-fixture-artifacts",
    transformIndexHtml() {
      return [
        { tag: "link", attrs: { rel: "manifest", href: config.base + config.appShell.manifestFile }, injectTo: "head" },
        { tag: "link", attrs: { rel: "icon", href: `${config.base}${config.appShell.iconPrefix}.svg`, type: "image/svg+xml" }, injectTo: "head" },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: `${config.base}${config.appShell.iconPrefix}-180.png` }, injectTo: "head" },
        { tag: "meta", attrs: { name: "theme-color", content: config.themes.light.accent }, injectTo: "head" },
      ];
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (new URL(request.url ?? "/", "http://localhost").pathname !== config.base + config.appShell.manifestFile) return next();
        response.setHeader("Content-Type", "application/manifest+json");
        response.end(JSON.stringify(appManifest(config, defaults.uiLanguage)));
      });
      server.middlewares.use(fixtureArtifacts(resolve(server.config.root, "public")));
    },
    configurePreviewServer(server) {
      server.middlewares.use(fixtureArtifacts(resolve(server.config.root, server.config.build.outDir)));
    },
    async writeBundle(options) {
      if (!options.dir) throw new Error("Missing build output directory");
      const folder = resolve(options.dir, config.listLinkPath);
      await mkdir(folder, { recursive: true });
      await copyFile(resolve(options.dir, "index.html"), resolve(folder, "index.html"));
      // Vite's main-bundle notice does not include dependencies used only by workers.
      await copyFile(fileURLToPath(new URL("./node_modules/pako/LICENSE", import.meta.url)), resolve(options.dir, "pako-license.txt"));
      await appendFile(resolve(options.dir, "third-party-licenses.md"),
        "\n## pako worker dependency\n\nSee [the complete MIT/Zlib notice](pako-license.txt).\n");
      await copyFile(fileURLToPath(new URL("./shared/resources/unicode16/LICENSE.txt", import.meta.url)), resolve(options.dir, "unicode16-license.txt"));
      await appendFile(resolve(options.dir, "third-party-licenses.md"),
        "\n## Unicode 16.0.0 personal-name data\n\nDerived from the pinned official Unicode data. See [the complete Unicode License V3](unicode16-license.txt).\n");
      await prepareAppManifest(options.dir, config, defaults.uiLanguage);
      await prepareAppShell(options.dir, config);
    },
  }], base: config.base, build: { license: { fileName: "third-party-licenses.md" } },
  server: { port: config.demoPort, watch: { ignored: path => {
    // Publishing immutable fixtures must not silently reload an active reader.
    const within = relative(fixtureDirectory, path);
    return within === "" || (!within.startsWith("..") && !isAbsolute(within));
  } } },
  define: { __WEB_CONFIG__: JSON.stringify({ ...config, defaultUiLanguage: defaults.uiLanguage,
    defaultTheme: defaults.theme, defaultRecentHistoryEnabled: defaults.recentHistoryEnabled,
    defaultReadingDensity: defaults.readingDensity, readingDensities: defaults.supportedReadingDensities,
    uiLanguages: defaults.supportedUiLanguages, uiThemes: defaults.supportedThemes,
    maxFavorites: personal.maxFavorites }), __BOUNDS__: JSON.stringify(bounds), __PERSONAL_LIMITS__: JSON.stringify(personal),
    __BACKUP_LIMITS__: JSON.stringify({ maxBackupEncodedBytes: personal.maxBackupEncodedBytes, maxBackupDecodedBytes: personal.maxBackupDecodedBytes }),
    __TRANSFER_LIMITS__: JSON.stringify({ maxListEncodedBytes: personal.maxListEncodedBytes,
      maxListDecodedBytes: personal.maxListDecodedBytes, maxSharedUrlAscii: personal.maxSharedUrlAscii }) },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
