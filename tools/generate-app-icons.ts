import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
import schema from "../settings/web.schema.json" with { type: "json" };
import { iconSizes, iconSvg } from "./app-manifest.ts";

const config = strictYaml(readFileSync(new URL("../settings/web.yml", import.meta.url), "utf8"));
const validate = new Ajv2020({ strict: true }).compile<Pick<WebConfig, "themes" | "appShell">>(schema);
if (!validate(config)) throw new Error("Invalid icon settings: " + JSON.stringify(validate.errors));
const directory = fileURLToPath(new URL("../public", import.meta.url)), svg = iconSvg(config);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of iconSizes) {
    const base64 = await page.evaluate(async ({ svg, size }) => {
      const image = new Image();
      image.src = "data:image/svg+xml," + encodeURIComponent(svg);
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("App-icon rasterization is unavailable");
      context.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL("image/png").split(",")[1];
    }, { svg, size });
    if (!base64) throw new Error("App-icon rasterization returned no PNG");
    await writeFile(resolve(directory, `${config.appShell.iconPrefix}-${size}.png`), Buffer.from(base64, "base64"));
  }
  await writeFile(resolve(directory, `${config.appShell.iconPrefix}.svg`), svg);
  console.log("Generated original system-font-independent app icons: " + iconSizes.join(", "));
} finally { await browser.close(); }
