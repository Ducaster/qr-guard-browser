import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { startFixtureQrSiteServer, type FixtureQrSiteServer } from "../fixtures/qr-site-server";
import { closeLaunchedApp, findPage, getQrVisible, launchApp } from "./harness";

const OUT_DIR = path.resolve(__dirname, "../docs/images");

interface Mark {
  readonly label: string;
  readonly testId: string;
}

const clearHighlights = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    document.querySelectorAll("[data-capture-overlay]").forEach((node) => {
      node.remove();
    });
  });
};

const highlight = async (page: Page, marks: readonly Mark[]): Promise<void> => {
  await clearHighlights(page);
  await page.evaluate((items: readonly Mark[]) => {
    for (const { testId, label } of items) {
      const target = document.querySelector(`[data-testid="${testId}"]`);

      if (target === null) {
        continue;
      }

      const rect = target.getBoundingClientRect();
      const box = document.createElement("div");
      box.setAttribute("data-capture-overlay", "");
      box.style.cssText = [
        "position:fixed",
        `left:${String(rect.left - 5)}px`,
        `top:${String(rect.top - 5)}px`,
        `width:${String(rect.width + 10)}px`,
        `height:${String(rect.height + 10)}px`,
        "border:3px solid #e3008c",
        "border-radius:8px",
        "z-index:2147483646",
        "pointer-events:none"
      ].join(";");

      const badge = document.createElement("div");
      badge.setAttribute("data-capture-overlay", "");
      badge.textContent = label;
      badge.style.cssText = [
        "position:fixed",
        `left:${String(rect.left - 16)}px`,
        `top:${String(rect.top - 16)}px`,
        "width:26px",
        "height:26px",
        "background:#e3008c",
        "color:#fff",
        "border-radius:50%",
        "font:700 15px -apple-system,system-ui,sans-serif",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "z-index:2147483647",
        "pointer-events:none",
        "box-shadow:0 2px 6px rgba(0,0,0,.35)"
      ].join(";");

      document.body.append(box, badge);
    }
  }, marks);
};

const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: path.join(OUT_DIR, name) });
};

// 문서용 스크린샷 생성 스펙. CI/일반 e2e에서는 건너뛰고,
// 재캡처가 필요할 때만 `CAPTURE_SCREENSHOTS=1 npx playwright test e2e/_capture.spec.ts`로 실행한다.
test("capture usage screenshots", async () => {
  test.skip(
    process.env["CAPTURE_SCREENSHOTS"] === undefined,
    "set CAPTURE_SCREENSHOTS=1 to regenerate docs screenshots"
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const fixture: FixtureQrSiteServer = await startFixtureQrSiteServer();
  const loginUrl = `${fixture.baseUrl}/login`;
  const launched = await launchApp(loginUrl);

  try {
    const control = await findPage(launched.app, (page) => page.url().includes("main_window"));
    await control.waitForLoadState("domcontentloaded");

    // 1) 첫 실행 설정
    await control.getByTestId("setup-qr-url").fill(loginUrl);
    await control.getByTestId("setup-admin-code").fill("1234");
    await control.getByTestId("setup-user-id").fill("강남센터");
    await control.getByTestId("setup-user-code").fill("2468");
    await control.getByTestId("setup-unlock-duration").fill("30");
    await control.getByTestId("setup-idle-timeout").fill("60");
    await highlight(control, [
      { label: "1", testId: "setup-qr-url" },
      { label: "2", testId: "setup-admin-code" },
      { label: "3", testId: "setup-user-id" },
      { label: "4", testId: "setup-user-code" },
      { label: "5", testId: "setup-submit" }
    ]);
    await shot(control, "01-setup.png");
    await clearHighlights(control);
    await control.getByTestId("setup-submit").click();
    await expect(control.getByTestId("locked-screen")).toBeVisible();

    // 2) 잠금 화면
    await highlight(control, [
      { label: "1", testId: "unlock-user-id" },
      { label: "2", testId: "unlock-code" },
      { label: "3", testId: "unlock-submit" },
      { label: "4", testId: "site-login-submit" },
      { label: "5", testId: "settings-open" }
    ]);
    await shot(control, "02-locked.png");
    await clearHighlights(control);

    // 3) 잠금 해제 후 상단 툴바 (뒤로/앞으로/새로고침/주소창/잠그기)
    await control.getByTestId("unlock-user-id").click();
    await control.getByRole("option", { name: "강남센터" }).click();
    await control.getByTestId("unlock-code").fill("2468");
    await control.getByTestId("unlock-submit").click();
    await expect.poll(() => getQrVisible(control), { timeout: 5_000 }).toBe(true);
    await highlight(control, [
      { label: "1", testId: "qr-go-back" },
      { label: "2", testId: "qr-go-forward" },
      { label: "3", testId: "qr-reload" },
      { label: "4", testId: "qr-address-input" },
      { label: "5", testId: "manual-lock" }
    ]);
    await shot(control, "03-toolbar.png");
    await clearHighlights(control);

    // 다시 잠금
    await control.getByTestId("manual-lock").click();
    await expect(control.getByTestId("locked-screen")).toBeVisible();

    // 4) 사이트 로그인 (관리자 인증) 다이얼로그
    await control.getByTestId("site-login-submit").click();
    await expect(control.getByTestId("site-login-admin-dialog")).toBeVisible();
    await control.getByTestId("site-login-admin-code-input").fill("1234");
    await highlight(control, [
      { label: "1", testId: "site-login-admin-code-input" },
      { label: "2", testId: "site-login-admin-code-submit" }
    ]);
    await shot(control, "04-sitelogin.png");
    await clearHighlights(control);
    await control.keyboard.press("Escape");

    // 5) 설정
    await expect(control.getByTestId("locked-screen")).toBeVisible();
    await control.evaluate(() => window.qrGuard.openSettings("1234"));
    await expect(control.getByTestId("settings-qr-url")).toBeVisible();
    await highlight(control, [{ label: "1", testId: "settings-qr-url" }]);
    await shot(control, "05-settings.png");
  } finally {
    await closeLaunchedApp(launched);
    await fixture.close();
  }
});
