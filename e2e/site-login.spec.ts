import { expect, test, type Page } from "@playwright/test";

import { startFixtureQrSiteServer, type FixtureQrSiteServer } from "../fixtures/qr-site-server";
import {
  closeLaunchedApp,
  completeFirstRunSetup,
  findPage,
  getQrVisible,
  launchApp
} from "./harness";

test.describe("site login mode", () => {
  let fixtureServer: FixtureQrSiteServer;

  test.beforeEach(async () => {
    fixtureServer = await startFixtureQrSiteServer();
  });

  test.afterEach(async () => {
    await fixtureServer.close();
  });

  test("auto-locks by stable QR title after multi-step login on a changing QR URL", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/`);
      await saveQrTitlePattern(controlPage, "QR 코드");

      // When
      await enterSiteLogin(controlPage, "2468");
      await navigateFixtureToQr(qrPage);

      // Then
      const qrUrl = new URL(qrPage.url());
      expect(qrUrl.pathname).toBe("/qr");
      expect(qrUrl.searchParams.has("token")).toBe(true);
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(false);
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("learns the current QR title from the siteLogin toolbar", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      const qrPage = await findPage(electronApp, (page) => page.url().startsWith(fixtureServer.baseUrl));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/`);
      await enterSiteLogin(controlPage, "2468");
      await navigateFixtureToQr(qrPage);
      await expect(controlPage.getByTestId("site-login-indicator")).toBeVisible();
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(true);

      // When
      await controlPage.getByTestId("learn-qr-title").click();

      // Then
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      await expect.poll(() => getQrVisible(controlPage), { timeout: 2_000 }).toBe(false);
      await openSettings(controlPage);
      await expect(controlPage.getByTestId("settings-qr-title-pattern")).toHaveValue("QR 코드");
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });

  test("does not enter siteLogin when the regional code is wrong", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/`);
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/`);

      // When
      await enterSiteLogin(controlPage, "9999");

      // Then
      await expect(controlPage.getByTestId("unlock-errors")).toContainText("올바르지 않습니다");
      await expect(controlPage.getByTestId("locked-screen")).toBeVisible();
      await expect(controlPage.getByTestId("site-login-indicator")).toHaveCount(0);
      expect(await getQrVisible(controlPage)).toBe(false);
    } finally {
      await closeLaunchedApp(launchedApp);
    }
  });
});

const enterSiteLogin = async (page: Page, code: string): Promise<void> => {
  await page.getByTestId("unlock-user-id").fill("staff01");
  await page.getByTestId("unlock-code").fill(code);
  await page.getByTestId("site-login-submit").click();
};

const navigateFixtureToQr = async (page: Page): Promise<void> => {
  await page.getByTestId("fixture-login-link").click();
  await page.getByTestId("fixture-login-submit").click();
  await page.getByTestId("fixture-step-one-next").click();
  await page.getByTestId("fixture-step-two-qr").click();
};

const openSettings = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "설정" }).click();
  await page.getByTestId("admin-code-input").fill("1234");
  await page.getByRole("button", { name: "설정 열기" }).click();
  await expect(page.getByTestId("settings-qr-title-pattern")).toBeVisible();
};

const saveQrTitlePattern = async (page: Page, qrTitlePattern: string): Promise<void> => {
  await openSettings(page);
  await page.getByTestId("settings-qr-title-pattern").fill(qrTitlePattern);
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.getByRole("button", { name: "설정 잠그기" }).click();
  await expect(page.getByTestId("locked-screen")).toBeVisible();
};
