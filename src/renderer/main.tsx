import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { FluentThemeProvider } from "./FluentThemeProvider";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Renderer root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <FluentThemeProvider>
      <App />
    </FluentThemeProvider>
  </StrictMode>
);
