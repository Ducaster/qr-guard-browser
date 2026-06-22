import { APP_NAME } from "../core/sanity";

export const App = (): React.JSX.Element => (
  <main className="app-shell" aria-label={APP_NAME}>
    <h1>{APP_NAME}</h1>
  </main>
);
