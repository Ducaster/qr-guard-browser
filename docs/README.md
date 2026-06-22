# QR Guard Browser

QR Guard Browser is an Electron desktop app for keeping a logged-in QR web page available while hiding the live QR code behind a local lock screen. The QR site runs as a real Chromium page in a persistent `persist:qr-site` session; the lock, settings, countdown, and audit log run in a separate control layer.

The app is an operational deterrent for shared terminals. It does not store QR-site usernames or passwords and does not automate QR-site login.

## Install

Use the installer for the target OS:

- macOS: install from the `.dmg`, or unzip the `.zip` fallback and move `QR Guard Browser.app` to Applications.
- Windows: run the Squirrel `QRGuardBrowserSetup.exe` installer produced by the Windows build.

Unsigned development builds can show platform warnings:

- macOS Gatekeeper can show "unidentified developer".
- Windows SmartScreen can warn about an unknown publisher.

See `build-macos.md`, `build-windows.md`, and `security-limits.md` for signing notes.

## First-Run Setup

On first launch, enter:

- QR URL: the QR-site URL the app should load.
- Admin code: required for settings and QR session clearing.
- At least one user: user ID plus local unlock code.
- Unlock seconds: how long QR stays visible after successful user unlock. Default is 10 seconds.
- Idle seconds: how long system inactivity may continue before an unlocked QR view relocks. Default is 30 seconds.
- Login detection: optional login URL pattern, logged-in URL pattern, and title text hint.

Admin and user codes are stored as salted `scrypt` hashes. The settings file is sealed with Electron `safeStorage` when available.

## QR URL And Login Detection

The QR URL is loaded in the dedicated QR Chromium view. The view uses a persistent session, so QR-site cookies survive app restarts until the QR session is cleared.

Login detection is fail-safe:

- A page is shown without a local unlock only when it clearly matches the configured login URL pattern or title hint.
- If the app cannot classify the QR page, it stays locked.
- When login mode is active and navigation leaves the login URL pattern, the app relocks immediately.
- If automatic detection is not enough for the site, use the toolbar's "login complete" lock action after finishing QR-site login.

## User And Code Management

Open Settings with the admin code. From Settings you can:

- Change the QR URL.
- Change unlock and idle-lock durations.
- Change login detection patterns.
- Add, rename, or delete users.
- Reset a user's unlock code.
- Clear the QR-site session after re-entering the admin code.

The renderer never receives raw hashes, salts, or internal storage paths.

## Lock And Unlock Behavior

Locked state hides the QR view with `setVisible(false)`. It is not only covered by an overlay.

User unlock flow:

1. Enter user ID and code.
2. On success, the QR view appears for the configured unlock duration.
3. The countdown toolbar remains visible.
4. Timer expiry, manual lock, idle timeout, or login-mode transition hides the QR view without reloading it.

Repeated failed unlocks trigger an increasing lockout delay.

## Audit Log And Export

Successful unlock sessions are appended to a local JSONL audit log with user ID, unlock time, lock time, duration, lock reason, and app version. Settings shows:

- Filterable audit rows by user ID.
- Last successful unlock time per user.
- JSONL and CSV export.

Failed unlock attempts are not written as successful audit events.

## Known Security Limits

QR Guard Browser is an operational control, not a tamper-proof security boundary.

- A local administrator can inspect, modify, or delete app data.
- A determined user can bypass controls by modifying the installation or the local profile.
- The audit log is local and not tamper-evident.
- Code signing is not configured in this repository; unsigned builds trigger Gatekeeper or SmartScreen warnings.
- Build-tool `npm audit` advisories are documented in `security-limits.md`; production runtime dependencies currently report zero vulnerabilities with `npm audit --omit=dev`.
