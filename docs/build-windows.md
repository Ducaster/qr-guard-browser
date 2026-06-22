# Build Windows

Windows installers are produced on Windows. The supported automated path is the `windows-latest` GitHub Actions job in `.github/workflows/build.yml`.

Do not treat a macOS run as a verified Windows build. Electron Forge Squirrel packaging is platform-specific, and cross-building the final Windows installer from macOS is not reliable for this project.

## Requirements

- Windows, or the `windows-latest` GitHub Actions runner.
- Node 22.
- npm.

## Local Windows Build

From the repository root on Windows:

```powershell
npm ci
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run make
```

Electron Forge writes Squirrel artifacts under `out/make/`. The configured Windows maker is:

- `@electron-forge/maker-squirrel` for a Squirrel installer.

Expected artifacts include:

```text
out/make/squirrel.windows/<arch>/QRGuardBrowserSetup.exe
out/make/squirrel.windows/<arch>/RELEASES
out/make/squirrel.windows/<arch>/*.nupkg
```

## CI Build

The GitHub Actions matrix runs on both:

- `macos-latest`
- `windows-latest`

Each job runs:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run make
```

The Windows installer is produced and verified by the `windows-latest` job, then uploaded as an artifact named `qr-guard-browser-Windows`.

## Unsigned Builds

This repository does not configure Authenticode signing. Unsigned Squirrel installers can trigger Windows SmartScreen warnings for an unknown publisher.

For production distribution later:

1. Obtain an Authenticode code-signing certificate.
2. Configure Squirrel/Electron Forge signing in CI.
3. Store signing credentials in CI secrets.
4. Verify the installer on a clean Windows machine.

Until signing is configured, treat the Windows artifact as an internal unsigned build.
