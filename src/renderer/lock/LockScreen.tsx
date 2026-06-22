import type { JSX } from "react";

interface LockScreenProps {
  readonly onOpenSettings: () => void;
}

export const LockScreen = ({ onOpenSettings }: LockScreenProps): JSX.Element => (
  <main className="app-shell app-shell--center">
    <section className="operator-panel operator-panel--narrow" aria-label="Locked">
      <div className="status-rail" aria-hidden="true" />
      <div className="panel-header">
        <p className="eyebrow">QR Guard Browser</p>
        <h1>QR hidden</h1>
      </div>
      <div className="lock-status" data-testid="locked-screen">
        <span className="status-dot" aria-hidden="true" />
        <span>Locked</span>
      </div>
      <div className="button-row">
        <button className="button button--primary" onClick={onOpenSettings} type="button">
          Settings
        </button>
      </div>
    </section>
  </main>
);
