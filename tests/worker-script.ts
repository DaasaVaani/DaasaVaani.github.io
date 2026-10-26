import type { Page } from "@playwright/test";

export async function replaceWorkerScript(page: Page, stem: string, source: string) {
  // Network routing cannot replace a worker script already served by the app precache.
  const replacement = await page.evaluateHandle(({ stem, source }) => {
    const Original = window.Worker;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    class Replacement extends Original {
      constructor(script: string | URL, options?: WorkerOptions) {
        super(new URL(String(script), document.baseURI).pathname.includes(stem) ? url : script, options);
      }
    }
    window.Worker = Replacement;
    return { restore() {
      if (window.Worker !== Replacement) throw new Error("Synthetic worker replacement changed unexpectedly");
      window.Worker = Original;
      URL.revokeObjectURL(url);
    } };
  }, { stem, source });
  return async () => {
    await replacement.evaluate(value => value.restore());
    await replacement.dispose();
  };
}
