export type GuardState = "needsSetup" | "locked" | "unlocked" | "loginMode" | "settings";

export type VisibilityState = GuardState | "unknown";

export interface StateSnapshot {
  readonly activeUserId: string | null;
  readonly now: string;
  readonly qrVisible: boolean;
  readonly remainingMs: number | null;
  readonly state: GuardState;
  readonly unlockExpiresAt: string | null;
}

export type UnlockResponse =
  | { readonly ok: true; readonly state: StateSnapshot }
  | {
      readonly errors: readonly string[];
      readonly ok: false;
      readonly retryAfterMs: number | null;
    };

export const shouldShowQrView = (
  state: VisibilityState,
  currentUrlMatchesLoginPattern: boolean
): boolean => {
  switch (state) {
    case "unlocked":
      return true;
    case "loginMode":
      return currentUrlMatchesLoginPattern;
    case "locked":
    case "needsSetup":
    case "settings":
    case "unknown":
      return false;
  }
};

export const completeSetup = (state: GuardState): GuardState => {
  switch (state) {
    case "needsSetup":
      return "locked";
    case "locked":
    case "unlocked":
    case "loginMode":
    case "settings":
      return state;
  }
};

export const unlockSucceeded = (state: GuardState): GuardState => {
  switch (state) {
    case "locked":
      return "unlocked";
    case "needsSetup":
    case "unlocked":
    case "loginMode":
    case "settings":
      return state;
  }
};

export const timerExpired = (state: GuardState): GuardState => {
  switch (state) {
    case "unlocked":
      return "locked";
    case "needsSetup":
    case "locked":
    case "loginMode":
    case "settings":
      return state;
  }
};

export const manualLock = (state: GuardState): GuardState => {
  switch (state) {
    case "unlocked":
    case "loginMode":
      return "locked";
    case "needsSetup":
    case "locked":
    case "settings":
      return state;
  }
};

export const openSettings = (state: GuardState): GuardState => {
  switch (state) {
    case "locked":
      return "settings";
    case "needsSetup":
    case "unlocked":
    case "loginMode":
    case "settings":
      return state;
  }
};

export const closeSettings = (state: GuardState): GuardState => {
  switch (state) {
    case "settings":
      return "locked";
    case "needsSetup":
    case "locked":
    case "unlocked":
    case "loginMode":
      return state;
  }
};

export const enterLoginMode = (state: GuardState): GuardState => {
  switch (state) {
    case "locked":
    case "unlocked":
      return "loginMode";
    case "needsSetup":
    case "loginMode":
    case "settings":
      return state;
  }
};

export const exitLoginMode = (state: GuardState): GuardState => {
  switch (state) {
    case "loginMode":
      return "locked";
    case "needsSetup":
    case "locked":
    case "unlocked":
    case "settings":
      return state;
  }
};
