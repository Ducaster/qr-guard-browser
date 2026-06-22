import { describe, expect, it } from "vitest";

import { classify, matchesLoginUrl } from "./login-detector";
import type { LoginDetectionSettings } from "./settings-repo";

const rules = {
  loggedInUrlPattern: "/qr",
  loginUrlPattern: "/login",
  titleContains: "sign in"
} satisfies LoginDetectionSettings;

describe("login detector", () => {
  it.each([
    {
      expected: "login",
      title: "Fixture",
      url: "https://example.test/login"
    },
    {
      expected: "login",
      title: "Please SIGN IN",
      url: "https://example.test/landing"
    },
    {
      expected: "loggedIn",
      title: "QR",
      url: "https://example.test/qr"
    },
    {
      expected: "unknown",
      title: "Dashboard",
      url: "https://example.test/dashboard"
    }
  ] satisfies readonly {
    readonly expected: ReturnType<typeof classify>;
    readonly title: string;
    readonly url: string;
  }[])("classifies $url as $expected", ({ expected, title, url }) => {
    // Given / When
    const result = classify(url, title, rules);

    // Then
    expect(result).toBe(expected);
  });

  it("treats pathological regex-looking patterns as literal text", () => {
    // Given
    const pathologicalRules = {
      loggedInUrlPattern: "",
      loginUrlPattern: "^(a+)+$",
      titleContains: "(a|aa)+"
    } satisfies LoginDetectionSettings;
    const longUrl = `https://example.test/${"a".repeat(10_000)}!`;

    // When
    const result = classify(longUrl, "aaaaaaaaaaaaaaaa!", pathologicalRules);

    // Then
    expect(result).toBe("unknown");
  });

  it("matches login URL patterns without evaluating regular expressions", () => {
    // Given / When
    const matched = matchesLoginUrl("https://example.test/Login?next=/qr", rules);

    // Then
    expect(matched).toBe(true);
  });
});
