import type { QrGuardApi } from "./index";

declare global {
  interface Window {
    readonly qrGuard: QrGuardApi;
  }
}

export {};
