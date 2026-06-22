import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

import {
  createLockoutState,
  parseLockoutStateJson,
  serializeLockoutState,
  type LockoutState
} from "../core/auth";
import {
  parseAuditLog,
  serializeAuditEvent,
  type AuditEvent,
  type AuditLogFilter,
  type AuditLogReadResult
} from "../core/audit-log";
import type { Sealer, SettingsStore } from "../core/settings-repo";
import { mainLogger } from "./logger";

const SETTINGS_FILE_NAME = "settings.json";
const LOCKOUT_FILE_NAME = "lockout-state.json";
const AUDIT_LOG_FILE_NAME = "audit-log.jsonl";

export interface LockoutStateStore {
  readonly load: () => LockoutState;
  readonly save: (state: LockoutState) => void;
}

export interface AuditLogStore {
  readonly append: (event: AuditEvent) => void;
  readonly read: (filter?: AuditLogFilter) => AuditLogReadResult;
}

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
    writeAtomicTextFile(filePath, data);
  }
});

export const createElectronLockoutStateStore = (): LockoutStateStore =>
  createFileLockoutStateStore(path.join(app.getPath("userData"), LOCKOUT_FILE_NAME));

export const createFileLockoutStateStore = (filePath: string): LockoutStateStore => ({
  load: () => {
    const data = readOptionalTextFile(filePath);

    return data === null ? createLockoutState() : parseLockoutStateFile(data, filePath);
  },
  save: (state: LockoutState) => {
    writeAtomicTextFile(filePath, serializeLockoutState(state));
  }
});

export const createElectronAuditLogStore = (): AuditLogStore =>
  createFileAuditLogStore(path.join(app.getPath("userData"), AUDIT_LOG_FILE_NAME));

export const createFileAuditLogStore = (filePath: string): AuditLogStore => ({
  append: (event: AuditEvent) => {
    fs.mkdirSync(path.dirname(filePath), { mode: 0o700, recursive: true });
    fs.appendFileSync(filePath, serializeAuditEvent(event), { encoding: "utf8", mode: 0o600 });
  },
  read: (filter?: AuditLogFilter) => {
    const data = readOptionalTextFile(filePath);

    return parseAuditLog(data ?? "", filter);
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

export const createInsecureTestSealer = (): Sealer => ({
  seal: (plaintext: string) => `test:${Buffer.from(plaintext, "utf8").toString("base64")}`,
  unseal: (ciphertext: string) => {
    const prefix = "test:";

    if (!ciphertext.startsWith(prefix)) {
      throw new Error("Unexpected test settings payload.");
    }

    return Buffer.from(ciphertext.slice(prefix.length), "base64").toString("utf8");
  }
});

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

const readOptionalTextFile = (filePath: string): string | null => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error: unknown) {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }

    throw error;
  }
};

const parseLockoutStateFile = (data: string, filePath: string): LockoutState => {
  try {
    JSON.parse(data);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      mainLogger.warn("Failed to parse lockout state file; resetting lockout state.", {
        error,
        filePath
      });

      return createLockoutState();
    }

    throw error;
  }

  return parseLockoutStateJson(data);
};

const writeAtomicTextFile = (filePath: string, data: string): void => {
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.${String(process.pid)}.${String(Date.now())}.tmp`
  );

  fs.mkdirSync(dirPath, { mode: 0o700, recursive: true });
  fs.writeFileSync(tempPath, data, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
};
