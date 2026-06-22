import {
  ADMIN_CODE_MIN_LENGTH,
  USER_CODE_MIN_LENGTH
} from "../../core/settings-validation-types";

export const parseSeconds = (value: string): number | null => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.trunc(parsed);
};

export const isValidHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value.trim());

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return false;
    }

    throw error;
  }
};

export const validateAdminCode = (value: string): readonly string[] =>
  value.trim().length < ADMIN_CODE_MIN_LENGTH
    ? [`Admin code must be at least ${String(ADMIN_CODE_MIN_LENGTH)} characters.`]
    : [];

export const validateUserCode = (value: string): readonly string[] =>
  value.trim().length < USER_CODE_MIN_LENGTH
    ? [`User code must be at least ${String(USER_CODE_MIN_LENGTH)} characters.`]
    : [];

export const hasDuplicateValues = (values: readonly string[]): boolean => {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      return true;
    }

    seen.add(value);
  }

  return false;
};
