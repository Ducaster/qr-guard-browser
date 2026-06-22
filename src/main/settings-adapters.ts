import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

import type { Sealer, SettingsStore } from "../core/settings-repo";

const SETTINGS_FILE_NAME = "settings.json";

export const createElectronSettingsStore = (): SettingsStore =>
  createFileSettingsStore(path.join(app.getPath("userData"), SETTINGS_FILE_NAME));

export const createFileSettingsStore = (filePath: string): SettingsStore => ({
  read: () => {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch (error: unknown) {
      if (hasErrorCode(error, "ENOENT")) {
        return null;
      }

      throw error;
    }
  },
  write: (data: string) => {
    fs.mkdirSync(path.dirname(filePath), { mode: 0o700, recursive: true });
    fs.writeFileSync(filePath, data, { encoding: "utf8", mode: 0o600 });
  }
});

export const createElectronSafeStorageSealer = (): Sealer => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new SafeStorageUnavailableError();
  }

  return {
    seal: (plaintext: string) => safeStorage.encryptString(plaintext).toString("base64"),
    unseal: (ciphertext: string) =>
      safeStorage.decryptString(Buffer.from(ciphertext, "base64"))
  };
};

export class SafeStorageUnavailableError extends Error {
  constructor() {
    super("Electron safeStorage encryption is not available");
    this.name = "SafeStorageUnavailableError";
  }
}

const hasErrorCode = (error: unknown, expectedCode: string): boolean => {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return error.code === expectedCode;
};
