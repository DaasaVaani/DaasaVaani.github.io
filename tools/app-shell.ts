import { copyFile, appendFile, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSW } from "workbox-build";

export function shellNavigation(base: string, listLinkPath: string) {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^${escape(base)}(?:index\\.html|${escape(listLinkPath)}(?:index\\.html)?)?(?:\\?.*)?$`);
}

export async function prepareAppShell(directory: string, config: Pick<WebConfig, "base" | "listLinkPath" | "appShell">) {
  for (const [dependency, file] of [["workbox-core", "workbox-license.txt"], ["idb", "idb-license.txt"]] as const) {
    await copyFile(fileURLToPath(new URL(`../node_modules/${dependency}/LICENSE`, import.meta.url)), resolve(directory, file));
    const notice = `\n## ${dependency} app-interface worker dependency\n\nSee [the complete license](${file}).\n`;
    const noticesPath = resolve(directory, "third-party-licenses.md");
    if (!(await readFile(noticesPath, "utf8")).includes(notice)) await appendFile(noticesPath, notice);
  }
  const destination = resolve(directory, config.appShell.workerFile);
  const result = await generateSW({
    swDest: destination,
    globDirectory: directory,
    globPatterns: ["index.html", `${config.listLinkPath}index.html`, "assets/**/*.js", "assets/**/*.css",
      config.appShell.manifestFile, "third-party-licenses.md", "pako-license.txt", "unicode16-license.txt", "workbox-license.txt", "idb-license.txt"],
    globFollow: false,
    maximumFileSizeToCacheInBytes: config.appShell.maxPrecacheBytes,
    modifyURLPrefix: { "": config.base },
    cacheId: config.appShell.cacheId,
    inlineWorkboxRuntime: true,
    sourcemap: false,
    mode: "production",
    skipWaiting: false,
    clientsClaim: false,
    cleanupOutdatedCaches: false,
    navigateFallback: `${config.base}index.html`,
    navigateFallbackAllowlist: [shellNavigation(config.base, config.listLinkPath)],
  });
  if (result.warnings.length) throw new Error("Incomplete app-interface precache: " + result.warnings.join("\n"));
  const bytes = result.size + (await stat(destination)).size;
  if (bytes > config.appShell.maxPrecacheBytes) throw new Error(`App-interface cache exceeds configured byte limit: ${bytes}`);
  console.log(`App interface: ${result.count} precached resources, ${bytes} bytes including worker; no Library artifacts.`);
  return { count: result.count, bytes };
}
