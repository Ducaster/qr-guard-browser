# Security Limits

QR Guard Browser is designed as a local operational deterrent for shared terminals. It reduces accidental or casual QR exposure. It is not a tamper-proof endpoint security product.

## Protected Asset

The protected asset is the currently valid QR code rendered by the configured QR web page.

The app protects that asset by:

- Hosting the QR site in a real Chromium `WebContentsView`.
- Keeping QR-site cookies in the persistent `persist:qr-site` session.
- Hiding the QR view with `setVisible(false)` while locked.
- Allowing QR exposure only after a regional user unlock or an admin-authenticated
  `siteLogin` session.
- Relocking `siteLogin` immediately when the configured QR-title pattern matches
  the current QR page title.

## Out Of Scope

The app does not protect against:

- Local administrators.
- Users with direct access to the app profile or installation files.
- Reverse engineering or local binary modification.
- Screen capture while the QR code is intentionally unlocked.
- External tampering with local audit files.

The app never stores, autofills, or automates the regional unlock code. QR-site usernames
and passwords can be saved only when the operator chooses to save them, and saved
QR-site passwords are autofilled into the site's login form without auto-submit.

## Local Storage Limits

Settings are stored in Electron `userData` and sealed with Electron `safeStorage` when available. Admin and user codes are salted `scrypt` hashes, not plaintext codes.

The main `settings.json` file is written atomically and mirrored to
`settings.json.bak` after successful saves. On startup, if the primary settings
file cannot be read, parsed, or unsealed, the app tries to restore from the
backup. A corrupted primary is moved aside as `settings.json.corrupt` before a
backup restore or later overwrite. If both files fail, the app falls back to
first-run defaults and stays locked/needs-setup instead of crashing.

Saved QR-site passwords are stored in a separate `site-credentials.json` file under
Electron `userData`. The file is sealed with Electron `safeStorage`, which uses the
operating system's account-bound secret store, similar to Chrome's use of DPAPI,
Keychain, or libsecret. The saved password is never displayed in the settings UI;
settings only list the origin and username, with a delete action.

This has the same operational limit as browser password storage on a shared terminal:
anyone who can use the same operating system account can use a saved QR-site password
inside this app. If the device is stolen while the OS account is accessible, saved
QR-site passwords should be considered usable by that attacker. `safeStorage` protects
against casual disk inspection, not against an active user of the unlocked OS account.

This still has limits:

- A local administrator can delete or replace app data.
- A local administrator can clear the QR session.
- If the operating system account is compromised, local app data should be considered compromised.

Admin-code verification paths, including opening settings and clearing the QR session, do not have the per-attempt brute-force lockout used by the user unlock flow. This is accepted within the stated threat model because the control renderer is a trusted local surface with `contextIsolation` and no remote content.

The QR view has a dedicated password-autofill preload. It runs with `contextIsolation`
enabled, `nodeIntegration` disabled, and no site-facing `contextBridge` API. The preload
uses Electron IPC only from the isolated world to request saved credentials and report
submitted login-form credentials. The remote QR site cannot access `ipcRenderer`,
`require`, or any app bridge. The only password value the QR site receives is the normal
DOM input value that the site needs in order for the operator to log in.

## Audit Log Integrity

The audit log is an append-style local JSONL file. It records successful regional unlock and admin-authenticated `siteLogin` sessions for operational review.

It is not tamper-evident:

- A local administrator can edit or delete it.
- The app does not use a remote log sink.
- The app does not sign or hash-chain audit rows.

For regulated or high-trust environments, forward audit events to an external append-only log service in a future design.

## DevTools And Single Instance

Packaged builds disable DevTools access for both the QR view and the control view:

- DevTools keyboard accelerators are prevented.
- Any opened DevTools window is immediately closed.
- The packaged application menu is removed.

The app also uses Electron's single-instance lock. A second launch quits and asks the existing instance to restore and focus its window.

These controls are useful hardening, not a protection against local administrators or binary modification.

## Code Signing

Code signing is not configured in this repository.

- macOS unsigned builds can trigger Gatekeeper "unidentified developer" warnings.
- Windows unsigned builds can trigger SmartScreen unknown-publisher warnings.

Production distribution should add Apple Developer ID signing and notarization for macOS, and Authenticode signing for Windows.

## npm Audit Posture

Current dependency posture:

- `npm audit --omit=dev` reports 0 vulnerabilities for shipped runtime dependencies.
- Full `npm audit` reports development/build-tool advisories.

The full audit advisories are in tooling used by Electron Forge and its build chain, including:

- `tar` through the Electron Forge / `@electron/rebuild` / `@electron/node-gyp` build path.
- `tmp` through the Forge CLI prompt stack.

These packages are development/build-time dependencies and are not shipped as application runtime dependencies inside the packaged app. They should still be monitored and updated when Forge releases fixed dependency chains.
