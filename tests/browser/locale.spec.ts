import { test, expect } from "@playwright/test";

for (const example of [
  { name: "first supported regional Kannada preference", languages: ["fr-FR", "kn-IN", "en-US"], language: "fr-FR", expected: "kn" },
  { name: "English preference before Kannada", languages: ["en-GB", "kn-IN"], language: "en-GB", expected: "en" },
  { name: "unsupported preferences use configured English fallback", languages: ["fr-FR", "de-DE"], language: "fr-FR", expected: "en" },
  { name: "empty preference list uses the browser language", languages: [], language: "kn-IN", expected: "kn" },
]) {
  test(`first-use locale: ${example.name}; explicit override persists independently`, async ({ page }) => {
    await page.addInitScript(value => {
      Object.defineProperty(navigator, "languages", { configurable: true, get: () => value.languages });
      Object.defineProperty(navigator, "language", { configurable: true, get: () => value.language });
    }, example);
    await page.goto("/#/settings");
    await expect(page.locator("html")).toHaveAttribute("lang", example.expected);
    const english = page.getByRole("button", { name: "English", exact: true });
    await expect(english).toBeVisible();
    await page.getByRole("button", { name: "ಕನ್ನಡ", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "kn");
    await page.getByRole("button", { name: "ಗಾಢ", exact: true }).click();
    await expect(page.getByRole("button", { name: "ಗಾಢ", exact: true })).toHaveAttribute("aria-pressed", "true");
    await english.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "Library", exact: true }).last().click();
    await page.getByRole("article").first().getByRole("link", { name: "Read", exact: true }).click();
    await expect(page.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  });
}
