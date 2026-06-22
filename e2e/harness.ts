import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(__dirname, "..");

interface NodeGlobalTypes {
  readonly moduleType: string;
  readonly processType: string;
  readonly requireType: string;
}

interface ShellCounts {
  readonly baseWindowCount: number;
  readonly webContentsCount: number;
}

export interface LaunchedApp {
  readonly app: ElectronApplication;
  readonly userDataDir: string;
}

export interface LaunchOverrides {
  readonly idlePollMs?: string;
  readonly loginModeTimeoutMs?: string;
  readonly systemIdleSeconds?: string;
  readonly unlockDurationSeconds?: string;
}

export interface FirstRunSetupOptions {
  readonly idleAutoLockSeconds?: string;
  readonly loggedInUrlPattern?: string;
  readonly loginUrlPattern?: string;
  readonly titleContains?: string;
  readonly unlockDurationSeconds?: string;
}

export const readNodeGlobalTypes = (): NodeGlobalTypes => ({
  moduleType: typeof module,
  processType: typeof process,
  requireType: typeof require
});

export const launchApp = async (
  qrUrl: string,
  overrides: LaunchOverrides = {}
): Promise<LaunchedApp> => {
  const userDataDir = createUserDataDir();
  const app = await electron.launch({
    args: ["."],
    cwd: PROJECT_ROOT,
    env: getLaunchEnv(qrUrl, userDataDir, overrides)
  });

  return { app, userDataDir };
};

export const closeLaunchedApp = async (launchedApp: LaunchedApp): Promise<void> => {
  await launchedApp.app.close();
  fs.rmSync(launchedApp.userDataDir, { force: true, recursive: true });
};

export const findPage = async (
  electronApp: ElectronApplication,
  predicate: (page: Page) => boolean
): Promise<Page> => {
  const existingPage = electronApp.context().pages().find(predicate);

  if (existingPage !== undefined) {
    return existingPage;
  }

  return electronApp.waitForEvent("window", { predicate });
};

export const getShellCounts = async (electronApp: ElectronApplication): Promise<ShellCounts> =>
  electronApp.evaluate(({ BaseWindow, webContents }) => ({
    baseWindowCount: BaseWindow.getAllWindows().length,
    webContentsCount: webContents.getAllWebContents().length
  }));

export const getQrVisible = async (controlPage: Page): Promise<boolean> => {
  const shellInfo = await controlPage.evaluate(() => window.qrGuard.getShellInfo());

  return shellInfo.qrVisible;
};

export const getAuditLogPath = (userDataDir: string): string =>
  path.join(userDataDir, "audit-log.jsonl");

export const completeFirstRunSetup = async (
  page: Page,
  qrUrl: string,
  options: FirstRunSetupOptions = {}
): Promise<void> => {
  await page.getByTestId("setup-qr-url").fill(qrUrl);
  await page.getByTestId("setup-admin-code").fill("1234");
  await page.getByTestId("setup-user-id").fill("staff01");
  await page.getByTestId("setup-user-code").fill("2468");
  await page.getByTestId("setup-unlock-duration").fill(options.unlockDurationSeconds ?? "10");
  await page.getByTestId("setup-idle-timeout").fill(options.idleAutoLockSeconds ?? "30");
  await page.getByTestId("setup-login-pattern").fill(options.loginUrlPattern ?? "");
  await page.getByTestId("setup-logged-in-pattern").fill(options.loggedInUrlPattern ?? "");
  await page.getByTestId("setup-title-contains").fill(options.titleContains ?? "");
  await page.getByTestId("setup-submit").click();
};

const getLaunchEnv = (
  qrUrl: string,
  userDataDir: string,
  overrides: LaunchOverrides
): Record<string, string> => {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
  env["QR_GUARD_ALLOW_INSECURE_TEST_STORAGE"] = "1";
  env["QR_GUARD_QR_URL"] = qrUrl;
  env["QR_GUARD_TEST_UNLOCK_DURATION_SECONDS"] = overrides.unlockDurationSeconds ?? "1";
  env["QR_GUARD_USER_DATA_DIR"] = userDataDir;
  setOptionalEnv(env, "QR_GUARD_TEST_IDLE_POLL_MS", overrides.idlePollMs);
  setOptionalEnv(env, "QR_GUARD_TEST_LOGIN_MODE_TIMEOUT_MS", overrides.loginModeTimeoutMs);
  env["QR_GUARD_TEST_SYSTEM_IDLE_SECONDS"] = overrides.systemIdleSeconds ?? "1";

  return env;
};

const createUserDataDir = (): string => {
  const parentDir = path.join(PROJECT_ROOT, ".tmp");

  fs.mkdirSync(parentDir, { recursive: true });

  return fs.mkdtempSync(path.join(parentDir, "e2e-user-data-"));
};

const setOptionalEnv = (
  env: Record<string, string>,
  key: string,
  value: string | undefined
): void => {
  if (value !== undefined) {
    env[key] = value;
  }
};
