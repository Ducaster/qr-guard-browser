import { ADMIN_CODE_MIN_LENGTH } from "./settings-validation-types";

export const readHttpUrl = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  errors: string[]
): string => {
  const value = readTrimmedString(record, key);

  if (value.length === 0) {
    errors.push("QR 사이트 주소를 입력하세요.");
    return "";
  }

  try {
    const parsedUrl = new URL(value);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      errors.push("QR 사이트 주소는 http 또는 https URL이어야 합니다.");
      return "";
    }

    return value;
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      errors.push("QR 사이트 주소가 올바르지 않습니다.");
      return "";
    }

    throw error;
  }
};

export const readRequiredCode = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
  errors: string[],
  minLength = ADMIN_CODE_MIN_LENGTH
): string => {
  const value = readTrimmedString(record, key);

  if (value.length < minLength) {
    errors.push(`${label}는 최소 ${String(minLength)}자 이상이어야 합니다.`);
  }

  return value;
};

export const readRequiredString = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
  errors: string[]
): string => {
  const value = readTrimmedString(record, key);

  if (value.length === 0) {
    errors.push(`${label}을 입력하세요.`);
  }

  return value;
};

export const readDurationSeconds = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
  maxValue: number,
  label: string,
  errors: string[]
): number => {
  if (!Object.hasOwn(record, key)) {
    return fallback;
  }

  const value = record[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${label}은 숫자여야 합니다.`);
    return fallback;
  }

  if (value < 1) {
    errors.push(`${label}은 최소 1초 이상이어야 합니다.`);
    return fallback;
  }

  return Math.min(Math.trunc(value), maxValue);
};

export const readOptionalTrimmedString = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback: string
): string => {
  if (!Object.hasOwn(record, key)) {
    return fallback;
  }

  return readTrimmedString(record, key);
};

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readTrimmedString = (record: Readonly<Record<string, unknown>>, key: string): string => {
  const value = record[key];

  return typeof value === "string" ? value.trim() : "";
};
