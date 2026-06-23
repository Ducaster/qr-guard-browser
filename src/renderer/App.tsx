import { MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from "@fluentui/react-components";
import { useEffect, useState, type JSX } from "react";

import type { StateSnapshot } from "../core/state-machine";
import { HeaderBlock, PanelCard, Screen } from "./fluentLayout";
import { LockScreen } from "./lock/LockScreen";
import { AdminGate } from "./settings/AdminGate";
import { FirstRunSetup } from "./settings/FirstRunSetup";
import { SettingsView } from "./settings/SettingsView";
import { Toolbar } from "./toolbar/Toolbar";

type LocalMode = "adminGate" | null;

export const App = (): JSX.Element => {
  const styles = useAppStyles();
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

        setError("설정을 읽을 수 없습니다.");
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
          {error.length > 0 ? (
            <MessageBar className={styles.floatingMessage} intent="error">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          ) : null}
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
  <Screen center>
    <PanelCard ariaLabel="불러오는 중" narrow>
      <HeaderBlock title="불러오는 중" />
      <Spinner label="설정 불러오는 중" />
    </PanelCard>
  </Screen>
);

const useAppStyles = makeStyles({
  floatingMessage: {
    bottom: tokens.spacingVerticalXL,
    position: "fixed",
    right: tokens.spacingHorizontalXL,
    zIndex: 10,
    margin: 0
  }
});
