import type { LoginDetectionSettings } from "./settings-repo";

export type LoginClassification = "login" | "loggedIn" | "unknown";

export const classify = (
  url: string,
  title: string,
  rules: LoginDetectionSettings
): LoginClassification => {
  if (matchesLoginUrl(url, rules) || containsSafeLiteral(title, rules.titleContains)) {
    return "login";
  }

  if (matchesSafeUrlPattern(url, rules.loggedInUrlPattern)) {
    return "loggedIn";
  }

  return "unknown";
};

export const matchesLoginUrl = (url: string, rules: LoginDetectionSettings): boolean =>
  matchesSafeUrlPattern(url, rules.loginUrlPattern);

const matchesSafeUrlPattern = (url: string, pattern: string): boolean => {
  const normalizedUrl = normalizeForMatch(url);
  const normalizedPattern = normalizeForMatch(pattern);

  if (normalizedPattern.length === 0) {
    return false;
  }

  if (normalizedPattern.endsWith("*")) {
    return normalizedUrl.startsWith(normalizedPattern.slice(0, -1));
  }

  return normalizedUrl.includes(normalizedPattern);
};

const containsSafeLiteral = (value: string, literal: string): boolean => {
  const normalizedLiteral = normalizeForMatch(literal);

  return normalizedLiteral.length > 0 && normalizeForMatch(value).includes(normalizedLiteral);
};

const normalizeForMatch = (value: string): string => value.trim().toLowerCase();
