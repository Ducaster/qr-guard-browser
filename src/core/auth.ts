import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SCRYPT_N = 2 ** 15;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 32;
export const SCRYPT_SALT_BYTES = 16;

const SCRYPT_MAXMEM_BYTES = 64 * 1024 * 1024;

export interface AuthHash {
  readonly salt: string;
  readonly hash: string;
}

export const hashCode = (code: string): AuthHash => {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const hash = deriveHash(code, salt);

  return {
    hash: hash.toString("base64"),
    salt: salt.toString("base64")
  };
};

export const verifyCode = (code: string, salt: string, hash: string): boolean => {
  const saltBytes = Buffer.from(salt, "base64");
  const expectedHash = Buffer.from(hash, "base64");

  if (saltBytes.byteLength !== SCRYPT_SALT_BYTES || expectedHash.byteLength !== SCRYPT_KEYLEN) {
    return false;
  }

  const actualHash = deriveHash(code, saltBytes);

  return timingSafeEqual(actualHash, expectedHash);
};

const deriveHash = (code: string, salt: Buffer): Buffer =>
  scryptSync(code, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    maxmem: SCRYPT_MAXMEM_BYTES,
    p: SCRYPT_P,
    r: SCRYPT_R
  });

export const LOCKOUT_FAILURE_THRESHOLD = 3;
export const LOCKOUT_BASE_DELAY_MS = 1_000;
export const LOCKOUT_BASE_WINDOW_MS = 30_000;
export const LOCKOUT_MAX_RETRY_MS = 5 * 60_000;

export interface LockoutDecision {
  readonly allowed: boolean;
  readonly retryAfterMs?: number;
}

export interface LockoutEntry {
  readonly consecutiveFailures: number;
  readonly lockedUntilMs: number | null;
}

export interface LockoutState {
  readonly entries: Readonly<Record<string, LockoutEntry>>;
}

export interface LockoutFailureResult {
  readonly decision: LockoutDecision;
  readonly state: LockoutState;
}

export const createLockoutState = (): LockoutState => ({
  entries: {}
});

export const checkLockout = (
  state: LockoutState,
  userId: string,
  now: number
): LockoutDecision => {
  const entry = state.entries[userId];

  const lockedUntilMs = entry?.lockedUntilMs ?? null;

  if (lockedUntilMs === null || lockedUntilMs <= now) {
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterMs: lockedUntilMs - now
  };
};

export const recordAuthSuccess = (state: LockoutState, userId: string): LockoutState => {
  const { [userId]: _clearedEntry, ...remainingEntries } = state.entries;

  return {
    entries: remainingEntries
  };
};

export const recordAuthFailure = (
  state: LockoutState,
  userId: string,
  now: number
): LockoutFailureResult => {
  const currentEntry = state.entries[userId];
  const consecutiveFailures = (currentEntry?.consecutiveFailures ?? 0) + 1;
  const retryAfterMs = retryAfterForFailures(consecutiveFailures);
  const lockedUntilMs =
    retryAfterMs === null ? null : now + retryAfterMs;
  const nextState = {
    entries: {
      ...state.entries,
      [userId]: {
        consecutiveFailures,
        lockedUntilMs
      }
    }
  };

  if (retryAfterMs === null) {
    return {
      decision: { allowed: true },
      state: nextState
    };
  }

  return {
    decision: {
      allowed: false,
      retryAfterMs
    },
    state: nextState
  };
};

const retryAfterForFailures = (consecutiveFailures: number): number | null => {
  if (consecutiveFailures < LOCKOUT_FAILURE_THRESHOLD) {
    return null;
  }

  const exponent = consecutiveFailures - LOCKOUT_FAILURE_THRESHOLD;
  const incrementalDelay = LOCKOUT_BASE_DELAY_MS * (2 ** exponent);

  return Math.min(LOCKOUT_BASE_WINDOW_MS + incrementalDelay, LOCKOUT_MAX_RETRY_MS);
};
