import fs from "node:fs";
import path from "node:path";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

type ForgePackagerConfig = NonNullable<ForgeConfig["packagerConfig"]>;

const chromiumLocaleLanguagePrefixes = ["ko", "en"] as const;
const protectedPakNames = new Set([
  "chrome_100_percent.pak",
  "chrome_200_percent.pak",
  "resources.pak"
]);

const getLocaleLanguageToken = (localeName: string): string => {
  const [languageToken] = localeName.split(/[_.]/u, 1);
  return languageToken ?? localeName;
};

const shouldKeepChromiumLocale = (localeName: string): boolean => {
  const languageToken = getLocaleLanguageToken(localeName);

  // Chromium locale names start with their language family; keep Korean and English variants.
  return chromiumLocaleLanguagePrefixes.some(
    (languagePrefix) =>
      languageToken === languagePrefix || languageToken.startsWith(`${languagePrefix}-`)
  );
};

const pruneChromiumLocalePaks: NonNullable<ForgePackagerConfig["afterExtract"]>[number] = (
  buildPath,
  _electronVersion,
  _platform,
  _arch,
  callback
) => {
  const walk = (directoryPath: string): void => {
    const parentDirectoryName = path.basename(directoryPath);

    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (entry.name === "locale.pak" && parentDirectoryName.endsWith(".lproj")) {
        const localeName = parentDirectoryName.slice(0, -".lproj".length);

        if (!shouldKeepChromiumLocale(localeName)) {
          fs.rmSync(entryPath, { force: true });
        }

        continue;
      }

      if (
        parentDirectoryName === "locales" &&
        entry.name.endsWith(".pak") &&
        !protectedPakNames.has(entry.name)
      ) {
        const localeName = entry.name.slice(0, -".pak".length);

        if (!shouldKeepChromiumLocale(localeName)) {
          fs.rmSync(entryPath, { force: true });
        }
      }
    }
  };

  try {
    walk(buildPath);
    callback();
  } catch (error) {
    callback(
      error instanceof Error
        ? error
        : new Error("Unexpected non-Error while pruning Chromium locale packs")
    );
  }
};

const packagerConfig = {
  appBundleId: "com.qrguard.browser",
  asar: true,
  afterExtract: [pruneChromiumLocalePaks],
  executableName: "qr-guard-browser",
  name: "QR Guard Browser"
} satisfies ForgePackagerConfig;

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
