import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { startFixtureQrSiteServer, type FixtureQrSiteServer } from "../fixtures/qr-site-server";
import {
  closeLaunchedApp,
  completeFirstRunSetup,
  findPage,
  getQrVisible,
  launchApp
} from "./harness";

test.describe("admin settings controls", () => {
  let fixtureServer: FixtureQrSiteServer;

  test.beforeEach(async () => {
    fixtureServer = await startFixtureQrSiteServer();
  });

  test.afterEach(async () => {
    await fixtureServer.close();
  });

  test("keeps every settings section reachable in a small window", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`);
      await resizeMainWindow(electronApp, 640, 480);
      await openSettingsWithCode(controlPage, "1234");

      // When
      await controlPage.getByTestId("clear-session-admin-code").scrollIntoViewIfNeeded();

      // Then
      await expect(controlPage.getByTestId("clear-session-admin-code")).toBeVisible();
      const box = await controlPage.getByTestId("clear-session-admin-code").boundingBox();
      const viewportHeight = await controlPage.evaluate(() => window.innerHeight);
      expect(box).not.toBeNull();
      expect(box?.y ?? viewportHeight).toBeGreaterThanOrEqual(0);
      expect(box?.y ?? viewportHeight).toBeLessThan(viewportHeight);
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("changes the admin code for settings entry and site login", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/`);
      await openSettingsWithCode(controlPage, "1234");

      // When
      await controlPage.getByTestId("change-admin-code").fill("5678");
      await controlPage.getByTestId("change-admin-code-confirm").fill("5678");
      await controlPage.getByTestId("change-admin-code-submit").click();
      await expect(controlPage.getByText("관리자 코드가 변경되었습니다.")).toBeVisible();
      await controlPage.getByRole("button", { name: "설정 잠그기" }).click();

      // Then
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      await expectSettingsEntryToFail(controlPage, "1234");
      await openSettingsWithCode(controlPage, "5678");
      await controlPage.getByRole("button", { name: "설정 잠그기" }).click();
      await enterSiteLogin(controlPage, "5678");
      await expect(controlPage.getByTestId("site-login-indicator")).toBeVisible();
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("locks out settings entry after repeated wrong admin codes", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`);
      await controlPage.getByTestId("settings-open").click();

      // When
      await submitSettingsAdminCode(controlPage, "0000");
      await submitSettingsAdminCode(controlPage, "0001");
      await submitSettingsAdminCode(controlPage, "0002");
      await submitSettingsAdminCode(controlPage, "1234");

      // Then
      await expect(controlPage.getByTestId("admin-errors")).toContainText("실패 횟수가 너무 많습니다.");
      await expect(controlPage.getByTestId("settings-qr-url")).toHaveCount(0);

      // When
      resetLockoutState(launchedApp.userDataDir);
      await submitSettingsAdminCode(controlPage, "1234");

      // Then
      await expect(controlPage.getByTestId("settings-qr-url")).toBeVisible();
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });
});

const resizeMainWindow = async (
  electronApp: ElectronApplication,
  width: number,
  height: number
): Promise<void> => {
  await electronApp.evaluate(
    ({ BaseWindow }, size) => {
      const [window] = BaseWindow.getAllWindows();

      if (window === undefined) {
        throw new Error("Main window was not found.");
      }

      window.setContentSize(size.width, size.height);
    },
    { height, width }
  );
};

const openSettingsWithCode = async (page: Page, adminCode: string): Promise<void> => {
  await page.getByTestId("settings-open").click();
  await submitSettingsAdminCode(page, adminCode);
  await expect(page.getByTestId("settings-qr-url")).toBeVisible();
};

const submitSettingsAdminCode = async (page: Page, adminCode: string): Promise<void> => {
  await page.getByTestId("admin-code-input").fill(adminCode);
  await page.getByRole("button", { name: "설정 열기" }).click();
};

const expectSettingsEntryToFail = async (page: Page, adminCode: string): Promise<void> => {
  await page.getByTestId("settings-open").click();
  await page.getByTestId("admin-code-input").fill(adminCode);
  await page.getByRole("button", { name: "설정 열기" }).click();
  await expect(page.getByTestId("admin-errors")).toContainText("관리자 코드가 올바르지 않습니다.");
  await page.getByTestId("admin-gate-cancel").click();
};

const enterSiteLogin = async (page: Page, adminCode: string): Promise<void> => {
  await page.getByTestId("site-login-submit").click();
  await page.getByTestId("site-login-admin-code-input").fill(adminCode);
  await page.getByTestId("site-login-admin-code-submit").click();
};

const resetLockoutState = (userDataDir: string): void => {
  fs.writeFileSync(path.join(userDataDir, "lockout-state.json"), JSON.stringify({ entries: {} }));
};
