import type { Sealer, SettingsStore } from "./settings-repo";
import { getOriginFromUrl } from "./site-credential-origin";
import {
  createEmptyVault,
  parseSiteCredentialVault,
  type SiteCredentialVault
} from "./site-credential-vault";

const CREDENTIAL_ID_SEPARATOR = "::";

export interface SiteCredentialInput {
  readonly origin: string;
  readonly password: string;
  readonly username: string;
}

export interface SiteCredentialAutofill {
  readonly password: string;
  readonly username: string;
}

export interface SavedSiteCredential {
  readonly id: string;
  readonly origin: string;
  readonly updatedAt: string;
  readonly username: string;
}

export interface SiteCredentialRepository {
  readonly blockSavePromptsForOrigin: (origin: string) => void;
  readonly deleteCredential: (id: string) => void;
  readonly getAutofillCredential: (origin: string) => SiteCredentialAutofill | null;
  readonly listCredentials: () => readonly SavedSiteCredential[];
  readonly saveCredential: (credential: SiteCredentialInput, updatedAt: string) => void;
  readonly shouldOfferToSave: (origin: string) => boolean;
}

export class SiteCredentialInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteCredentialInputError";
  }
}

export const credentialIdFor = (origin: string, username: string): string =>
  `${encodeURIComponent(origin)}${CREDENTIAL_ID_SEPARATOR}${encodeURIComponent(username)}`;

export { getOriginFromUrl };

export const createSiteCredentialRepository = (
  store: SettingsStore,
  sealer: Sealer
): SiteCredentialRepository => {
  const loadVault = (): SiteCredentialVault => {
    const sealed = store.read();

    if (sealed === null) {
      return createEmptyVault();
    }

    return parseSiteCredentialVault(sealer.unseal(sealed));
  };

  const saveVault = (vault: SiteCredentialVault): void => {
    store.write(sealer.seal(JSON.stringify(vault)));
  };

  return {
    blockSavePromptsForOrigin: (origin: string) => {
      const normalizedOrigin = requireOrigin(origin);
      const vault = loadVault();

      if (vault.blockedOrigins.includes(normalizedOrigin)) {
        return;
      }

      saveVault({
        ...vault,
        blockedOrigins: [...vault.blockedOrigins, normalizedOrigin]
      });
    },
    deleteCredential: (id: string) => {
      const parsedId = parseCredentialId(id);

      if (parsedId === null) {
        return;
      }

      const vault = loadVault();

      saveVault({
        ...vault,
        entries: vault.entries.filter(
          (entry) => entry.origin !== parsedId.origin || entry.username !== parsedId.username
        )
      });
    },
    getAutofillCredential: (origin: string) => {
      const normalizedOrigin = requireOrigin(origin);
      const vault = loadVault();
      const entry = [...vault.entries]
        .filter((candidate) => candidate.origin === normalizedOrigin)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

      return entry === undefined
        ? null
        : {
            password: entry.password,
            username: entry.username
          };
    },
    listCredentials: () =>
      [...loadVault().entries]
        .map((entry) => ({
          id: credentialIdFor(entry.origin, entry.username),
          origin: entry.origin,
          updatedAt: entry.updatedAt,
          username: entry.username
        }))
        .sort((left, right) =>
          left.origin === right.origin
            ? left.username.localeCompare(right.username)
            : left.origin.localeCompare(right.origin)
        ),
    saveCredential: (credential: SiteCredentialInput, updatedAt: string) => {
      const normalizedCredential = normalizeCredential(credential);
      const vault = loadVault();
      const entries = vault.entries.filter(
        (entry) =>
          entry.origin !== normalizedCredential.origin ||
          entry.username !== normalizedCredential.username
      );

      saveVault({
        ...vault,
        entries: [
          ...entries,
          {
            ...normalizedCredential,
            updatedAt
          }
        ]
      });
    },
    shouldOfferToSave: (origin: string) => {
      const normalizedOrigin = requireOrigin(origin);

      return !loadVault().blockedOrigins.includes(normalizedOrigin);
    }
  };
};

const normalizeCredential = (credential: SiteCredentialInput): SiteCredentialInput => {
  const origin = requireOrigin(credential.origin);
  const username = credential.username.trim();

  if (username.length === 0 || credential.password.length === 0) {
    throw new SiteCredentialInputError("Credential username and password are required.");
  }

  return {
    origin,
    password: credential.password,
    username
  };
};

const requireOrigin = (origin: string): string => {
  const normalizedOrigin = getOriginFromUrl(origin);

  if (normalizedOrigin === null || normalizedOrigin !== origin) {
    throw new SiteCredentialInputError("Credential origin must be an HTTP(S) origin.");
  }

  return normalizedOrigin;
};

const parseCredentialId = (id: string): { readonly origin: string; readonly username: string } | null => {
  const parts = id.split(CREDENTIAL_ID_SEPARATOR);

  if (parts.length !== 2) {
    return null;
  }

  const [rawOrigin, rawUsername] = parts;

  if (rawOrigin === undefined || rawUsername === undefined) {
    return null;
  }

  const origin = getOriginFromUrl(decodeURIComponent(rawOrigin));
  const username = decodeURIComponent(rawUsername);

  return origin === null || username.trim().length === 0
    ? null
    : {
        origin,
        username
      };
};
