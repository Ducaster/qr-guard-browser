# Build macOS

macOS installers are produced locally on macOS or by the `macos-latest` GitHub Actions job.

## Requirements

- macOS.
- Node 22.
- npm.

## Local Build

From the repository root:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run make
```

Electron Forge writes artifacts under `out/make/`. The configured macOS makers are:

- `@electron-forge/maker-dmg` for a `.dmg` installer.
- `@electron-forge/maker-zip` as a `.zip` fallback.

Typical output paths look like:

```text
out/make/QR Guard Browser-0.1.0.dmg
out/make/zip/darwin/<arch>/qr-guard-browser-darwin-<arch>-0.1.0.zip
```

Use the exact paths printed by `npm run make` for release notes or handoff.

## Unsigned Builds

This repository does not configure Apple Developer ID signing or notarization. Unsigned local builds can trigger Gatekeeper warnings such as "unidentified developer".

For a production distribution later:

1. Create an Apple Developer ID Application certificate.
2. Add Electron Forge signing configuration for `osxSign`.
3. Add notarization credentials through CI secrets.
4. Verify the final `.dmg` on a clean macOS machine.

Until signing and notarization are configured, treat the macOS artifact as an internal unsigned build.
