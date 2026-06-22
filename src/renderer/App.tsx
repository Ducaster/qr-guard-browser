import { APP_NAME } from "../core/sanity";

export const App = (): React.JSX.Element => (
  <main className="app-shell" aria-label={APP_NAME}>
    <section className="shell-panel" aria-label="Shell status">
      <h1>{APP_NAME}</h1>
      <p>Locked</p>
    </section>
  </main>
);
