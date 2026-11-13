import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
import { validateWebSettings } from "./validate-web-settings.ts";
import personalSchema from "../shared/schemas/personal-transfer-settings.schema.json" with { type: "json" };
import defaultsSchema from "../shared/schemas/ui-defaults.schema.json" with { type: "json" };
import publicationSettingsSchema from "../shared/schemas/publication-policy-settings.schema.json" with { type: "json" };
import { verifyUnicodeResources } from "./unicode-resources.ts";

verifyUnicodeResources();
const config = strictYaml(readFileSync(new URL("../settings/web.yml", import.meta.url), "utf8"));
const bounds = strictYaml(readFileSync(new URL("../shared/settings/publication-policy.yml", import.meta.url), "utf8"));
validateWebSettings(config);
const defaults = strictYaml(readFileSync(new URL("../shared/settings/defaults.yml", import.meta.url), "utf8"));
const validateDefaults = new Ajv2020({ strict: true }).compile<{
  uiLanguage: WebConfig["defaultUiLanguage"]; theme: WebConfig["defaultTheme"];
  recentHistoryEnabled: boolean;
  readingDensity: WebConfig["defaultReadingDensity"]; supportedReadingDensities: WebConfig["readingDensities"];
  supportedUiLanguages: WebConfig["uiLanguages"]; supportedThemes: WebConfig["uiThemes"];
}>(defaultsSchema);
if (!validateDefaults(defaults)) throw new Error("Invalid portable defaults: " + JSON.stringify(validateDefaults.errors));
const personal = strictYaml(readFileSync(new URL("../shared/settings/personal-transfer.yml", import.meta.url), "utf8"));
const validatePersonal = new Ajv2020({ strict: true }).compile<typeof __TRANSFER_LIMITS__ & typeof __BACKUP_LIMITS__ & PersonalLimits>(personalSchema);
if (!validatePersonal(personal)) throw new Error("Invalid portable personal limits: " + JSON.stringify(validatePersonal.errors));
const validatePublicationSettings = new Ajv2020({ strict: true }).compile<typeof __BOUNDS__>(publicationSettingsSchema);
if (!validatePublicationSettings(bounds)) throw new Error("Invalid publication safety settings: " + JSON.stringify(validatePublicationSettings.errors));

export const webConfig = config;
export const webDefaults = defaults;
export const webDefines = {
  __WEB_CONFIG__: JSON.stringify({ ...config, defaultUiLanguage: defaults.uiLanguage,
    defaultTheme: defaults.theme, defaultRecentHistoryEnabled: defaults.recentHistoryEnabled,
    defaultReadingDensity: defaults.readingDensity, readingDensities: defaults.supportedReadingDensities,
    uiLanguages: defaults.supportedUiLanguages, uiThemes: defaults.supportedThemes,
    maxFavorites: personal.maxFavorites }),
  __BOUNDS__: JSON.stringify(bounds), __PERSONAL_LIMITS__: JSON.stringify(personal),
  __BACKUP_LIMITS__: JSON.stringify({ maxBackupEncodedBytes: personal.maxBackupEncodedBytes, maxBackupDecodedBytes: personal.maxBackupDecodedBytes }),
  __TRANSFER_LIMITS__: JSON.stringify({ maxListEncodedBytes: personal.maxListEncodedBytes,
    maxListDecodedBytes: personal.maxListDecodedBytes, maxSharedUrlAscii: personal.maxSharedUrlAscii }),
};
