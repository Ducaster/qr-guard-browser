import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { hashCode } from "../core/auth";
import { createDefaultSettings, type Sealer, type Settings } from "../core/settings-repo";
import {
  createRecoverableFileSettingsRepository,
  settingsBackupPathFor,
  settingsCorruptPathFor
} from "./settings-file-recovery";

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

const testRoot = path.resolve(".tmp", "settings-file-recovery-test");

afterEach(() => {
  fs.rmSync(testRoot, { force: true, recursive: true });
});

describe("recoverable settings file repository", () => {
  it("restores settings from backup when the primary file is corrupted", () => {
    // Given
    const filePath = createSettingsPath("primary-corrupt");
    const sealer = new Base64TestSealer();
    const settings = createConfiguredSettings("https://qr.example.test/login");
    const sealedBackup = sealer.seal(JSON.stringify(settings));
    fs.writeFileSync(filePath, "truncated-primary", "utf8");
    fs.writeFileSync(settingsBackupPathFor(filePath), sealedBackup, "utf8");
    const repository = createRecoverableFileSettingsRepository(filePath, sealer);

    // When
    const loaded = repository.load();

    // Then
    expect(loaded).toEqual(settings);
    expect(fs.readFileSync(filePath, "utf8")).toBe(sealedBackup);
    expect(fs.readFileSync(settingsCorruptPathFor(filePath), "utf8")).toBe("truncated-primary");
  });

  it("falls back to first-run defaults without throwing when primary and backup are corrupted", () => {
    // Given
    const filePath = createSettingsPath("both-corrupt");
    const repository = createRecoverableFileSettingsRepository(filePath, new Base64TestSealer());
    fs.writeFileSync(filePath, "truncated-primary", "utf8");
    fs.writeFileSync(settingsBackupPathFor(filePath), "truncated-backup", "utf8");

    // When / Then
    expect(() => repository.load()).not.toThrow();
    expect(repository.load()).toEqual(createDefaultSettings());
    expect(fs.readFileSync(settingsCorruptPathFor(filePath), "utf8")).toBe("truncated-primary");
  });

  it("atomically saves the primary settings file and keeps the backup updated", () => {
    // Given
    const filePath = createSettingsPath("normal-save");
    const sealer = new Base64TestSealer();
    const repository = createRecoverableFileSettingsRepository(filePath, sealer);
    const initialSettings = createConfiguredSettings("https://qr.example.test/login");
    const updatedSettings = createConfiguredSettings("https://qr.example.test/qr");

    // When
    repository.save(initialSettings);
    const firstPrimary = fs.readFileSync(filePath, "utf8");
    const firstBackup = fs.readFileSync(settingsBackupPathFor(filePath), "utf8");
    repository.save(updatedSettings);
    const secondPrimary = fs.readFileSync(filePath, "utf8");
    const secondBackup = fs.readFileSync(settingsBackupPathFor(filePath), "utf8");

    // Then
    expect(firstPrimary).toBe(sealer.seal(JSON.stringify(initialSettings)));
    expect(firstBackup).toBe(firstPrimary);
    expect(secondPrimary).toBe(sealer.seal(JSON.stringify(updatedSettings)));
    expect(secondBackup).toBe(secondPrimary);
  });
});

const createSettingsPath = (name: string): string => {
  const dirPath = path.join(testRoot, name);

  fs.mkdirSync(dirPath, { recursive: true });

  return path.join(dirPath, "settings.json");
};

const createConfiguredSettings = (qrUrl: string): Settings => ({
  ...createDefaultSettings(),
  admin: hashCode("admin-code"),
  qrTitlePattern: "QR 코드",
  qrUrl,
  users: [
    {
      ...hashCode("user-code"),
      lastAuthenticatedAt: null,
      userId: "staff01"
    }
  ]
});
