import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AdminScanner } from "./scanner";
import "./style.css";

const GuestTicket = lazy(() => import("./guest-ticket"));
const isGuestTicket = window.location.pathname.replace(/\/+$/, "") === "/guest-ticket";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isGuestTicket ? <Suspense fallback={<p role="status">Loading your ticket…</p>}><GuestTicket /></Suspense> : <AdminScanner />}
  </React.StrictMode>,
);
