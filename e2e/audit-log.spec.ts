import { expect, test, type Page } from "@playwright/test";

import { startFixtureQrSiteServer, type FixtureQrSiteServer } from "../fixtures/qr-site-server";
import {
  closeLaunchedApp,
  completeFirstRunSetup,
  findPage,
  getQrVisible,
  launchApp
} from "./harness";

test.describe("audit log settings view", () => {
  let fixtureServer: FixtureQrSiteServer;

  test.beforeEach(async () => {
    fixtureServer = await startFixtureQrSiteServer();
  });

  test.afterEach(async () => {
    await fixtureServer.close();
  });

  test("shows two users' successful unlock history and excludes failed auth", async () => {
    // Given
    const launchedApp = await launchApp(`${fixtureServer.baseUrl}/qr`, {
      unlockDurationSeconds: "3"
    });
    const electronApp = launchedApp.app;

    try {
      const controlPage = await findPage(electronApp, (page) => page.url().includes("main_window"));
      await completeFirstRunSetup(controlPage, `${fixtureServer.baseUrl}/qr`, {
        unlockDurationSeconds: "3"
      });
      await openSettings(controlPage);
      await addUser(controlPage, "staff02", "1357");
      await lockSettings(controlPage);

      // When
      await submitFailedUnlock(controlPage, "staff02", "9999");
      await unlockAndWaitForRelock(controlPage, "staff01", "2468");
      await unlockAndWaitForRelock(controlPage, "staff02", "1357");
      await openSettings(controlPage);

      // Then
      const rows = controlPage.getByTestId("audit-event-row");
      await expect(rows).toHaveCount(2);
      await expect(rows.filter({ hasText: "staff01" })).toHaveCount(1);
      await expect(rows.filter({ hasText: "staff02" })).toHaveCount(1);
      await expect(controlPage.getByTestId("audit-last-auth-staff01")).not.toContainText("없음");
      await expect(controlPage.getByTestId("audit-last-auth-staff02")).not.toContainText("없음");
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

const addUser = async (page: Page, userId: string, code: string): Promise<void> => {
  await page.getByTestId("settings-add-user-id").fill(userId);
  await page.getByTestId("settings-add-user-code").fill(code);
  await page.getByRole("button", { name: "지역 추가" }).click();
  await expect(page.getByText(userId)).toBeVisible();
};

const lockSettings = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "설정 잠그기" }).click();
  await expect(page.getByTestId("locked-screen")).toBeVisible();
};

const submitFailedUnlock = async (page: Page, userId: string, code: string): Promise<void> => {
  await selectUnlockRegion(page, userId);
  await page.getByTestId("unlock-code").fill(code);
  await page.getByTestId("unlock-submit").click();
  await expect(page.getByTestId("unlock-errors")).toContainText("올바르지 않습니다");
  await expect(page.getByTestId("locked-screen")).toBeVisible();
};

const unlockAndWaitForRelock = async (page: Page, userId: string, code: string): Promise<void> => {
  await selectUnlockRegion(page, userId);
  await page.getByTestId("unlock-code").fill(code);
  await page.getByTestId("unlock-submit").click();
  await expect(page.getByTestId("unlock-toolbar")).toBeVisible();
  await expect.poll(() => getQrVisible(page), { timeout: 2_000 }).toBe(true);
  await expect(page.getByTestId("locked-screen")).toBeVisible({ timeout: 8_000 });
  await expect.poll(() => getQrVisible(page), { timeout: 8_000 }).toBe(false);
};

const selectUnlockRegion = async (page: Page, regionName: string): Promise<void> => {
  await page.getByTestId("unlock-user-id").click();
  await page.getByRole("option", { name: regionName }).click();
};
