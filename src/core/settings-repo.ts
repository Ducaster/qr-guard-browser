import type { AuthHash } from "./auth";

export const CURRENT_SETTINGS_SCHEMA_VERSION = 4;
export const MAX_UNLOCK_DURATION_SECONDS = 3_600;
export const MAX_IDLE_AUTO_LOCK_SECONDS = 86_400;

const MIN_DURATION_SECONDS = 1;

export interface UserSettings extends AuthHash {
  readonly lastAuthenticatedAt: string | null;
  readonly userId: string;
}

export interface Settings {
  readonly admin: AuthHash;
  readonly idleAutoLockSeconds: number;
  readonly qrTitlePattern: string;
  readonly qrUrl: string;
  readonly schemaVersion: typeof CURRENT_SETTINGS_SCHEMA_VERSION;
  readonly unlockDurationSeconds: number;
  readonly users: readonly UserSettings[];
}

export interface SettingsV1 {
  readonly admin?: AuthHash;
  readonly qrUrl?: string;
  readonly schemaVersion: 1;
  readonly unlockDurationSeconds?: number;
  readonly users?: readonly UserSettings[];
}

export interface SettingsV2 {
  readonly admin?: AuthHash;
  readonly idleAutoLockSeconds?: number;
  readonly qrTitlePattern?: string | undefined;
  readonly qrUrl?: string;
  readonly schemaVersion: 2;
  readonly unlockDurationSeconds?: number;
  readonly users?: readonly UserSettings[];
}

export interface SettingsV3 {
  readonly admin?: AuthHash;
  readonly idleAutoLockSeconds?: number;
  readonly qrTitlePattern?: string | undefined;
  readonly qrUrl?: string;
  readonly schemaVersion: 3;
  readonly unlockDurationSeconds?: number;
  readonly users?: readonly UserSettings[];
}

export interface SettingsStore {
  read(): string | null;
  write(data: string): void;
}

export interface Sealer {
  seal(plaintext: string): string;
  unseal(ciphertext: string): string;
}

export interface SettingsRepository {
  load(): Settings;
  save(settings: Settings): void;
}

export class SettingsParseError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "SettingsParseError";
  }
}

const emptyAuthHash = (): AuthHash => ({
  hash: "",
  salt: ""
});

export const createDefaultSettings = (): Settings => ({
  admin: emptyAuthHash(),
  idleAutoLockSeconds: 30,
  qrTitlePattern: "",
  qrUrl: "",
  schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
  unlockDurationSeconds: 10,
  users: []
});

export const createSettingsRepository = (
  store: SettingsStore,
  sealer: Sealer
): SettingsRepository => ({
  load: () => {
    const sealed = store.read();

    if (sealed === null) {
      return createDefaultSettings();
    }

    return parseSettingsJson(sealer.unseal(sealed));
  },
  save: (settings: Settings) => {
    store.write(sealer.seal(JSON.stringify(settings)));
  }
});

export const parseSettingsJson = (json: string): Settings => {
  try {
    return migrateSettings(JSON.parse(json));
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      throw new SettingsParseError("Settings JSON is not valid", error);
    }

    throw error;
  }
};

export const migrateSettings = (rawSettings: unknown): Settings => {
  if (!isRecord(rawSettings)) {
    return createDefaultSettings();
  }

  if (rawSettings["schemaVersion"] === 1) {
    return migrateV1ToCurrent(rawSettings);
  }

  if (rawSettings["schemaVersion"] === 2) {
    return migrateV2ToCurrent(rawSettings);
  }

  if (rawSettings["schemaVersion"] === 3) {
    return migrateV3ToCurrent(rawSettings);
  }

  return parseCurrentSettings(rawSettings);
};

export const migrateV1ToCurrent = (legacySettings: unknown): Settings => {
  const defaults = createDefaultSettings();

  if (!isRecord(legacySettings)) {
    return defaults;
  }

  return {
    ...defaults,
    admin: readAuthHash(legacySettings["admin"], defaults.admin),
    qrUrl: readString(legacySettings, "qrUrl", defaults.qrUrl),
    unlockDurationSeconds: readPositiveNumber(
      legacySettings,
      "unlockDurationSeconds",
      defaults.unlockDurationSeconds,
      MAX_UNLOCK_DURATION_SECONDS
    ),
    users: readUsers(legacySettings["users"], defaults.users)
  };
};

export const migrateV2ToCurrent = (legacySettings: unknown): Settings => {
  const defaults = createDefaultSettings();

  if (!isRecord(legacySettings)) {
    return defaults;
  }

  return {
    ...parseCurrentSettings(legacySettings),
    qrTitlePattern: readString(legacySettings, "qrTitlePattern", defaults.qrTitlePattern)
  };
};

export const migrateV3ToCurrent = (legacySettings: unknown): Settings => {
  if (!isRecord(legacySettings)) {
    return createDefaultSettings();
  }

  return parseCurrentSettings(legacySettings);
};

const parseCurrentSettings = (rawSettings: Readonly<Record<string, unknown>>): Settings => {
  const defaults = createDefaultSettings();

  return {
    admin: readAuthHash(rawSettings["admin"], defaults.admin),
    idleAutoLockSeconds: readPositiveNumber(
      rawSettings,
      "idleAutoLockSeconds",
      defaults.idleAutoLockSeconds,
      MAX_IDLE_AUTO_LOCK_SECONDS
    ),
    qrTitlePattern: readString(rawSettings, "qrTitlePattern", defaults.qrTitlePattern),
    qrUrl: readString(rawSettings, "qrUrl", defaults.qrUrl),
    schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
    unlockDurationSeconds: readPositiveNumber(
      rawSettings,
      "unlockDurationSeconds",
      defaults.unlockDurationSeconds,
      MAX_UNLOCK_DURATION_SECONDS
    ),
    users: readUsers(rawSettings["users"], defaults.users)
  };
};

const readAuthHash = (value: unknown, fallback: AuthHash): AuthHash => {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    hash: readString(value, "hash", fallback.hash),
    salt: readString(value, "salt", fallback.salt)
  };
};

const readUsers = (value: unknown, fallback: readonly UserSettings[]): readonly UserSettings[] => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.flatMap((item) => {
    const user = readUser(item);

    return user === null ? [] : [user];
  });
};

const readUser = (value: unknown): UserSettings | null => {
  if (!isRecord(value)) {
    return null;
  }

  const authFallback = emptyAuthHash();
  const userId = readString(value, "userId", "");

  if (userId.length === 0) {
    return null;
  }

  return {
    ...readAuthHash(value, authFallback),
    lastAuthenticatedAt: readNullableString(value, "lastAuthenticatedAt"),
    userId
  };
};

const readString = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback: string
): string => {
  const value = record[key];

  return typeof value === "string" ? value : fallback;
};

const readNullableString = (
  record: Readonly<Record<string, unknown>>,
  key: string
): string | null => {
  const value = record[key];

  return typeof value === "string" ? value : null;
};

const readPositiveNumber = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
  maxValue: number
): number => {
  const value = record[key];

  if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_DURATION_SECONDS) {
    return fallback;
  }

  return Math.min(value, maxValue);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
