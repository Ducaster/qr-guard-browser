import { useEffect, useState, type JSX } from "react";

import type { StateSnapshot } from "../core/state-machine";
import { LockScreen } from "./lock/LockScreen";
import { AdminGate } from "./settings/AdminGate";
import { FirstRunSetup } from "./settings/FirstRunSetup";
import { SettingsView } from "./settings/SettingsView";
import { Toolbar } from "./toolbar/Toolbar";

type LocalMode = "adminGate" | null;

export const App = (): JSX.Element => {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [localMode, setLocalMode] = useState<LocalMode>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = window.qrGuard.onStateChange((nextState) => {
      if (isMounted) {
        setState(nextState);
      }
    });

    void window.qrGuard.getState()
      .then((nextState) => {
        if (!isMounted) {
          return;
        }

        setState(nextState);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setError("Settings could not be read.");
        setState(createLockedFallbackState());
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  if (localMode === "adminGate") {
    return (
      <AdminGate
        onAuthorized={() => {
          setLocalMode(null);
          void window.qrGuard.getState().then(setState, () => undefined);
        }}
        onCancel={() => {
          setLocalMode(null);
        }}
      />
    );
  }

  if (state === null) {
    return <LoadingView />;
  }

  switch (state.state) {
    case "needsSetup":
      return (
        <FirstRunSetup
          onComplete={() => {
            void window.qrGuard.getState().then(setState, () => undefined);
          }}
        />
      );
    case "locked":
      return (
        <>
          <LockScreen
            onOpenSettings={() => {
              setLocalMode("adminGate");
            }}
          />
          {error.length > 0 ? <p className="floating-error">{error}</p> : null}
        </>
      );
    case "settings":
      return (
        <SettingsView
          onClose={() => {
            setLocalMode(null);
            void window.qrGuard.getState().then(setState, () => undefined);
          }}
        />
      );
    case "loginMode":
    case "unlocked":
      return <Toolbar state={state} />;
  }
};

const createLockedFallbackState = (): StateSnapshot => ({
  activeUserId: null,
  now: new Date().toISOString(),
  qrVisible: false,
  remainingMs: null,
  state: "locked",
  unlockExpiresAt: null
});

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
