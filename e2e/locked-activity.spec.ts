import { expect, test } from "@playwright/test";

import { startFixtureQrSiteServer } from "../fixtures/qr-site-server";
import { closeLaunchedApp, completeFirstRunSetup, findPage, launchApp } from "./harness";

interface ClickCounter {
  qrGuardClicks?: number;
}

test("clicks the hidden QR page periodically while locked without reloading it", async () => {
  const fixture = await startFixtureQrSiteServer();
  const loginUrl = `${fixture.baseUrl}/login`;
  const launched = await launchApp(loginUrl, { lockedActivityMs: "1000" });

  try {
    const control = await findPage(launched.app, (page) => page.url().includes("main_window"));
    const qr = await findPage(launched.app, (page) => page.url().startsWith(fixture.baseUrl));
    await completeFirstRunSetup(control, loginUrl);

    // A reload would wipe this counter, so a growing count also proves the page was not reloaded.
    await qr.evaluate(() => {
      const page = window as ClickCounter;
      page.qrGuardClicks = 0;
      document.addEventListener("click", () => {
        page.qrGuardClicks = (page.qrGuardClicks ?? 0) + 1;
      });
    });

    await expect
      .poll(() => qr.evaluate(() => (window as ClickCounter).qrGuardClicks ?? -1), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2);
    expect(qr.url()).toBe(loginUrl);
  } finally {
    await closeLaunchedApp(launched);
    await fixture.close();
  }
});
