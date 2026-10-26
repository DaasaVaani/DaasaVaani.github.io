import { describe, expect, test } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { shellNavigation, prepareAppShell } from "../tools/app-shell";

describe("app-interface cache boundary", () => {
  test("navigation fallback admits only the root and canonical open entries", () => {
    const allowed = shellNavigation("/", "open/");
    for (const path of ["/", "/?source=test", "/index.html", "/open/", "/open/index.html?source=test"]) {
      expect(allowed.test(path), path).toBe(true);
    }
    for (const path of ["/library/", "/library/index.html", "/other-project/", "/unknown", "/assets/missing.js",
      "/open/file.gz", "/open/missing", "/file.zip", "/image.jpg", "/video.mp4", "//", "/open/../library/"]) {
      expect(allowed.test(path), path).toBe(false);
    }
  });
  test("a configured directory base neither widens scope nor treats regex characters as patterns", () => {
    const allowed = shellNavigation("/site/", "open/");
    expect(allowed.test("/site/")).toBe(true);
    expect(allowed.test("/site/open/?a=1")).toBe(true);
    expect(allowed.test("/")).toBe(false);
    expect(allowed.test("/site/library/")).toBe(false);
    expect(shellNavigation("/a.b/", "open/").test("/axb/")).toBe(false);
  });
  test("complete generation preserves exclusions and enforces the exact total byte ceiling", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "daasavaani-shell-test-"));
    const config = { base: "/", listLinkPath: "open/", appShell: { workerFile: "sw.js",
      manifestFile: "manifest.webmanifest", iconPrefix: "app-icon",
      cacheId: "DaasaVaani-test-interface", maxPrecacheBytes: 8388608, updateCheckIntervalMs: 60000 } };
    try {
      for (const folder of ["open", "assets", "library", "other"]) await mkdir(resolve(directory, folder));
      for (const file of ["index.html", "open/index.html", "assets/lazy.js", "assets/main.css", "manifest.webmanifest",
        "third-party-licenses.md", "pako-license.txt", "unicode16-license.txt", "library/excluded.js",
        "other/index.html", "excluded.jpg", "excluded.json.gz", "assets/excluded.js.map"]) {
        await writeFile(resolve(directory, ...file.split("/")), file.endsWith(".js") ? "self.test = true;" : "Synthetic test only");
      }
      const first = await prepareAppShell(directory, config);
      expect(first.count).toBe(10);
      const worker = await readFile(resolve(directory, config.appShell.workerFile), "utf8");
      expect(worker).toContain("/assets/lazy.js");
      expect(worker).not.toMatch(/excluded|\/library\/|\/other\//u);
      config.appShell.maxPrecacheBytes = first.bytes;
      expect(await prepareAppShell(directory, config)).toEqual(first);
      config.appShell.maxPrecacheBytes--;
      await expect(prepareAppShell(directory, config)).rejects.toThrow("configured byte limit");
      config.appShell.maxPrecacheBytes = 1;
      await expect(prepareAppShell(directory, config)).rejects.toThrow("Couldn't find configuration");
      await writeFile(resolve(directory, "assets", "tiny.js"), ";");
      await expect(prepareAppShell(directory, config)).rejects.toThrow("Incomplete app-interface precache");
    } finally { await rm(directory, { recursive: true }); }
  }, 30000);
});
