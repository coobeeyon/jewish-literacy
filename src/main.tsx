import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/noto-serif-hebrew/700.css";
import "@fontsource/source-serif-4/400.css";
import "./styles.css";
import { App } from "./App";
import { PreferenceProvider } from "./preferences";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PreferenceProvider><App /></PreferenceProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
