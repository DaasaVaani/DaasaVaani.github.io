import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { readFile } from "node:fs/promises";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const tooling = strictYaml(await readFile(new URL("../settings/tooling.yml", import.meta.url), "utf8"));
if (!tooling || typeof tooling !== "object" || Array.isArray(tooling) || Object.keys(tooling).length !== 3 ||
    typeof tooling.fixturePublisherRepository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(tooling.fixturePublisherRepository) ||
    typeof tooling.fixturePublisherRevision !== "string" || !/^[0-9a-f]{40}$/.test(tooling.fixturePublisherRevision) ||
    typeof tooling.fixturePublisherDirectory !== "string" || !tooling.fixturePublisherDirectory.trim()) throw new Error("Invalid fixture tooling settings");
const arguments_ = process.argv.slice(2);
if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== "--print-pin")) throw new Error("Expected no arguments or --print-pin");
if (arguments_[0] === "--print-pin") {
  console.log(`repository=${tooling.fixturePublisherRepository}`);
  console.log(`revision=${tooling.fixturePublisherRevision}`);
} else {
  const library = resolve(root, process.env.DAASAVAANI_FIXTURE_PUBLISHER_ROOT ?? tooling.fixturePublisherDirectory);
  const git = (...args) => {
    const result = spawnSync("git", ["-C", library, ...args], { encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Cannot verify fixture publisher: ${result.stderr}`);
    return result.stdout.trim();
  };
  if (git("rev-parse", "HEAD") !== tooling.fixturePublisherRevision ||
      git("status", "--porcelain", "--ignore-submodules=none")) throw new Error("Fixture publisher must be clean at the configured validated revision");
  const config = strictYaml(await readFile(new URL("../settings/web.yml", import.meta.url), "utf8"));
  if (!config || typeof config.descriptorUrl !== "string" ||
      !/^\/(?:[A-Za-z0-9_-]+\/)+latest\.json$/.test(config.descriptorUrl)) {
    throw new Error("Invalid development descriptor URL; expected a dedicated local latest.json path");
  }
  const endpoint = new URL(config.descriptorUrl, "http://localhost");
  if (endpoint.origin !== "http://localhost" || endpoint.pathname !== config.descriptorUrl ||
      !endpoint.pathname.endsWith("/latest.json")) throw new Error("Fixture publication requires a local latest.json descriptor URL");
  const publicRoot = resolve(root, "public");
  const output = resolve(publicRoot, "." + decodeURIComponent(dirname(endpoint.pathname)));
  if (output === publicRoot || relative(publicRoot, output).startsWith("..")) throw new Error("Fixture output must be a dedicated public subdirectory");
  const runner = resolve(library, "node_modules/tsx/dist/cli.mjs");
  const result = spawnSync(process.execPath, [runner, resolve(library, "tools/publisher.ts"),
    "--fixtures", "--out", output], { cwd: library, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Fixture publisher failed (${result.status})`);
}
