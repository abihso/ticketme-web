import React from "react";
import { createRoot } from "react-dom/client";
import { AdminScanner } from "./scanner";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AdminScanner />
  </React.StrictMode>,
);
