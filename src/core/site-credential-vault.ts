import { getOriginFromUrl } from "./site-credential-origin";
import type { SiteCredentialInput } from "./site-credentials";

export const CURRENT_SITE_CREDENTIALS_SCHEMA_VERSION = 1;

export interface SiteCredentialRecord extends SiteCredentialInput {
  readonly updatedAt: string;
}

export interface SiteCredentialVault {
  readonly blockedOrigins: readonly string[];
  readonly entries: readonly SiteCredentialRecord[];
  readonly schemaVersion: typeof CURRENT_SITE_CREDENTIALS_SCHEMA_VERSION;
}

export class SiteCredentialParseError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "SiteCredentialParseError";
  }
}

export const createEmptyVault = (): SiteCredentialVault => ({
  blockedOrigins: [],
  entries: [],
  schemaVersion: CURRENT_SITE_CREDENTIALS_SCHEMA_VERSION
});

export const parseSiteCredentialVault = (json: string): SiteCredentialVault => {
  try {
    return readVault(JSON.parse(json));
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      throw new SiteCredentialParseError("Site credential JSON is not valid", error);
    }

    throw error;
  }
};

const readVault = (value: unknown): SiteCredentialVault => {
  if (!isRecord(value)) {
    return createEmptyVault();
  }

  return {
    blockedOrigins: readOriginArray(value["blockedOrigins"]),
    entries: readEntries(value["entries"]),
    schemaVersion: CURRENT_SITE_CREDENTIALS_SCHEMA_VERSION
  };
};

const readEntries = (value: unknown): readonly SiteCredentialRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const entry = readEntry(item);

    return entry === null ? [] : [entry];
  });
};

const readEntry = (value: unknown): SiteCredentialRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  const origin = readString(value, "origin");
  const username = readString(value, "username");
  const password = readString(value, "password");
  const updatedAt = readString(value, "updatedAt");

  if (
    origin === null ||
    username === null ||
    password === null ||
    updatedAt === null ||
    username.trim().length === 0 ||
    password.length === 0
  ) {
    return null;
  }

  const normalizedOrigin = getOriginFromUrl(origin);

  return normalizedOrigin === null
    ? null
    : {
        origin: normalizedOrigin,
        password,
        updatedAt,
        username
      };
};

const readOriginArray = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }

    const origin = getOriginFromUrl(item);

    return origin === null ? [] : [origin];
  });
};

const readString = (
  record: Readonly<Record<string, unknown>>,
  key: string
): string | null => {
  const value = record[key];

  return typeof value === "string" ? value : null;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
