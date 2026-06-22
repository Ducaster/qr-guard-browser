import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import path from "node:path";

import { startFixtureQrSiteServer, type FixtureQrSiteServer } from "../fixtures/qr-site-server";

const PROJECT_ROOT = path.resolve(__dirname, "..");

interface NodeGlobalTypes {
  readonly moduleType: string;
  readonly processType: string;
  readonly requireType: string;
}

interface ShellCounts {
  readonly baseWindowCount: number;
  readonly webContentsCount: number;
}

const readNodeGlobalTypes = (): NodeGlobalTypes => ({
  moduleType: typeof module,
  processType: typeof process,
  requireType: typeof require
});

const getLaunchEnv = (qrUrl: string): Record<string, string> => {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
  env["QR_GUARD_QR_URL"] = qrUrl;

  return env;
};

const launchApp = async (qrUrl: string): Promise<ElectronApplication> =>
  electron.launch({
    args: ["."],
    cwd: PROJECT_ROOT,
    env: getLaunchEnv(qrUrl)
  });

const findPage = async (
  electronApp: ElectronApplication,
  predicate: (page: Page) => boolean
): Promise<Page> => {
  const existingPage = electronApp.context().pages().find(predicate);

  if (existingPage !== undefined) {
    return existingPage;
  }

  return electronApp.waitForEvent("window", {
    predicate
  });
};

const getShellCounts = async (electronApp: ElectronApplication): Promise<ShellCounts> =>
  electronApp.evaluate(({ BaseWindow, webContents }) => ({
    baseWindowCount: BaseWindow.getAllWindows().length,
    webContentsCount: webContents.getAllWebContents().length
  }));

test.describe("secure Electron shell", () => {
  let fixtureServer: FixtureQrSiteServer;

  test.beforeEach(async () => {
    fixtureServer = await startFixtureQrSiteServer();
  });

  test.afterEach(async () => {
    await fixtureServer.close();
  });

  test("starts with a hardened control renderer and loads the fixture QR site", async () => {
    // Given
    const electronApp = await launchApp(`${fixtureServer.baseUrl}/login`);

    try {
      // When
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      const nodeGlobals = await controlPage.evaluate(readNodeGlobalTypes);
      const shellInfo = await controlPage.evaluate(() => window.qrGuard.getShellInfo());

      // Then
      await expect(controlPage.getByRole("heading", { name: "QR Guard Browser" })).toBeVisible();
      expect(qrPage.url()).toBe(`${fixtureServer.baseUrl}/login`);
      expect(nodeGlobals).toEqual({
        moduleType: "undefined",
        processType: "undefined",
        requireType: "undefined"
      });
      expect(shellInfo).toEqual({
        qrPartitionName: "persist:qr-site",
        qrSurfaceKind: "webContentsView",
        qrVisible: false
      });
    } finally {
      await electronApp.close();
    }
  });

  test("blocks fixture window.open calls from creating a new Electron window", async () => {
    // Given
    const electronApp = await launchApp(`${fixtureServer.baseUrl}/login`);

    try {
      await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      const beforeOpenCounts = await getShellCounts(electronApp);
      const newWindowAttempt = electronApp.waitForEvent("window", { timeout: 1_000 })
        .then(() => true)
        .catch(() => false);

      // When
      await qrPage.evaluate((targetUrl) => {
        window.open(targetUrl, "_blank");
      }, `${fixtureServer.baseUrl}/dashboard`);

      // Then
      await expect(newWindowAttempt).resolves.toBe(false);
      await expect.poll(() => getShellCounts(electronApp), {
        timeout: 1_000
      }).toEqual(beforeOpenCounts);
      const webContentsUrls = await electronApp.evaluate(({ webContents }) =>
        webContents.getAllWebContents().map((item) => item.getURL())
      );
      expect(webContentsUrls.filter((url) => url === `${fixtureServer.baseUrl}/dashboard`)).toEqual([]);
    } finally {
      await electronApp.close();
    }
  });
});
