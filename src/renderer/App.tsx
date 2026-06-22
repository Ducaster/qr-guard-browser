import { useEffect, useState, type JSX } from "react";

import { LockScreen } from "./lock/LockScreen";
import { AdminGate } from "./settings/AdminGate";
import { FirstRunSetup } from "./settings/FirstRunSetup";
import { SettingsView } from "./settings/SettingsView";

type AppMode = "adminGate" | "loading" | "locked" | "settings" | "setup";

export const App = (): JSX.Element => {
  const [mode, setMode] = useState<AppMode>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    void window.qrGuard.isFirstRun()
      .then((response) => {
        if (!isMounted) {
          return;
        }

        if (!response.ok) {
          setError(response.errors.join(" "));
          setMode("locked");
          return;
        }

        setMode(response.isFirstRun ? "setup" : "locked");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setError("Settings could not be read.");
        setMode("locked");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  switch (mode) {
    case "adminGate":
      return (
        <AdminGate
          onAuthorized={() => {
            setMode("settings");
          }}
          onCancel={() => {
            setMode("locked");
          }}
        />
      );
    case "loading":
      return <LoadingView />;
    case "locked":
      return (
        <>
          <LockScreen
            onOpenSettings={() => {
              setMode("adminGate");
            }}
          />
          {error.length > 0 ? <p className="floating-error">{error}</p> : null}
        </>
      );
    case "settings":
      return (
        <SettingsView
          onClose={() => {
            setMode("locked");
          }}
        />
      );
    case "setup":
      return (
        <FirstRunSetup
          onComplete={() => {
            setMode("locked");
          }}
        />
      );
  }
};

const LoadingView = (): JSX.Element => (
  <main className="app-shell app-shell--center">
    <section className="operator-panel operator-panel--narrow" aria-label="Loading">
      <div className="panel-header">
        <p className="eyebrow">QR Guard Browser</p>
        <h1>Loading</h1>
      </div>
    </section>
  </main>
);
