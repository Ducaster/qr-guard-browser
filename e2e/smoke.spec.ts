import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { startFixtureQrSiteServer, type FixtureQrSiteServer } from "../fixtures/qr-site-server";
import {
  closeLaunchedApp,
  completeFirstRunSetup,
  findPage,
  getAuditLogPath,
  getQrVisible,
  getShellCounts,
  launchApp,
  readNodeGlobalTypes
} from "./harness";

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
      await expect(controlPage.getByText("QR 가드 브라우저")).toBeVisible();
      await expect(controlPage.getByRole("heading", { name: "초기 설정" })).toBeVisible();
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

  test("routes fixture window.open calls into the existing QR view", async () => {
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
      await expect(qrPage).toHaveURL(`${fixtureServer.baseUrl}/dashboard`);
      const webContentsUrls = await electronApp.evaluate(({ webContents }) =>
        webContents.getAllWebContents().map((item) => item.getURL())
      );
      expect(webContentsUrls.filter((url) => url === `${fixtureServer.baseUrl}/dashboard`)).toEqual([
        `${fixtureServer.baseUrl}/dashboard`
      ]);
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
      await expect(controlPage.getByRole("button", { name: "설정" })).toBeVisible();
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("shows a retry affordance when the configured QR site fails to load", async () => {
    // Given
    const unreachableQrUrl = "http://127.0.0.1:1/login";
    const launchedApp = await launchApp(unreachableQrUrl);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));

      // When
      await completeFirstRunSetup(controlPage, unreachableQrUrl);

      // Then
      await expect(controlPage.getByTestId("qr-load-failure-message")).toContainText(
        "QR 사이트를 불러오지 못했습니다."
      );
      await expect(controlPage.getByTestId("qr-load-retry")).toBeVisible();
      expect(await getQrVisible(controlPage)).toBe(false);

      await controlPage.getByTestId("qr-load-retry").click();
      await expect(controlPage.getByTestId("qr-load-failure-message")).toContainText(
        "QR 사이트를 불러오지 못했습니다."
      );
      expect(await getQrVisible(controlPage)).toBe(false);
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("unlocks with the correct code, counts down, and relocks without reloading QR contents", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/qr`, {
      unlockDurationSeconds: "3"
    });
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/qr`, {
        unlockDurationSeconds: "3"
      });
      await expect(qrPage.locator("#qr-code")).toContainText("fixture-qr-code");
      await qrPage.evaluate(() => {
        Reflect.set(globalThis, "__qrGuardReloadMarker", "survived");
      });

      // When
      await selectUnlockRegion(controlPage, "staff01");
      await controlPage.getByTestId("unlock-code").fill("2468");
      await controlPage.getByTestId("unlock-submit").click();

      // Then
      await expect(controlPage.getByTestId("unlock-toolbar")).toBeVisible();
      await expect(controlPage.getByTestId("unlock-countdown")).toContainText("초");
      await expect(controlPage.getByTestId("qr-go-back")).toBeDisabled();
      await expect(controlPage.getByTestId("qr-go-forward")).toBeDisabled();
      await expect(controlPage.getByTestId("qr-reload")).toBeVisible();
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);
      await expect.poll(() => getQrVisible(controlPage), { timeout: 8_000 }).toBe(false);
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

  test("navigates the QR view from the toolbar address bar and writes safe diagnostics", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/qr`, {
      qrNetDiagnosticsEnabled: true,
      unlockDurationSeconds: "10"
    });
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/qr`, {
        unlockDurationSeconds: "10"
      });
      await selectUnlockRegion(controlPage, "staff01");
      await controlPage.getByTestId("unlock-code").fill("2468");
      await controlPage.getByTestId("unlock-submit").click();
      const addressInput = controlPage.getByTestId("qr-address-input");
      const diagnosticsLogPath = path.join(launchedApp.userDataDir, "qr-net-diagnostics.log");

      // When
      await expect(addressInput).toHaveValue(`${fixtureServer.baseUrl}/qr`);
      await addressInput.fill(`${fixtureServer.baseUrl}/dashboard`);
      await addressInput.press("Enter");

      // Then
      await expect(qrPage.getByRole("heading", { name: "Dashboard" })).toBeVisible();
      await expect(addressInput).toHaveValue(`${fixtureServer.baseUrl}/dashboard`);
      await expect.poll(() => readTextIfExists(diagnosticsLogPath), { timeout: 5_000 }).toContain(
        `"url":"${fixtureServer.baseUrl}/dashboard"`
      );
      const diagnosticsLog = readTextIfExists(diagnosticsLogPath);
      expect(diagnosticsLog).toContain('"statusCode":200');
      expect(diagnosticsLog).not.toContain("fixtureSession=1");
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
      await selectUnlockRegion(controlPage, "staff01");
      await controlPage.getByTestId("unlock-code").fill("9999");
      await controlPage.getByTestId("unlock-submit").click();

      // Then
      await expect(controlPage.getByTestId("unlock-errors")).toContainText("올바르지 않습니다");
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
      await controlPage.getByRole("button", { name: "설정" }).click();
      await controlPage.getByTestId("admin-code-input").fill("9999");
      await controlPage.getByRole("button", { name: "설정 열기" }).click();

      // Then
      await expect(controlPage.getByTestId("admin-errors")).toContainText("관리자 코드가 올바르지 않습니다.");
      await expect(controlPage.getByTestId("settings-qr-url")).toHaveCount(0);
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("keeps an expired login page hidden until an operator authenticates", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`);

      // When / Then
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(false);
      await expect(controlPage.getByTestId("unlock-toolbar")).toHaveCount(0);
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("idle auto-lock relocks an unlocked QR page before the unlock timer", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/qr`, {
      idlePollMs: "100",
      systemIdleSeconds: "2",
      unlockDurationSeconds: "60"
    });
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/qr`, {
        idleAutoLockSeconds: "1",
        unlockDurationSeconds: "60"
      });
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();

      // When
      await selectUnlockRegion(controlPage, "staff01");
      await controlPage.getByTestId("unlock-code").fill("2468");
      await controlPage.getByTestId("unlock-submit").click();

      // Then
      await expect(controlPage.getByTestId("unlock-toolbar")).toBeVisible();
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);
      await expect.poll(() => getQrVisible(controlPage), { timeout: 3_000 }).toBe(false);
      const auditLog = fs.readFileSync(getAuditLogPath(launchedApp.userDataDir), "utf8");
      expect(auditLog).toContain('"reason":"idle"');
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });
});

const selectUnlockRegion = async (page: Page, regionName: string): Promise<void> => {
  await page.getByTestId("unlock-user-id").click();
  await page.getByRole("option", { name: regionName }).click();
};

const readTextIfExists = (filePath: string): string =>
  fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
