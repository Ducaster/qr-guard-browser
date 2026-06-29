import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

type PackagerConfigWithElectronLanguages = NonNullable<ForgeConfig["packagerConfig"]> & {
  readonly electronLanguages: readonly string[];
};

const packagerConfig = {
  appBundleId: "com.qrguard.browser",
  asar: true,
  electronLanguages: ["ko", "en-US"],
  executableName: "qr-guard-browser",
  name: "QR Guard Browser"
} satisfies PackagerConfigWithElectronLanguages;

const config: ForgeConfig = {
  packagerConfig,
  rebuildConfig: {},
  makers: [
    new MakerSquirrel(
      {
        authors: "Ducaster",
        name: "qr_guard_browser",
        owners: "Ducaster",
        setupExe: "QRGuardBrowserSetup.exe"
      },
      ["win32"]
    ),
    new MakerZIP({}, ["darwin"]),
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
