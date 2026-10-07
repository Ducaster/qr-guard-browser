import { expect, test, type Page } from "@playwright/test";

import { startFixtureQrSiteServer } from "../fixtures/qr-site-server";
import { closeLaunchedApp, completeFirstRunSetup, findPage, launchApp } from "./harness";

const readMarker = async (page: Page): Promise<boolean> => {
  try {
    return await page.evaluate(() => (window as { qrGuardMarker?: boolean }).qrGuardMarker === true);
  } catch {
    // The page is mid-reload; treat it as not yet settled.
    return true;
  }
};

test("reloads the hidden QR page periodically while locked", async () => {
  const fixture = await startFixtureQrSiteServer();
  const loginUrl = `${fixture.baseUrl}/login`;
  const launched = await launchApp(loginUrl, { lockedRefreshMs: "1000" });

  try {
    const control = await findPage(launched.app, (page) => page.url().includes("main_window"));
    const qr = await findPage(launched.app, (page) => page.url().startsWith(fixture.baseUrl));
    await completeFirstRunSetup(control, loginUrl);

    await qr.evaluate(() => {
      (window as { qrGuardMarker?: boolean }).qrGuardMarker = true;
    });

    await expect.poll(() => readMarker(qr), { timeout: 5_000 }).toBe(false);
    expect(qr.url()).toBe(loginUrl);
  } finally {
    await closeLaunchedApp(launched);
    await fixture.close();
  }
});
