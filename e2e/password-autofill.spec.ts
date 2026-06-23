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
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/login`, {
        loginUrlPattern: "/login"
      });
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);

      // When
      await qrPage.getByTestId("fixture-username").fill("operator01");
      await qrPage.getByTestId("fixture-password").fill("site-password-123");
      await qrPage.getByTestId("fixture-login-submit").click();
      await expect(controlPage.getByTestId("site-credential-save-prompt")).toBeVisible();
      await controlPage.getByTestId("site-credential-save").click();
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      await expect(controlPage.getByTestId("unlock-code")).toHaveValue("");

      // Then
      await qrPage.goto(`${fixtureServer.baseUrl}/login?visit=next`);
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);
      await expect(qrPage.getByTestId("fixture-username")).toHaveValue("operator01");
      await expect(qrPage.getByTestId("fixture-password")).toHaveValue("site-password-123");
      expect(qrPage.url()).toContain("/login");

      await controlPage.getByTestId("manual-login-complete").click();
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      await controlPage.getByTestId("unlock-user-id").fill("staff01");
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
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);
      await qrPage.waitForTimeout(500);
      await expect(qrPage.getByTestId("fixture-username")).toHaveValue("");
      await expect(qrPage.getByTestId("fixture-password")).toHaveValue("");
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });
});

const openSettings = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "설정" }).click();
  await page.getByTestId("admin-code-input").fill("1234");
  await page.getByRole("button", { name: "설정 열기" }).click();
  await expect(page.getByTestId("settings-qr-url")).toBeVisible();
};

const lockSettings = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "설정 잠그기" }).click();
  await expect(page.getByTestId("locked-screen")).toBeVisible();
};
