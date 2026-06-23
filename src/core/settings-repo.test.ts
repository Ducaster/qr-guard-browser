import { describe, expect, it } from "vitest";

import { hashCode } from "./auth";
import {
  createDefaultSettings,
  createSettingsRepository,
  MAX_IDLE_AUTO_LOCK_SECONDS,
  MAX_UNLOCK_DURATION_SECONDS,
  migrateSettings,
  type Sealer,
  type SettingsStore,
  type SettingsV1,
  type SettingsV2
} from "./settings-repo";

class MemorySettingsStore implements SettingsStore {
  constructor(private data: string | null = null) {}

  read(): string | null {
    return this.data;
  }

  write(data: string): void {
    this.data = data;
  }
}

class Base64TestSealer implements Sealer {
  seal(plaintext: string): string {
    return `sealed:${Buffer.from(plaintext, "utf8").toString("base64")}`;
  }

  unseal(ciphertext: string): string {
    const prefix = "sealed:";

    if (!ciphertext.startsWith(prefix)) {
      throw new Error("Unexpected test ciphertext");
    }

    return Buffer.from(ciphertext.slice(prefix.length), "base64").toString("utf8");
  }
}

describe("settings repository", () => {
  it("returns sensible defaults on first run", () => {
    // Given
    const store = new MemorySettingsStore();
    const sealer = new Base64TestSealer();
    const repository = createSettingsRepository(store, sealer);

    // When
    const settings = repository.load();

    // Then
    expect(settings).toEqual(createDefaultSettings());
    expect(settings.unlockDurationSeconds).toBe(10);
    expect(settings.idleAutoLockSeconds).toBe(30);
    expect(settings.users).toEqual([]);
    expect(settings.loginDetection).toEqual({
      loggedInUrlPattern: "",
      loginUrlPattern: "",
      titleContains: ""
    });
    expect(settings.qrTitlePattern).toBe("");
  });

  it("round-trips sealed settings without storing plaintext auth codes", () => {
    // Given
    const store = new MemorySettingsStore();
    const sealer = new Base64TestSealer();
    const repository = createSettingsRepository(store, sealer);
    const adminCode = "never-store-admin-code";
    const userCode = "never-store-user-code";
    const adminRecord = hashCode(adminCode);
    const userRecord = hashCode(userCode);
    const settings = {
      ...createDefaultSettings(),
      admin: adminRecord,
      qrUrl: "https://qr.example.test/login",
      users: [
        {
          ...userRecord,
          lastAuthenticatedAt: "2026-06-22T12:00:00.000Z",
          userId: "staff01"
        }
      ]
    };

    // When
    repository.save(settings);
    const rawStoredBytes = store.read();
    const unsealedJson = rawStoredBytes === null ? "" : sealer.unseal(rawStoredBytes);
    const loaded = repository.load();

    // Then
    expect(loaded).toEqual(settings);
    expect(rawStoredBytes).not.toContain(adminCode);
    expect(rawStoredBytes).not.toContain(userCode);
    expect(unsealedJson).not.toContain(adminCode);
    expect(unsealedJson).not.toContain(userCode);
  });

  it("migrates v1 settings to the current schema with defaults filled", () => {
    // Given
    const adminRecord = hashCode("legacy-admin-code");
    const userRecord = hashCode("legacy-user-code");
    const legacySettings: SettingsV1 = {
      admin: adminRecord,
      qrUrl: "https://legacy.example.test/qr",
      schemaVersion: 1,
      unlockDurationSeconds: 12,
      users: [
        {
          ...userRecord,
          lastAuthenticatedAt: null,
          userId: "staff01"
        }
      ]
    };

    // When
    const migrated = migrateSettings(legacySettings);

    // Then
    expect(migrated).toEqual({
      ...createDefaultSettings(),
      admin: adminRecord,
      qrUrl: "https://legacy.example.test/qr",
      unlockDurationSeconds: 12,
      users: legacySettings.users
    });
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.idleAutoLockSeconds).toBe(30);
    expect(migrated.qrTitlePattern).toBe("");
    expect(migrated.loginDetection).toEqual({
      loggedInUrlPattern: "",
      loginUrlPattern: "",
      titleContains: ""
    });
  });

  it("migrates v2 settings with an existing QR title pattern without field loss", () => {
    // Given
    const adminRecord = hashCode("v2-admin-code");
    const userRecord = hashCode("v2-user-code");
    const settingsV2: SettingsV2 = {
      admin: adminRecord,
      idleAutoLockSeconds: 45,
      loginDetection: {
        loggedInUrlPattern: "/qr",
        loginUrlPattern: "/login",
        titleContains: "로그인"
      },
      qrTitlePattern: "QR 코드",
      qrUrl: "https://v2.example.test/qr",
      schemaVersion: 2,
      unlockDurationSeconds: 120,
      users: [
        {
          ...userRecord,
          lastAuthenticatedAt: "2026-06-22T12:00:00.000Z",
          userId: "staff01"
        }
      ]
    };

    // When
    const migrated = migrateSettings(settingsV2);

    // Then
    expect(migrated).toEqual({
      ...settingsV2,
      schemaVersion: 3
    });
  });

  it("migrates v2 settings without a QR title pattern by adding an empty default", () => {
    // Given
    const adminRecord = hashCode("v2-admin-code");
    const userRecord = hashCode("v2-user-code");
    const settingsV2: SettingsV2 = {
      admin: adminRecord,
      idleAutoLockSeconds: 45,
      loginDetection: {
        loggedInUrlPattern: "/qr",
        loginUrlPattern: "/login",
        titleContains: "로그인"
      },
      qrUrl: "https://v2.example.test/qr",
      schemaVersion: 2,
      unlockDurationSeconds: 120,
      users: [
        {
          ...userRecord,
          lastAuthenticatedAt: "2026-06-22T12:00:00.000Z",
          userId: "staff01"
        }
      ]
    };

    // When
    const migrated = migrateSettings(settingsV2);

    // Then
    expect(migrated).toEqual({
      ...settingsV2,
      qrTitlePattern: "",
      schemaVersion: 3
    });
    expect(migrated.qrTitlePattern).toBe("");
  });

  it("clamps out-of-range stored duration values on load", () => {
    // Given
    const sealer = new Base64TestSealer();
    const storedSettings = {
      ...createDefaultSettings(),
      idleAutoLockSeconds: 999_999_999,
      unlockDurationSeconds: 999_999_999
    };
    const store = new MemorySettingsStore(sealer.seal(JSON.stringify(storedSettings)));
    const repository = createSettingsRepository(store, sealer);

    // When
    const loaded = repository.load();

    // Then
    expect(loaded.unlockDurationSeconds).toBe(MAX_UNLOCK_DURATION_SECONDS);
    expect(loaded.idleAutoLockSeconds).toBe(MAX_IDLE_AUTO_LOCK_SECONDS);
  });

  it("skips user records without a non-empty user ID", () => {
    // Given
    const validUserRecord = hashCode("valid-user-code");
    const emptyUserRecord = hashCode("empty-user-code");
    const missingUserRecord = hashCode("missing-user-code");
    const rawSettings = {
      ...createDefaultSettings(),
      users: [
        {
          ...validUserRecord,
          lastAuthenticatedAt: null,
          userId: "staff01"
        },
        {
          ...emptyUserRecord,
          lastAuthenticatedAt: null,
          userId: ""
        },
        {
          ...missingUserRecord,
          lastAuthenticatedAt: null
        }
      ]
    };

    // When
    const parsed = migrateSettings(rawSettings);

    // Then
    expect(parsed.users).toEqual([
      {
        ...validUserRecord,
        lastAuthenticatedAt: null,
        userId: "staff01"
      }
    ]);
  });
});
