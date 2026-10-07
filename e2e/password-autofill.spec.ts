import { expect, test, type Page } from "@playwright/test";

import { startFixtureQrSiteServer, type FixtureQrSiteServer } from "../fixtures/qr-site-server";
import {
  closeLaunchedApp,
  completeFirstRunSetup,
  findPage,
  getQrVisible,
  launchApp
} from "./harness";

test.describe("QR site password autosave and autofill", () => {
  let fixtureServer: FixtureQrSiteServer;

  test.beforeEach(async () => {
    fixtureServer = await startFixtureQrSiteServer();
  });

  test.afterEach(async () => {
    await fixtureServer.close();
  });

  test("saves, autofills, and deletes only the QR site's login password", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/login`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`);
      await enterSiteLogin(controlPage, "1234");
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);

      // When
      await qrPage.getByTestId("fixture-username").fill("operator01");
      await qrPage.getByTestId("fixture-password").fill("site-password-123");
      await qrPage.getByTestId("fixture-login-submit").click();
      await expect(controlPage.getByTestId("site-credential-save-prompt")).toBeVisible();
      await controlPage.getByTestId("site-credential-save").click();
      await expect(controlPage.getByTestId("site-credential-save-prompt")).toHaveCount(0);
      await controlPage.getByTestId("manual-lock").click();
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      await expect(controlPage.getByTestId("unlock-code")).toHaveValue("");

      // Then
      await qrPage.goto(`${fixtureServer.baseUrl}/login?visit=next`);
      await enterSiteLogin(controlPage, "1234");
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);
      await expect(qrPage.getByTestId("fixture-username")).toHaveValue("operator01");
      await expect(qrPage.getByTestId("fixture-password")).toHaveValue("site-password-123");
      expect(qrPage.url()).toContain("/login");

      await controlPage.getByTestId("manual-lock").click();
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      // 지역이 staff01 하나뿐이라 잠금 화면 드롭다운에서 자동 선택된다.
      await expect(controlPage.getByTestId("unlock-user-id")).toContainText("staff01");
      await controlPage.getByTestId("unlock-submit").click();
      await expect(controlPage.getByTestId("unlock-errors")).toContainText("인증 코드");
      await expect(controlPage.getByTestId("unlock-code")).toHaveValue("");

      await openSettings(controlPage);
      await expect(controlPage.getByTestId("settings-saved-login-row")).toContainText(
        fixtureServer.baseUrl
      );
      await expect(controlPage.getByTestId("settings-saved-login-row")).toContainText("operator01");
      await controlPage.getByTestId("settings-saved-login-delete").click();
      await expect(controlPage.getByTestId("settings-saved-login-empty")).toBeVisible();
      await lockSettings(controlPage);

      await qrPage.goto(`${fixtureServer.baseUrl}/login?visit=after-delete`);
      await enterSiteLogin(controlPage, "1234");
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);
      await qrPage.waitForTimeout(500);
      await expect(qrPage.getByTestId("fixture-username")).toHaveValue("");
      await expect(qrPage.getByTestId("fixture-password")).toHaveValue("");
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("skips unchanged logins and offers a password update under the toolbar", async () => {
    // Given
    const loginUrl = `${fixtureServer.baseUrl}/login`;
    const launchedApp = await launchApp(loginUrl);

    try {
      const controlPage = await findPage(launchedApp.app, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(launchedApp.app, (page) => page.url().startsWith(fixtureServer.baseUrl));
      const prompt = controlPage.getByTestId("site-credential-save-prompt");
      await completeFirstRunSetup(controlPage, loginUrl);
      await enterSiteLogin(controlPage, "1234");
      await qrPage.getByTestId("fixture-username").fill("operator01");
      await qrPage.getByTestId("fixture-password").fill("old-password");
      await qrPage.getByTestId("fixture-login-submit").click();
      await controlPage.getByTestId("site-credential-save").click();
      await expect(prompt).toHaveCount(0);

      // When
      await qrPage.goto(`${loginUrl}?visit=same`);
      await expect(qrPage.getByTestId("fixture-password")).toHaveValue("old-password");
      await qrPage.getByTestId("fixture-login-submit").click();
      await qrPage.waitForTimeout(500);
      const unchangedPromptCount = await prompt.count();
      await qrPage.goto(`${loginUrl}?visit=changed`);
      await expect(qrPage.getByTestId("fixture-password")).toHaveValue("old-password");
      await qrPage.getByTestId("fixture-password").fill("new-password");
      await qrPage.getByTestId("fixture-password").press("Enter");

      // Then
      expect(unchangedPromptCount).toBe(0);
      await expect(prompt).toContainText("새 비밀번호로 바꿀까요");
      await expect(controlPage.getByTestId("site-credential-never")).toHaveCount(0);
      await expect.poll(() => controlPage.evaluate(() => window.innerHeight)).toBeGreaterThanOrEqual(136);
      const promptTop = await prompt.evaluate((element) => element.getBoundingClientRect().top);
      expect(promptTop).toBeGreaterThanOrEqual(64);
      await expect(controlPage.getByTestId("manual-lock")).toBeVisible();
      await controlPage.getByTestId("site-credential-save").click();
      await expect(prompt).toHaveCount(0);
      await expect.poll(() => controlPage.evaluate(() => window.innerHeight)).toBeLessThanOrEqual(64);
      await qrPage.goto(`${loginUrl}?visit=after-update`);
      await expect(qrPage.getByTestId("fixture-password")).toHaveValue("new-password");
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("asks again after a never-save site is re-enabled in settings", async () => {
    // Given
    const loginUrl = `${fixtureServer.baseUrl}/login`;
    const launchedApp = await launchApp(loginUrl);

    try {
      const controlPage = await findPage(launchedApp.app, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(launchedApp.app, (page) => page.url().startsWith(fixtureServer.baseUrl));
      const prompt = controlPage.getByTestId("site-credential-save-prompt");
      const login = async (): Promise<void> => {
        await qrPage.getByTestId("fixture-username").fill("operator01");
        await qrPage.getByTestId("fixture-password").fill("site-password");
        await qrPage.getByTestId("fixture-login-submit").click();
      };
      await completeFirstRunSetup(controlPage, loginUrl);
      await enterSiteLogin(controlPage, "1234");
      await login();
      await controlPage.getByTestId("site-credential-never").click();
      await controlPage.getByTestId("manual-lock").click();

      // When
      await openSettings(controlPage);
      await expect(controlPage.getByTestId("settings-blocked-origin-row")).toContainText(fixtureServer.baseUrl);
      await controlPage.getByTestId("settings-blocked-origin-unblock").click();
      await expect(controlPage.getByTestId("settings-blocked-origin-row")).toHaveCount(0);
      await lockSettings(controlPage);
      await qrPage.goto(`${loginUrl}?visit=unblocked`);
      await enterSiteLogin(controlPage, "1234");
      await login();

      // Then
      await expect(prompt).toContainText("로그인 정보를 저장할까요");
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });
});

const openSettings = async (page: Page): Promise<void> => {
  const response = await page.evaluate(() => window.qrGuard.openSettings("1234"));

  expect(response.ok).toBe(true);
  await expect(page.getByTestId("settings-qr-url")).toBeVisible();
};

const lockSettings = async (page: Page): Promise<void> => {
  const response = await page.evaluate(() => window.qrGuard.closeSettings());

  expect(response.ok).toBe(true);
  await expect(page.getByTestId("locked-screen")).toBeVisible();
};

const enterSiteLogin = async (page: Page, adminCode: string): Promise<void> => {
  await page.getByTestId("site-login-submit").click();
  await page.getByTestId("site-login-admin-code-input").fill(adminCode);
  await page.getByTestId("site-login-admin-code-submit").click();
  await expect(page.getByTestId("site-login-indicator")).toBeVisible();
};
