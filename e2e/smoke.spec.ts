import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
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

interface LaunchedApp {
  readonly app: ElectronApplication;
  readonly userDataDir: string;
}

const readNodeGlobalTypes = (): NodeGlobalTypes => ({
  moduleType: typeof module,
  processType: typeof process,
  requireType: typeof require
});

const getLaunchEnv = (qrUrl: string, userDataDir: string): Record<string, string> => {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
  env["QR_GUARD_ALLOW_INSECURE_TEST_STORAGE"] = "1";
  env["QR_GUARD_QR_URL"] = qrUrl;
  env["QR_GUARD_TEST_UNLOCK_DURATION_SECONDS"] = "1";
  env["QR_GUARD_USER_DATA_DIR"] = userDataDir;

  return env;
};

const launchApp = async (qrUrl: string): Promise<LaunchedApp> => {
  const userDataDir = createUserDataDir();
  const app = await electron.launch({
    args: ["."],
    cwd: PROJECT_ROOT,
    env: getLaunchEnv(qrUrl, userDataDir)
  });

  return { app, userDataDir };
};

const closeLaunchedApp = async (launchedApp: LaunchedApp): Promise<void> => {
  await launchedApp.app.close();
  fs.rmSync(launchedApp.userDataDir, { force: true, recursive: true });
};

const createUserDataDir = (): string => {
  const parentDir = path.join(PROJECT_ROOT, ".tmp");

  fs.mkdirSync(parentDir, { recursive: true });

  return fs.mkdtempSync(path.join(parentDir, "e2e-user-data-"));
};

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

const getQrVisible = async (controlPage: Page): Promise<boolean> => {
  const shellInfo = await controlPage.evaluate(() => window.qrGuard.getShellInfo());

  return shellInfo.qrVisible;
};

const getAuditLogPath = (userDataDir: string): string =>
  path.join(userDataDir, "audit-log.jsonl");

const completeFirstRunSetup = async (page: Page, qrUrl: string): Promise<void> => {
  await page.getByTestId("setup-qr-url").fill(qrUrl);
  await page.getByTestId("setup-admin-code").fill("1234");
  await page.getByTestId("setup-user-id").fill("staff01");
  await page.getByTestId("setup-user-code").fill("2468");
  await page.getByTestId("setup-login-pattern").fill("/login");
  await page.getByTestId("setup-submit").click();
  await expect(page.getByTestId("locked-screen")).toBeVisible();
};

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
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      // When
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      const nodeGlobals = await controlPage.evaluate(readNodeGlobalTypes);
      const shellInfo = await controlPage.evaluate(() => window.qrGuard.getShellInfo());

      // Then
      await expect(controlPage.getByText("QR Guard Browser")).toBeVisible();
      await expect(controlPage.getByRole("heading", { name: "First-run setup" })).toBeVisible();
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
      await closeLaunchedApp(launchedApp);
    }
  });

  test("blocks fixture window.open calls from creating a new Electron window", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

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
      await closeLaunchedApp(launchedApp);
    }
  });

  test("completes first-run setup and lands on the locked screen", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));

      // When
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`);

      // Then
      const shellInfo = await controlPage.evaluate(() => window.qrGuard.getShellInfo());
      expect(shellInfo.qrVisible).toBe(false);
      await expect(controlPage.getByRole("button", { name: "Settings" })).toBeVisible();
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("unlocks with the correct code, counts down, and relocks without reloading QR contents", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`);
      await qrPage.evaluate(() => {
        Reflect.set(globalThis, "__qrGuardReloadMarker", "survived");
      });

      // When
      await controlPage.getByTestId("unlock-user-id").fill("staff01");
      await controlPage.getByTestId("unlock-code").fill("2468");
      await controlPage.getByTestId("unlock-submit").click();

      // Then
      await expect(controlPage.getByTestId("unlock-toolbar")).toBeVisible();
      await expect(controlPage.getByTestId("unlock-countdown")).toContainText("s");
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);
      await expect.poll(() => getQrVisible(controlPage), { timeout: 5_000 }).toBe(false);
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();

      const markerSurvived = await qrPage.evaluate<boolean>(
        () => Reflect.get(globalThis, "__qrGuardReloadMarker") === "survived"
      );
      expect(markerSurvived).toBe(true);
      const auditLog = fs.readFileSync(getAuditLogPath(launchedApp.userDataDir), "utf8");
      expect(auditLog).toContain('"userId":"staff01"');
      expect(auditLog).toContain('"reason":"timer"');
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("keeps QR locked and writes no success audit event when the code is wrong", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`);

      // When
      await controlPage.getByTestId("unlock-user-id").fill("staff01");
      await controlPage.getByTestId("unlock-code").fill("9999");
      await controlPage.getByTestId("unlock-submit").click();

      // Then
      await expect(controlPage.getByTestId("unlock-errors")).toContainText("incorrect");
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      expect(await getQrVisible(controlPage)).toBe(false);
      const auditLogPath = getAuditLogPath(launchedApp.userDataDir);
      const auditLog = fs.existsSync(auditLogPath) ? fs.readFileSync(auditLogPath, "utf8") : "";
      expect(auditLog).not.toContain('"userId":"staff01"');
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("keeps settings closed when the admin code is wrong", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`);

      // When
      await controlPage.getByRole("button", { name: "Settings" }).click();
      await controlPage.getByTestId("admin-code-input").fill("9999");
      await controlPage.getByRole("button", { name: "Open settings" }).click();

      // Then
      await expect(controlPage.getByTestId("admin-errors")).toContainText("Admin code is incorrect.");
      await expect(controlPage.getByTestId("settings-qr-url")).toHaveCount(0);
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });
});
