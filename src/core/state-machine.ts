export type GuardState =
  | "needsSetup"
  | "locked"
  | "unlocked"
  | "siteLogin"
  | "settings";

export type VisibilityState = GuardState | "unknown";

export interface QrLoadFailure {
  readonly errorCode: number | null;
  readonly errorDescription: string;
  readonly url: string;
}

export interface StateSnapshot {
  readonly activeUserId: string | null;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly currentUrl: string;
  readonly now: string;
  readonly qrLoadFailure: QrLoadFailure | null;
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

export type ListUnlockRegionsResponse =
  | { readonly ok: true; readonly regions: readonly string[] }
  | { readonly errors: readonly string[]; readonly ok: false };

export const shouldShowQrView = (state: VisibilityState): boolean => {
  switch (state) {
    case "unlocked":
    case "siteLogin":
      return true;
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
    case "siteLogin":
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
    case "siteLogin":
    case "settings":
      return state;
  }
};

export const timerExpired = (state: GuardState): GuardState => {
  switch (state) {
    case "unlocked":
    case "siteLogin":
      return "locked";
    case "needsSetup":
    case "locked":
    case "settings":
      return state;
  }
};

export const manualLock = (state: GuardState): GuardState => {
  switch (state) {
    case "unlocked":
    case "siteLogin":
      return "locked";
    case "needsSetup":
    case "locked":
    case "settings":
      return state;
  }
};

export const relockState = (state: GuardState): GuardState => {
  switch (state) {
    case "locked":
    case "unlocked":
    case "siteLogin":
    case "settings":
      return "locked";
    case "needsSetup":
      return state;
  }
};

export const openSettings = (state: GuardState): GuardState => {
  switch (state) {
    case "locked":
      return "settings";
    case "needsSetup":
    case "unlocked":
    case "siteLogin":
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
    case "siteLogin":
      return state;
  }
};

export const enterSiteLogin = (state: GuardState): GuardState => {
  switch (state) {
    case "locked":
      return "siteLogin";
    case "needsSetup":
    case "unlocked":
    case "siteLogin":
    case "settings":
      return state;
  }
};
