import { useCallback, useEffect, useRef, useState } from "react";
import "./guest-ticket.css";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
type GuestPass = {
  guestName: string;
  event: string;
  venue: string;
  startsAt: string;
  ticketType: string;
  tableNumber: number;
  seatNumber: number;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  qrSvg: string | null;
};
function readToken() {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export default function GuestTicket() {
  const [token, setToken] = useState(readToken);
  const [ticket, setTicket] = useState<GuestPass | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setTicket(null);
    setError("");
    setLoading(true);
    try {
      if (token.length < 16 || token.length > 256) {
        throw new Error("Open the complete guest ticket link from your email.");
      }
      const response = await fetch(`${API_URL}/api/guest-tickets/lookup`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }), signal: request.signal, cache: "no-store", credentials: "omit",
      });
      const body = await response.json() as GuestPass & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Ticket unavailable. Ask the booking owner for the latest link.");
      if (!body.checkedInAt && !body.qrSvg) throw new Error("Could not display your QR code. Please refresh your ticket.");
      if (!request.signal.aborted) setTicket(body);
    } catch (reason) {
      if (!request.signal.aborted) setError(reason instanceof TypeError
        ? "Could not connect to the ticket service. Check your connection and try again."
        : reason instanceof Error ? reason.message : "Could not load your ticket. Please try again.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Your guest ticket · Altbit";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.append(robots);
    const onHashChange = () => {
      pending.current?.abort();
      setTicket(null);
      setToken(readToken());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => { document.title = previousTitle; robots.remove(); window.removeEventListener("hashchange", onHashChange); };
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { pending.current?.abort(); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  return <main className="guest-ticket-page">
    <article className="guest-ticket-card" aria-labelledby="guest-ticket-title">
      <p className="guest-ticket-brand">ALTBIT · GUEST PASS</p>
      <h1 id="guest-ticket-title">Your guest ticket</h1>
      <p className="guest-ticket-status" role="status">{loading ? "Loading your ticket…" : error ? "Ticket unavailable"
        : ticket?.checkedInAt ? ticket.checkedOutAt ? "Ticket used · checked out" : "Ticket used · checked in" : "Ready for entry"}</p>
      {error ? <p className="guest-ticket-error" role="alert">{error}</p> : null}
      {ticket ? <>
        <h2>{ticket.event}</h2>
        <p className="guest-ticket-muted">{ticket.venue} · {new Date(ticket.startsAt).toLocaleString()}</p>
        <h2>{ticket.guestName}</h2>
        <p>{ticket.ticketType} · Table {ticket.tableNumber} · Seat {ticket.seatNumber}</p>
        {!ticket.checkedInAt && ticket.qrSvg ? <>
          <img className="guest-ticket-qr" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(ticket.qrSvg)}`} alt="Your individual entry QR code" width={260} height={260} />
          <p>Show this QR code to staff at entry. You can arrive separately from your group.</p>
          <p className="guest-ticket-muted">This ticket admits one guest once. Keep it private.</p>
          <details><summary>Show entry code</summary><p className="guest-ticket-code">{token}</p></details>
        </> : null}
      </> : null}
      <button type="button" disabled={loading} aria-busy={loading} onClick={() => void load()}>Refresh ticket status</button>
      <p className="guest-ticket-muted">No account or app required.</p>
    </article>
  </main>;
}
