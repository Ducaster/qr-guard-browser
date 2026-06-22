import { expect, test } from "@playwright/test";
import fs from "node:fs";

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
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/qr`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/qr`);
      await qrPage.waitForLoadState("networkidle");
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

  test("shows an expired login page without an app code and relocks on QR navigation", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`, {
        loggedInUrlPattern: "/qr",
        loginUrlPattern: "/login"
      });

      // When
      await expect(controlPage.getByTestId("unlock-toolbar")).toBeVisible();
      await expect(controlPage.getByText("로그인 모드 (인증 없이 표시 중)")).toBeVisible();
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);
      await qrPage.goto(`${fixtureServer.baseUrl}/qr`);

      // Then
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(false);
      const auditLog = fs.readFileSync(getAuditLogPath(launchedApp.userDataDir), "utf8");
      expect(auditLog).toContain('"reason":"login-mode"');
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("manual login completion relocks when automatic completion detection is disabled", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`, {
        loginUrlPattern: "/login"
      });
      await expect(controlPage.getByTestId("manual-login-complete")).toBeVisible();

      // When
      await controlPage.getByTestId("manual-login-complete").click();

      // Then
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      expect(await getQrVisible(controlPage)).toBe(false);
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
      await controlPage.getByTestId("unlock-user-id").fill("staff01");
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
