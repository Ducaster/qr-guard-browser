import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

type ForgePackagerConfig = NonNullable<ForgeConfig["packagerConfig"]>;

const packagerConfig = {
  appBundleId: "com.qrguard.browser",
  asar: true,
  executableName: "qr-guard-browser",
  // Generated from assets/icon.svg (and icon-small.svg for 24px and below).
  icon: "assets/icon",
  name: "QR Guard Browser"
} satisfies ForgePackagerConfig;

const config: ForgeConfig = {
  packagerConfig,
  rebuildConfig: {},
  makers: [
    new MakerSquirrel(
      {
        authors: "Ducaster",
        // Squirrel downloads this for the Windows "Apps & features" entry.
        iconUrl: "https://raw.githubusercontent.com/Ducaster/qr-guard-browser/main/assets/icon.ico",
        name: "qr_guard_browser",
        owners: "Ducaster",
        setupIcon: "assets/icon.ico",
        setupExe: "QRGuardBrowserSetup.exe"
      },
      ["win32"]
    ),
    new MakerZIP({}, ["darwin", "win32"]),
    new MakerDMG(
      {
        name: "QR Guard Browser"
      },
      ["darwin"]
    )
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/index.ts",
          config: "vite.main.config.ts",
          target: "main"
        },
        {
          entry: {
            preload: "src/preload/index.ts"
          },
          config: "vite.preload.config.ts",
          target: "preload"
        },
        {
          entry: {
            "qr-site-preload": "src/preload/qr-site.ts"
          },
          config: "vite.qr-preload.config.ts",
          target: "preload"
        }
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts"
        }
      ]
    })
  ]
};

export default config;
