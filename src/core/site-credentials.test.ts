import { describe, expect, it } from "vitest";

import type { Sealer, SettingsStore } from "./settings-repo";
import {
  createSiteCredentialRepository,
  credentialIdFor,
  getOriginFromUrl
} from "./site-credentials";

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

describe("site credential repository", () => {
  it("saves, lists, autofills, and deletes credentials by origin and username", () => {
    // Given
    const store = new MemorySettingsStore();
    const repository = createSiteCredentialRepository(store, new Base64TestSealer());
    const origin = "https://qr.example.test:8443";
    const username = "operator01";
    const password = "site-password-123";
    const savedAt = "2026-06-23T00:00:00.000Z";

    // When
    repository.saveCredential({ origin, password, username }, savedAt);
    const listed = repository.listCredentials();
    const autofill = repository.getAutofillCredential(origin);
    repository.deleteCredential(credentialIdFor(origin, username));

    // Then
    expect(listed).toEqual([
      {
        id: credentialIdFor(origin, username),
        origin,
        updatedAt: savedAt,
        username
      }
    ]);
    expect(autofill).toEqual({ password, username });
    expect(repository.listCredentials()).toEqual([]);
    expect(repository.getAutofillCredential(origin)).toBeNull();
  });

  it("does not store the site password as plaintext in sealed bytes", () => {
    // Given
    const store = new MemorySettingsStore();
    const repository = createSiteCredentialRepository(store, new Base64TestSealer());
    const password = "plaintext-must-not-appear";

    // When
    repository.saveCredential(
      {
        origin: "https://qr.example.test",
        password,
        username: "operator01"
      },
      "2026-06-23T00:00:00.000Z"
    );

    // Then
    expect(store.read()).not.toContain(password);
  });

  it("keys credentials by exact origin instead of full URL path", () => {
    // Given / When
    const httpsOrigin = getOriginFromUrl("https://qr.example.test:8443/login?next=/qr");
    const httpOrigin = getOriginFromUrl("http://127.0.0.1:37655/login");
    const blockedOrigin = getOriginFromUrl("file:///tmp/login.html");

    // Then
    expect(httpsOrigin).toBe("https://qr.example.test:8443");
    expect(httpOrigin).toBe("http://127.0.0.1:37655");
    expect(blockedOrigin).toBeNull();
  });

  it("records never-save origin choices without deleting existing saved entries", () => {
    // Given
    const store = new MemorySettingsStore();
    const repository = createSiteCredentialRepository(store, new Base64TestSealer());
    const origin = "https://qr.example.test";
    repository.saveCredential(
      {
        origin,
        password: "already-saved",
        username: "operator01"
      },
      "2026-06-23T00:00:00.000Z"
    );

    // When
    repository.blockSavePromptsForOrigin(origin);

    // Then
    expect(repository.shouldOfferToSave(origin)).toBe(false);
    expect(repository.getAutofillCredential(origin)).toEqual({
      password: "already-saved",
      username: "operator01"
    });
  });
});
