interface WebConfig {
  formatVersion: 1; base: string; descriptorUrl: string; demoPort: number;
  appShell: { workerFile: string; manifestFile: string; iconPrefix: string;
    cacheId: string; maxPrecacheBytes: number; updateCheckIntervalMs: number };
  lyricPreview: {
    descriptorUrl: string; pageSize: number; maxItems: number;
    maxEncodedBytes: number; maxDecodedBytes: number; concurrentRequests: number;
  };
  canonicalBaseUrl: string; listLinkPath: string; listFileName: string; backupFileName: string; transferChunkBytes: number; listCompressionLevel: number;
  defaultUiLanguage: "en" | "kn"; defaultTheme: "light" | "dark" | "warm" | "device";
  defaultRecentHistoryEnabled: boolean;
  defaultReadingDensity: import("../shared/types/personal").ReadingDensity;
  readingDensities: import("../shared/types/personal").ReadingDensity[];
  databaseName: string; maxFavorites: number; fontFamily: string;
  readerFontSize: number; space: number; contentWidth: number; readerWidth: number;
  readerFontSizeMin: number; readerFontSizeMax: number; readerFontSizeStep: number;
  readerLineHeights: Record<import("../shared/types/personal").ReadingDensity, number>;
  uiLanguages: ("en" | "kn")[];
  uiThemes: ("light" | "dark" | "warm" | "device")[];
  demoViewports: { desktop: { width: number; height: number }; mobile: { width: number; height: number } };
  themes: Record<"light" | "dark" | "warm", {
    background: string; surface: string; text: string; muted: string; accent: string; border: string; highlight: string;
  }>;
}
declare const __WEB_CONFIG__: WebConfig;
declare const __TRANSFER_LIMITS__: { maxListEncodedBytes: number; maxListDecodedBytes: number; maxSharedUrlAscii: number };
declare const __BACKUP_LIMITS__: { maxBackupEncodedBytes: number; maxBackupDecodedBytes: number };
interface PersonalLimits {
  maxFavorites: number; maxLists: number; maxEntriesPerList: number; maxTotalEntries: number; maxRecents: number; maxLearningLabels: number;
  maxPersonalStoredBytes: number; maxListDecodedBytes: number;
  maxListNameCodePoints: number; maxEntryTextCodePoints: number;
}
declare const __PERSONAL_LIMITS__: PersonalLimits;
declare const __BOUNDS__: {
  formatVersion: 1;
  maxDescriptorBytes: number; maxManifestEncodedBytes: number; maxManifestDecodedBytes: number;
  maxItemEncodedBytes: number; maxItemDecodedBytes: number; maxPolicyEncodedBytes: number;
  maxPolicyDecodedBytes: number; maxIndexEncodedBytes: number; maxIndexDecodedBytes: number;
  metadataTimeoutMs: number; supportedRequiredCapabilities: string[];
};
