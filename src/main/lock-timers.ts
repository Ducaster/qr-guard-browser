export interface LockTimers {
  readonly clearIdleTimer: () => void;
  readonly clearSiteLoginTimer: () => void;
  readonly clearUnlockTimer: () => void;
  readonly startIdleTimer: (intervalMs: number, onTick: () => void) => void;
  readonly startSiteLoginTimer: (timeoutMs: number, onExpired: () => void) => void;
  readonly startUnlockTimer: (durationSeconds: number, onExpired: () => void) => void;
}

export const createLockTimers = (): LockTimers => {
  let unlockTimer: ReturnType<typeof setTimeout> | null = null;
  let siteLoginTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setInterval> | null = null;

  const clearUnlockTimer = (): void => {
    if (unlockTimer !== null) {
      clearTimeout(unlockTimer);
      unlockTimer = null;
    }
  };
  const clearSiteLoginTimer = (): void => {
    if (siteLoginTimer !== null) {
      clearTimeout(siteLoginTimer);
      siteLoginTimer = null;
    }
  };
  const clearIdleTimer = (): void => {
    if (idleTimer !== null) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
  };

  return {
    clearIdleTimer,
    clearSiteLoginTimer,
    clearUnlockTimer,
    startIdleTimer: (intervalMs: number, onTick: () => void): void => {
      clearIdleTimer();
      idleTimer = setInterval(onTick, intervalMs);
    },
    startSiteLoginTimer: (timeoutMs: number, onExpired: () => void): void => {
      clearSiteLoginTimer();
      siteLoginTimer = setTimeout(onExpired, timeoutMs);
    },
    startUnlockTimer: (durationSeconds: number, onExpired: () => void): void => {
      clearUnlockTimer();
      unlockTimer = setTimeout(onExpired, durationSeconds * 1_000);
    }
  };
};
