import type { SavedSiteCredential, SiteCredentialAutofill } from "./site-credentials";

export interface SiteCredentialCapturePayload {
  readonly password: string;
  readonly username: string;
}

export type SiteCredentialAutofillResponse =
  | { readonly credential: SiteCredentialAutofill | null; readonly ok: true }
  | { readonly ok: false };

export interface SiteCredentialSaveOffer {
  readonly isUpdate: boolean;
  readonly offerId: string;
  readonly origin: string;
  readonly username: string;
}

export type SiteCredentialSaveDecision = "later" | "never" | "save";

export interface SiteCredentialSaveDecisionPayload {
  readonly decision: SiteCredentialSaveDecision;
  readonly offerId: string;
}

export type ListSiteCredentialsResponse =
  | {
      readonly blockedOrigins: readonly string[];
      readonly credentials: readonly SavedSiteCredential[];
      readonly ok: true;
    }
  | { readonly errors: readonly string[]; readonly ok: false };
