import { test, expect, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve, sep, extname } from "node:path";
import { gzipSync } from "node:zlib";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { config, personalSnapshot, readingDefaults, serveLyrics } from "../lyric-browser";
import { lyricId } from "../lyric-fixture";

const labels = messages.en;
const snapshot = JSON.parse(readFileSync(new URL("../../shared/fixtures/personal/list-transfer.json", import.meta.url), "utf8")).accepted[1].value;
async function shellHost() {
  const root = resolve("dist"), files = new Map<string, Buffer>();
  for (const file of await readdir(root, { recursive: true })) {
    const path = resolve(root, file);
    if ((await stat(path)).isFile()) files.set(config.base + file.split(sep).join("/"), await readFile(path));
  }
  const state = { version: 1, invalid: false, workerRequests: 0 };
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const key = path.endsWith("/") ? path + "index.html" : path;
    let bytes = files.get(key);
    if (!bytes) { response.writeHead(404); response.end("Synthetic host: missing artifact"); return; }
    if (path === config.base + config.appShell.workerFile) {
      state.workerRequests++;
      bytes = Buffer.concat([bytes, Buffer.from(`\n/* Synthetic worker version ${state.version} */\n` +
        (state.invalid ? 'throw new Error("Synthetic candidate failure");' : ""))]);
    }
    const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
    response.writeHead(200, { "Content-Type": types[extname(key)] ?? "application/octet-stream",
      "Content-Length": bytes.length, "Content-Encoding": "identity", "Cache-Control": "no-store" });
    response.end(bytes);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Synthetic shell host has no TCP port");
  return { state, url: `http://127.0.0.1:${address.port}${config.base}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }) };
}
async function ready(page: Page, url: string) {
  await page.goto(url + "#/settings");
  await expect(page.getByRole("button", { name: labels.warm, exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active?.state !== "activated") {
      await new Promise<void>(resolve => registration.active?.addEventListener("statechange", () => {
        if (registration.active?.state === "activated") resolve();
      }));
    }
  });
}
async function activateControl(page: Page, url: string) {
  await ready(page, url);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.getByRole("button", { name: labels.warm, exact: true })).toBeVisible();
}
async function interfaceCache(page: Page) {
  return page.evaluate(async prefix => {
    const names = (await caches.keys()).filter(name => name.startsWith(prefix + "-"));
    return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys())
      .map(request => new URL(request.url).pathname)))).flat().sort();
  }, config.appShell.cacheId);
}
async function checkOnFocus(page: Page) {
  await page.bringToFront();
  const checkedAt = await page.evaluate(interval => Date.now() + interval + 1, config.appShell.updateCheckIntervalMs);
  await page.clock.setFixedTime(new Date(checkedAt));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  return checkedAt;
}

test("installed interface reloads offline with its lazy list worker but no downloaded Library", async ({ page, context }) => {
  const host = await shellHost();
  const ownerRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("/library/")) ownerRequests.push(request.url()); });
  try {
    await activateControl(page, host.url);
    await page.getByRole("button", { name: labels.warm, exact: true }).click();
    await expect.poll(async () => (await personalSnapshot(page)).tables.personal).toEqual([
      { id: "personal", favorites: [], language: "en", theme: "warm", ...readingDefaults },
    ]);
    const before = await personalSnapshot(page), cached = await interfaceCache(page);
    expect(cached).toContain(config.base + "index.html");
    expect(cached).toContain(config.base + config.appShell.manifestFile);
    expect(cached).toContain(config.base + config.listLinkPath + "index.html");
    expect(cached.some(path => path.includes("list-transfer.worker") && path.endsWith(".js"))).toBe(true);
    expect(cached.some(path => path.includes("search.worker") && path.endsWith(".js"))).toBe(true);
    expect(cached).toContain(config.base + "idb-license.txt");
    expect(cached.some(path => /\/(?:demo|library)\/|\.(?:gz|zip|png|jpg|webp|mp4|map)$/u.test(path))).toBe(false);
    await context.setOffline(true);
    await page.reload();
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (!link) throw new Error("Missing app manifest");
      const response = await fetch(link.href);
      if (!response.ok) throw new Error("Offline manifest unavailable");
      return response.json();
    });
    expect(manifest).toMatchObject({ id: config.base, start_url: config.base, scope: config.base });
    await expect(page.getByRole("button", { name: labels.warm, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(labels.appShellNotice, { exact: true })).toBeVisible();
    await page.getByLabel(labels.transferFile).setInputFiles({
      name: "synthetic.dvlist.json.gz", mimeType: "application/gzip", buffer: gzipSync(JSON.stringify(snapshot)),
    });
    await expect(page.getByRole("heading", { level: 3 })).toHaveText(snapshot.name);
    expect(await personalSnapshot(page)).toEqual(before);
    expect(ownerRequests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(host.url + config.listLinkPath + "#/settings");
    await expect(page.getByRole("heading", { name: labels.settings, exact: true })).toBeVisible();
    expect(await personalSnapshot(page)).toEqual(before);
    for (const path of ["library/unknown.json.gz", "other-project/", "missing.zip", "open/missing"]) {
      const excluded = await context.newPage();
      try { await expect(excluded.goto(host.url + path)).rejects.toThrow("ERR_INTERNET_DISCONNECTED"); }
      finally { await excluded.close(); }
    }
  } finally { await context.setOffline(false); await page.close(); await host.close(); }
});

test("new code waits for every controlled window without reload, personal replacement or foreign-cache cleanup", async ({ page, context }) => {
  const host = await shellHost();
  try {
    await context.addInitScript(() => {
      const original = ServiceWorkerRegistration.prototype.update;
      Reflect.set(window, "__appUpdateCalls", 0);
      ServiceWorkerRegistration.prototype.update = function () {
        Reflect.set(window, "__appUpdateCalls", Number(Reflect.get(window, "__appUpdateCalls")) + 1);
        return original.call(this);
      };
    });
    await activateControl(page, host.url);
    const other = await context.newPage();
    await ready(other, host.url);
    await expect.poll(() => other.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.getByRole("button", { name: labels.warm, exact: true }).click();
    await expect(page.getByRole("button", { name: labels.warm, exact: true })).toHaveAttribute("aria-pressed", "true");
    const before = await personalSnapshot(page);
    await page.getByLabel(labels.transferLink, { exact: true }).fill("Unsaved synthetic draft");
    await page.evaluate(async () => { await (await caches.open("foreign-project-cache")).put("/foreign-marker", new Response("keep")); });
    await page.bringToFront();
    await page.evaluate(() => { for (let index = 0; index < 20; index++) window.dispatchEvent(new Event("focus")); });
    expect(await page.evaluate(() => Reflect.get(window, "__appUpdateCalls"))).toBe(0);
    host.state.version = 2;
    const candidatePromise = context.waitForEvent("serviceworker");
    const checkedAt = await checkOnFocus(page);
    const candidate = await candidatePromise;
    await expect(page.getByText(labels.appUpdateAvailable, { exact: true })).toBeVisible();
    await expect(other.getByText(labels.appUpdateAvailable, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, "__appUpdateCalls"))).toBe(1);
    await page.clock.setFixedTime(new Date(checkedAt + config.appShell.updateCheckIntervalMs - 1));
    await page.evaluate(() => { for (let index = 0; index < 20; index++) window.dispatchEvent(new Event("focus")); });
    expect(await page.evaluate(() => Reflect.get(window, "__appUpdateCalls"))).toBe(1);
    await page.clock.setFixedTime(new Date(checkedAt + config.appShell.updateCheckIntervalMs));
    await page.evaluate(() => { for (let index = 0; index < 20; index++) window.dispatchEvent(new Event("focus")); });
    expect(await page.evaluate(() => Reflect.get(window, "__appUpdateCalls"))).toBe(2);
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { waiting: registration?.waiting?.state, controlledByActive: registration?.active === navigator.serviceWorker.controller };
    })).toEqual({ waiting: "installed", controlledByActive: true });
    await expect(page.getByLabel(labels.transferLink, { exact: true })).toHaveValue("Unsaved synthetic draft");
    expect(await personalSnapshot(page)).toEqual(before);
    await page.close();
    expect(await candidate.evaluate("self.registration.waiting?.state")).toBe("installed");
    await expect(other.getByText(labels.appUpdateAvailable, { exact: true })).toBeVisible();
    await other.close();
    await expect.poll(() => candidate.evaluate("self.registration.waiting === null && self.registration.active?.state === 'activated'")).toBe(true);
    const reopened = await context.newPage();
    await ready(reopened, host.url);
    await expect(reopened.getByText(labels.appUpdateAvailable, { exact: true })).toHaveCount(0);
    expect(await personalSnapshot(reopened)).toEqual(before);
    expect(await reopened.evaluate(async () => (await (await caches.open("foreign-project-cache")).match("/foreign-marker"))?.text())).toBe("keep");
    await reopened.close();
  } finally { for (const window of context.pages()) await window.close(); await host.close(); }
});

test("a failed code candidate exposes an error and preserves the old offline interface and personal data", async ({ page, context }) => {
  const host = await shellHost();
  try {
    await activateControl(page, host.url);
    const before = await personalSnapshot(page), cached = await interfaceCache(page);
    host.state.version = 2;
    host.state.invalid = true;
    await checkOnFocus(page);
    const alert = page.getByRole("alert").filter({ has: page.getByRole("heading", { name: labels.appShellFailed, exact: true }) });
    await expect(alert).toBeVisible();
    expect(await personalSnapshot(page)).toEqual(before);
    expect(await interfaceCache(page)).toEqual(cached);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: labels.settings, exact: true })).toBeVisible();
    expect(await personalSnapshot(page)).toEqual(before);
    await context.setOffline(false);
    host.state.invalid = false;
    await page.reload();
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
    await expect(page.getByText(labels.appUpdateAvailable, { exact: true })).toBeVisible();
  } finally { await context.setOffline(false); await page.close(); await host.close(); }
});

test("unsupported browsers retain online personal controls with an explicit boundary message", async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(Navigator.prototype, "serviceWorker"); });
  await page.goto("/#/settings");
  await expect(page.getByText(labels.appShellUnsupported, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: labels.warm, exact: true }).click();
  await expect(page.getByRole("button", { name: labels.warm, exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a mounted canonical reader survives failed and waiting code updates without content or history replay", async ({ page, context }) => {
  const host = await shellHost();
  const requests = await serveLyrics(page);
  try {
    await activateControl(page, host.url);
    await page.goto(host.url + `#/lyrics/${lyricId(1)}`);
    const body = page.locator('div[lang="kn"]');
    await expect(body.locator("p")).toHaveCount(4);
    await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory)
      .toEqual([{ id: "history", enabled: true, entries: [{ kind: "lyric", lyricId: lyricId(1) }] }]);
    const layout = () => body.locator("p").evaluateAll(elements => elements.map(element => ({
      id: element.id, text: element.textContent, layout: element.hasAttribute("data-layout"), html: element.innerHTML,
    })));
    const original = await layout(), before = await personalSnapshot(page), url = page.url();
    expect(requests).toHaveLength(3);
    host.state.version = 2;
    host.state.invalid = true;
    await checkOnFocus(page);
    await expect(page.getByRole("heading", { name: labels.appShellFailed, exact: true })).toBeVisible();
    expect(await layout()).toEqual(original);
    expect(await personalSnapshot(page)).toEqual(before);
    await context.setOffline(true);
    expect(await layout()).toEqual(original);
    await context.setOffline(false);
    host.state.version = 3;
    host.state.invalid = false;
    await checkOnFocus(page);
    await expect(page.getByText(labels.appUpdateAvailable, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: labels.appShellFailed, exact: true })).toHaveCount(0);
    expect(page.url()).toBe(url);
    expect(await layout()).toEqual(original);
    expect(await personalSnapshot(page)).toEqual(before);
    expect(requests).toHaveLength(3);
    expect((await interfaceCache(page)).some(path => path.includes("/library/"))).toBe(false);
  } finally { await context.setOffline(false); await page.close(); await host.close(); }
});

test("registration failure can be retried without removing personal data", async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    let fail = true;
    navigator.serviceWorker.register = (script: string | URL, options?: RegistrationOptions) => {
      if (fail) { fail = false; return Promise.reject(new Error("Synthetic registration failure")); }
      return original(script, options);
    };
  });
  await page.goto("/#/settings");
  const alert = page.getByRole("alert").filter({ has: page.getByRole("heading", { name: labels.appShellFailed, exact: true }) });
  await expect(alert).toContainText("Synthetic registration failure");
  await expect(page.getByRole("button", { name: labels.warm, exact: true })).toBeVisible();
  const before = await personalSnapshot(page);
  await alert.getByRole("button", { name: labels.retry, exact: true }).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(alert).toHaveCount(0);
  expect(await personalSnapshot(page)).toEqual(before);
});

test("a first-ever offline visit has no installed interface or fabricated readiness", async ({ page, context }) => {
  try {
    await context.setOffline(true);
    await expect(page.goto("/#/settings")).rejects.toThrow("ERR_INTERNET_DISCONNECTED");
    expect(context.serviceWorkers()).toHaveLength(0);
  } finally { await context.setOffline(false); }
});
