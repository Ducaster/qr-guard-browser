import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { startFixtureQrSiteServer, type FixtureQrSiteServer } from "../fixtures/qr-site-server";
import { closeLaunchedApp, completeFirstRunSetup, findPage, getQrVisible, launchApp } from "./harness";

// 최소 창 폭(720)부터 그 이상까지 상단 툴바가 한 줄을 유지하는지 검증한다.
// (720 미만은 setMinimumSize로 창 자체가 줄어들지 않으므로 wrap/잘림이 발생하지 않는다.)
const WIDTHS = [720, 900, 1280] as const;
const TOOLBAR_MAX_HEIGHT = 64;

const resizeWindowWidth = async (app: ElectronApplication, width: number): Promise<void> => {
  await app.evaluate(({ BaseWindow }, targetWidth) => {
    const win = BaseWindow.getAllWindows()[0];
    if (win === undefined) {
      return;
    }
    const bounds = win.getBounds();
    win.setBounds({ height: bounds.height, width: targetWidth, x: bounds.x, y: bounds.y });
  }, width);
};

const expectToolbarOnOneRow = async (page: Page): Promise<void> => {
  const toolbar = page.getByTestId("unlock-toolbar");

  await expect(toolbar).toBeVisible();
  await expect(page.getByTestId("qr-address-input")).toBeVisible();
  await expect(page.getByTestId("manual-lock")).toBeVisible();

  const height = await toolbar.evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(TOOLBAR_MAX_HEIGHT);
};

test("unlocked toolbar stays on one row from the minimum width up", async () => {
  const fixture: FixtureQrSiteServer = await startFixtureQrSiteServer();
  const loginUrl = `${fixture.baseUrl}/login`;
  const launched = await launchApp(loginUrl, { unlockDurationSeconds: "600" });

  try {
    const control = await findPage(launched.app, (page) => page.url().includes("main_window"));
    await completeFirstRunSetup(control, loginUrl);

    await control.getByTestId("unlock-user-id").click();
    await control.getByRole("option", { name: "staff01" }).click();
    await control.getByTestId("unlock-code").fill("2468");
    await control.getByTestId("unlock-submit").click();
    await expect.poll(() => getQrVisible(control), { timeout: 5_000 }).toBe(true);

    for (const width of WIDTHS) {
      await resizeWindowWidth(launched.app, width);
      await control.waitForTimeout(200);
      await expectToolbarOnOneRow(control);
    }
  } finally {
    await closeLaunchedApp(launched);
    await fixture.close();
  }
});
