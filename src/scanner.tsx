import { coverImageType } from "./cover-image";
import { BrowserQRCodeReader } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
type AdminUser = { id: string; name: string; email: string; role: string };
type EventItem = {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  coverImageKey: string | null;
  venue: string;
  category: string;
  agenda: string | null;
  accessibility: string | null;
  refundPolicy: string | null;
  startsAt: string;
  endsAt: string | null;
  published: boolean;
  ticketTypes: {
    id: string;
    name: string;
    priceMinor: number;
    currency: string;
    quantity: number;
    sold: number;
    reserved: number;
  }[];
};
type Summary = {
  eventCount: number;
  paidPurchases: number;
  ticketCount: number;
  checkedInCount: number;
  ticketsEverCheckedIn: number;
  totalCheckIns: number;
  revenueByCurrency: { currency: string; amountMinor: number }[];
};
type Sale = {
  reference: string;
  customer: string;
  email: string;
  event: string;
  ticketType: string;
  quantity: number;
  amountMinor: number;
  currency: string;
  createdAt: string;
};
type Promotion = {
  id: string;
  code: string;
  percentOff: number;
  eventId: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
};
type RefundRequest = {
  id: string;
  reference: string;
  email: string;
  event: string;
  reason: string;
  status: string;
  decisionNote: string | null;
};
type Page =
  | "overview"
  | "events"
  | "create"
  | "sales"
  | "scan"
  | "owners"
  | "promotions"
  | "refunds";
type ScanAction = "CHECK_IN" | "CHECK_OUT";

async function request<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch {
    throw new Error(
      "Could not reach the ticketing API. Check VITE_API_URL and the backend.",
    );
  }

  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(body?.error ?? "Request failed");
  return body as T;
}

function AccountAction() {
  const path = window.location.pathname;
  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
  );
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isReset = path.endsWith("/reset-password");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await request<{ message: string }>(
        isReset ? "/api/auth/reset-password" : "/api/auth/verify-email",
        "",
        {
          method: "POST",
          body: JSON.stringify(isReset ? { token, password } : { token }),
        },
      );
      setMessage(result.message);
      if (!isReset) window.history.replaceState({}, "", "/");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not complete account action",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <span className="eyebrow">NORTHRIDE · ACCOUNT</span>
      <h1>{isReset ? "Reset password" : "Verify your email"}</h1>
      <p>
        {isReset
          ? "Choose a new password for your account."
          : "Confirm your email address to unlock ticket purchases."}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          {isReset ? "Reset token" : "Verification token"}
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
            autoCapitalize="none"
          />
        </label>
        {isReset ? (
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={10}
              maxLength={128}
              required
              autoComplete="new-password"
            />
          </label>
        ) : null}
        <button disabled={busy || !token}>
          {busy
            ? "Please wait…"
            : isReset
              ? "Set new password"
              : "Verify email"}
        </button>
      </form>
      <p role="status">{message}</p>
      <a href="/">Return to event control</a>
    </main>
  );
}

function Dashboard() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("admin-session") ?? "",
  );
  const [user, setUser] = useState<AdminUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesFrom, setSalesFrom] = useState("");
  const [salesTo, setSalesTo] = useState("");
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [ticketToken, setTicketToken] = useState("");
  const [scanAction, setScanAction] = useState<ScanAction>("CHECK_IN");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!coverImageFile) {
      setCoverImagePreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(coverImageFile);
    setCoverImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [coverImageFile]);
  const filteredSales = sales.filter((sale) => {
    const paidAt = new Date(sale.createdAt).getTime();
    const start = salesFrom
      ? new Date(`${salesFrom}T00:00:00`).getTime()
      : -Infinity;
    const end = salesTo
      ? new Date(`${salesTo}T23:59:59.999`).getTime()
      : Infinity;
    return paidAt >= start && paidAt <= end;
  });
  const ordersByDate = [
    ...filteredSales.reduce((counts, sale) => {
      const paidAt = new Date(sale.createdAt);
      const date = `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, "0")}-${String(paidAt.getDate()).padStart(2, "0")}`;
      counts.set(date, (counts.get(date) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  ]
    .sort(([first], [second]) => first.localeCompare(second))
    .slice(-7);

  function exportSalesCsv() {
    const cell = (value: string | number) => {
      let safeValue = String(value);
      if (/^\s*[=+\-@]/.test(safeValue)) safeValue = `'${safeValue}`;
      return `"${safeValue.replaceAll('"', '""')}"`;
    };
    const rows = [
      [
        "Reference",
        "Customer",
        "Email",
        "Event",
        "Ticket type",
        "Quantity",
        "Amount minor",
        "Currency",
        "Paid at",
      ],
      ...filteredSales.map((sale) => [
        sale.reference,
        sale.customer,
        sale.email,
        sale.event,
        sale.ticketType,
        sale.quantity,
        sale.amountMinor,
        sale.currency,
        sale.createdAt,
      ]),
    ];
    const csv = rows.map((row) => row.map(cell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `northride-sales-${salesFrom || "all"}-${salesTo || "all"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const refresh = useCallback(async (authToken: string) => {
    const [
      currentUser,
      nextEvents,
      nextSummary,
      nextSales,
      nextPromotions,
      nextRefunds,
    ] = await Promise.all([
      request<AdminUser>("/api/me", authToken),
      request<EventItem[]>("/api/admin/events", authToken),
      request<Summary>("/api/admin/summary", authToken),
      request<Sale[]>("/api/admin/purchases", authToken),
      request<Promotion[]>("/api/admin/promotions", authToken),
      request<RefundRequest[]>("/api/admin/refund-requests", authToken),
    ]);
    if (currentUser.role !== "ADMIN" && currentUser.role !== "ORGANIZER") {
      throw new Error("This account does not have event organizer access");
    }
    setUser(currentUser);
    setEvents(nextEvents);
    setSummary(nextSummary);
    setSales(nextSales);
    setPromotions(nextPromotions);
    setRefundRequests(nextRefunds);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void refresh(token).catch((error: unknown) => {
      if (active) {
        sessionStorage.removeItem("admin-session");
        setToken("");
        setMessage(
          error instanceof Error ? error.message : "Please sign in again",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [refresh, token]);

  useEffect(() => {
    if (!user || !scanning || !videoRef.current) return;
    const reader = new BrowserQRCodeReader();
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    void reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (!stopped && result) {
          setTicketToken(result.getText());
          setScanning(false);
        }
      })
      .then((started) => {
        controls = started;
        if (stopped) started.stop();
      })
      .catch(() => {
        if (!stopped)
          setMessage(
            "Camera unavailable. Enter a ticket token manually or enable camera access.",
          );
      });
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [scanning, user]);

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await request<{ token: string; user: AdminUser }>(
        "/api/auth/login",
        "",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );
      if (result.user.role !== "ADMIN" && result.user.role !== "ORGANIZER") {
        throw new Error("This account does not have event organizer access");
      }
      sessionStorage.setItem("admin-session", result.token);
      setToken(result.token);
      setUser(result.user);
      setPassword("");
      await refresh(result.token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function createEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      let coverImageKey: string | null = null;
      if (coverImageFile) {
        const contentType = coverImageType(coverImageFile.type, coverImageFile.name);
        if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
          throw new Error("Choose a JPG/JPEG, PNG, or WebP image.");
        }
        if (coverImageFile.size < 1 || coverImageFile.size > 20 * 1024 * 1024) {
          throw new Error("Cover image must be 20 MB or smaller.");
        }
        const uploaded = await request<{ key: string }>("/api/admin/event-covers/content", token, {
          method: "POST",
          headers: { "content-type": contentType },
          body: coverImageFile,
        });
        coverImageKey = uploaded.key;
      }
      await request("/api/admin/events", token, {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          venue: form.get("venue"),
          category: form.get("category") || "Other",
          description: form.get("description") || null,
          coverImageKey,
          agenda: form.get("agenda") || null,
          accessibility: form.get("accessibility") || null,
          refundPolicy: form.get("refundPolicy") || null,
          startsAt: new Date(String(form.get("startsAt"))).toISOString(),
          endsAt: form.get("endsAt")
            ? new Date(String(form.get("endsAt"))).toISOString()
            : null,
          ticketTypes: [
            {
              name: form.get("ticketName"),
              priceMinor: Math.round(Number(form.get("price")) * 100),
              currency: form.get("currency"),
              quantity: Number(form.get("quantity")),
            },
          ],
        }),
      });
      formElement.reset();
      setCoverImageFile(null);
      setPage("events");
      setMessage(
        "Event created as a draft. Publish it when ticket sales are ready.",
      );
      await refresh(token);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create event",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createOwner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await request<{ user: AdminUser }>(
        "/api/admin/organizers",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            name: ownerName,
            email: ownerEmail,
            password: ownerPassword,
          }),
        },
      );
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPassword("");
      setMessage(
        `Event owner account created for ${result.user.email}. Share the initial password securely.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not register event owner",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createPromotion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      await request("/api/admin/promotions", token, {
        method: "POST",
        body: JSON.stringify({
          code: promoCode.trim(),
          percentOff: Number(form.get("percentOff")),
          eventId: String(form.get("eventId") ?? "") || undefined,
          maxUses: form.get("maxUses") ? Number(form.get("maxUses")) : null,
          expiresAt: form.get("expiresAt")
            ? new Date(String(form.get("expiresAt"))).toISOString()
            : null,
        }),
      });
      formElement.reset();
      setPromoCode("");
      setMessage("Percentage promo code created.");
      await refresh(token);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create promo code",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateRefund(
    refund: RefundRequest,
    status: "APPROVED" | "REJECTED",
  ) {
    try {
      await request(`/api/admin/refund-requests/${refund.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage(`Refund request ${status.toLowerCase()}.`);
      await refresh(token);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update refund request",
      );
    }
  }

  async function setPublished(item: EventItem) {
    try {
      await request(`/api/admin/events/${item.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ published: !item.published }),
      });
      await refresh(token);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update event",
      );
    }
  }

  async function duplicateEvent(item: EventItem) {
    const newStart = window.prompt(
      "New start date and time (your local timezone)",
      "",
    );
    if (!newStart) return;
    const startsAt = new Date(newStart);
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date()) {
      setMessage("Choose a future start date and time.");
      return;
    }
    try {
      await request("/api/admin/events", token, {
        method: "POST",
        body: JSON.stringify({
          title: `${item.title} (copy)`,
          description: item.description,
          coverImageKey: item.coverImageKey,
          venue: item.venue,
          category: item.category,
          agenda: item.agenda,
          accessibility: item.accessibility,
          refundPolicy: item.refundPolicy,
          startsAt: startsAt.toISOString(),
          ticketTypes: item.ticketTypes.map((type) => ({
            name: type.name,
            priceMinor: type.priceMinor,
            currency: type.currency,
            quantity: Math.max(1, type.quantity - type.sold - type.reserved),
          })),
        }),
      });
      setMessage(
        "A new draft was created with copied event details and remaining capacity.",
      );
      await refresh(token);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not duplicate event",
      );
    }
  }

  async function addTicketType(event: EventItem) {
    const name = window.prompt("Ticket type name");
    if (!name?.trim()) return;
    const price = Number(
      window.prompt("Ticket price in major currency units", "0"),
    );
    const quantity = Number(window.prompt("Ticket quantity", "100"));
    if (
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      setMessage("Enter a valid ticket price and whole-number quantity.");
      return;
    }
    try {
      await request(`/api/admin/events/${event.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          ticketTypes: [
            {
              name: name.trim(),
              priceMinor: Math.round(price * 100),
              currency: event.ticketTypes[0]?.currency ?? "NGN",
              quantity,
            },
          ],
        }),
      });
      await refresh(token);
      setMessage("Ticket type added.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add ticket type",
      );
    }
  }

  async function editTicketType(type: EventItem["ticketTypes"][number]) {
    const name = window.prompt("Ticket type name", type.name);
    if (!name?.trim()) return;
    const currency = window
      .prompt("Currency code", type.currency)
      ?.trim()
      .toUpperCase();
    if (!currency || !/^[A-Z]{3}$/.test(currency)) {
      setMessage("Enter a valid three-letter currency code.");
      return;
    }
    const price = Number(
      window.prompt(
        "Ticket price in major currency units",
        (type.priceMinor / 100).toFixed(2),
      ),
    );
    const quantity = Number(
      window.prompt("Total ticket capacity", String(type.quantity)),
    );
    if (
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(quantity) ||
      quantity < type.sold + type.reserved
    ) {
      setMessage(
        `Capacity must be a whole number at least ${type.sold + type.reserved}.`,
      );
      return;
    }
    try {
      await request(`/api/admin/ticket-types/${type.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          currency,
          priceMinor: Math.round(price * 100),
          quantity,
        }),
      });
      await refresh(token);
      setMessage("Ticket type updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update ticket type",
      );
    }
  }

  async function checkIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Validating ticket…");
    try {
      const result = await request<{
        event: string;
        ticketType: string;
        status: string;
      }>("/api/admin/check-in", token, {
        method: "POST",
        body: JSON.stringify({ token: ticketToken, action: scanAction }),
      });
      setMessage(
        `${result.status === "CHECKED_IN" ? "Checked in" : "Checked out"} · ${result.event} · ${result.ticketType}`,
      );
      setTicketToken("");
      await refresh(token);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ticket validation failed",
      );
    }
  }

  function signOut() {
    sessionStorage.removeItem("admin-session");
    setToken("");
    setUser(null);
    setScanning(false);
    setEvents([]);
    setSummary(null);
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <span className="eyebrow">NORTHRIDE · EVENT CONTROL</span>
        <h1>Sign in.</h1>
        <p>
          Sign in to manage events, track ticket sales, and welcome guests at
          the door.
        </p>
        <form onSubmit={(event) => void authenticate(event)}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button disabled={busy}>{busy ? "Please wait…" : "Sign in"}</button>
        </form>
        <p role="status">{message}</p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <span className="eyebrow">
            NORTHRIDE · {user.role === "ADMIN" ? "ADMIN" : "ORGANIZER"}
          </span>
          <h1>
            {
              (
                {
                  overview: "Overview",
                  events: "Your events",
                  create: "Create an event",
                  sales: "Sales",
                  scan: "Scan tickets",
                  owners: "Register event owner",
                  promotions: "Promo codes",
                  refunds: "Refund requests",
                } satisfies Record<Page, string>
              )[page]
            }
          </h1>
        </div>
        <div className="topbar-user">
          <span>{user.name}</span>
          <button className="secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      {message ? (
        <p className="status" role="status">
          {message}
        </p>
      ) : null}
      <nav className="dashboard-nav" aria-label="Dashboard pages">
        {(
          [
            ["overview", "Overview"],
            ["events", "Events"],
            ...(user.role === "ORGANIZER"
              ? ([["create", "Create event"]] as const)
              : []),
            ["sales", "Sales"],
            ["scan", "Scan tickets"],
            ["promotions", "Promotions"],
            ["refunds", "Refund requests"],
            ...(user.role === "ADMIN"
              ? ([["owners", "Register event owner"]] as const)
              : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={page === id ? "nav-active" : "secondary"}
            onClick={() => {
              setPage(id);
              if (id !== "scan") setScanning(false);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {page === "overview" ? (
        <section className="stats">
          <article>
            <span>Events</span>
            <strong>{summary?.eventCount ?? "—"}</strong>
          </article>
          <article>
            <span>Paid orders</span>
            <strong>{summary?.paidPurchases ?? "—"}</strong>
          </article>
          <article>
            <span>Tickets sold</span>
            <strong>{summary?.ticketCount ?? "—"}</strong>
          </article>
          <article>
            <span>Currently inside</span>
            <strong>{summary?.checkedInCount ?? "—"}</strong>
          </article>
          <article>
            <span>Total check-ins</span>
            <strong>{summary?.totalCheckIns ?? "—"}</strong>
          </article>
          <article>
            <span>Revenue</span>
            <strong>
              {summary?.revenueByCurrency?.length
                ? summary.revenueByCurrency
                    .map(
                      (item) =>
                        `${item.currency} ${(item.amountMinor / 100).toFixed(2)}`,
                    )
                    .join(" · ")
                : "—"}
            </strong>
          </article>
        </section>
      ) : null}
      {page === "promotions" ? (
        <section className="panel">
          {user.role === "ORGANIZER" ? (
            <>
              <h2>Create a percentage promo code</h2>
              <form onSubmit={(event) => void createPromotion(event)}>
                <label>
                  Code
                  <input
                    value={promoCode}
                    onChange={(event) =>
                      setPromoCode(event.target.value.toUpperCase())
                    }
                    required
                    minLength={4}
                    maxLength={24}
                    pattern="[A-Za-z0-9_-]+"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Discount percentage
                    <input
                      name="percentOff"
                      type="number"
                      min="1"
                      max="90"
                      step="1"
                      required
                    />
                  </label>
                  <label>
                    Maximum uses (optional)
                    <input name="maxUses" type="number" min="1" step="1" />
                  </label>
                </div>
                <label>
                  Event (optional; blank applies to all your events)
                  <select name="eventId" defaultValue="">
                    <option value="">All your events</option>
                    {events
                      .filter(
                        (item) =>
                          user.role !== "ORGANIZER" ||
                          item.published ||
                          item.ticketTypes.length,
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Expiry (optional)
                  <input name="expiresAt" type="datetime-local" />
                </label>
                <button disabled={busy}>Create promo code</button>
              </form>
            </>
          ) : (
            <h2>Promo codes</h2>
          )}
          <div className="event-list">
            {promotions.map((promo) => (
              <article className="event-card" key={promo.id}>
                <h3>
                  {promo.code} · {promo.percentOff}% off
                </h3>
                <p>
                  {promo.uses} used
                  {promo.maxUses === null ? "" : ` / ${promo.maxUses}`} ·{" "}
                  {promo.expiresAt
                    ? `Expires ${new Date(promo.expiresAt).toLocaleString()}`
                    : "No expiry"}
                </p>
              </article>
            ))}
            {promotions.length === 0 ? <p>No promo codes yet.</p> : null}
          </div>
        </section>
      ) : null}
      {page === "refunds" ? (
        <section className="panel">
          <h2>Manual refund review</h2>
          <p>
            Reviewing a request records your decision only. Refund completion
            requires payment-provider confirmation and is not available in this
            dashboard.
          </p>
          <div className="event-list">
            {refundRequests.map((refund) => (
              <article className="event-card" key={refund.id}>
                <h3>
                  {refund.event} · {refund.reference}
                </h3>
                <p>
                  {refund.email} · {refund.status}
                </p>
                <p>{refund.reason}</p>
                {refund.decisionNote ? <p>{refund.decisionNote}</p> : null}
                {refund.status === "PENDING" ? (
                  <>
                    <button
                      onClick={() => void updateRefund(refund, "APPROVED")}
                    >
                      Approve for manual processing
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void updateRefund(refund, "REJECTED")}
                    >
                      Reject
                    </button>
                  </>
                ) : refund.status === "APPROVED" ? (
                  <p>Approved · awaiting payment-provider confirmation</p>
                ) : null}
              </article>
            ))}
            {refundRequests.length === 0 ? <p>No refund requests.</p> : null}
          </div>
        </section>
      ) : null}
      {page === "create" && user.role === "ORGANIZER" ? (
        <section className="panel">
          <h2>Create an event</h2>
          <form onSubmit={(event) => void createEvent(event)}>
            <label>
              Event name
              <input name="title" required maxLength={160} />
            </label>
            <label>
              Venue
              <input name="venue" required maxLength={250} />
            </label>
            <label>
              Category
              <input name="category" defaultValue="Other" maxLength={80} />
            </label>
            <label>
              Event cover image
              <input
                name="coverImageFile"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/jpg,image/png,image/webp"
                onChange={(event) =>
                  setCoverImageFile(event.target.files?.[0] ?? null)
                }
              />
              <small>JPG/JPEG, PNG, or WebP · maximum 20 MB</small>
            </label>
            {coverImagePreview ? (
              <img
                className="cover-preview"
                src={coverImagePreview}
                alt="Selected event cover preview"
              />
            ) : null}
            <label>
              Start date and time
              <input name="startsAt" type="datetime-local" required />
              <small>
                Times use your device timezone:{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}.
              </small>
            </label>
            <label>
              End date and time (optional)
              <input name="endsAt" type="datetime-local" />
              <small>Times use your device timezone.</small>
            </label>
            <label>
              Description
              <textarea name="description" rows={3} />
            </label>
            <label>
              Agenda or lineup (optional)
              <textarea name="agenda" rows={3} maxLength={5000} />
            </label>
            <label>
              Accessibility information (optional)
              <textarea name="accessibility" rows={2} maxLength={2000} />
            </label>
            <label>
              Refund policy (optional)
              <textarea name="refundPolicy" rows={2} maxLength={2000} />
            </label>
            <div className="form-row">
              <label>
                Ticket name
                <input
                  name="ticketName"
                  defaultValue="General admission"
                  required
                />
              </label>
              <label>
                Currency
                <input
                  name="currency"
                  defaultValue="GHS"
                  minLength={3}
                  maxLength={3}
                  required
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Price
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  required
                />
              </label>
              <label>
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue="100"
                  required
                />
              </label>
            </div>
            <button disabled={busy}>Save event draft</button>
          </form>
        </section>
      ) : null}
      {page === "scan" ? (
        <section className="panel scanner-panel">
          <h2>Scan tickets</h2>
          <p>
            Choose whether the attendee is entering or leaving, then scan the
            ticket.
          </p>
          <div className="form-row">
            <button
              className={scanAction === "CHECK_IN" ? "" : "secondary"}
              type="button"
              onClick={() => setScanAction("CHECK_IN")}
            >
              Check in
            </button>
            <button
              className={scanAction === "CHECK_OUT" ? "" : "secondary"}
              type="button"
              onClick={() => setScanAction("CHECK_OUT")}
            >
              Check out
            </button>
          </div>
          {scanning ? (
            <video ref={videoRef} aria-label="Ticket QR scanner" />
          ) : null}
          <button
            className="secondary"
            type="button"
            onClick={() => setScanning((active) => !active)}
          >
            {scanning ? "Stop scanning" : "Tap to scan"}
          </button>
          <form onSubmit={(event) => void checkIn(event)}>
            <label>
              Ticket token
              <input
                value={ticketToken}
                onChange={(event) => setTicketToken(event.target.value)}
                required
              />
            </label>
            <button disabled={!ticketToken}>
              {scanAction === "CHECK_IN"
                ? "Validate and check in"
                : "Validate and check out"}
            </button>
          </form>
        </section>
      ) : null}
      {page === "events" ? (
        <section className="panel">
          <div className="section-heading">
            <h2>Events and inventory</h2>
            <button className="secondary" onClick={() => void refresh(token)}>
              Refresh
            </button>
          </div>
          <p className="hint">
            Customers see only events marked Published with a start time in the
            future.
          </p>
          {events.length === 0 ? (
            <p>
              {user.role === "ADMIN"
                ? "No events yet. Register an event owner to get started."
                : "No events yet. Create your first draft above."}
            </p>
          ) : null}
          <div className="event-list">
            {events.map((event) => (
              <article className="event-card" key={event.id}>
                {event.coverImageUrl ? (
                  <img
                    className="event-cover"
                    src={event.coverImageUrl}
                    alt={`Cover for ${event.title}`}
                    loading="lazy"
                  />
                ) : null}
                <div className="section-heading">
                  <div>
                    <h3>{event.title}</h3>
                    <p>
                      {event.venue} ·{" "}
                      {new Date(event.startsAt).toLocaleString()}
                      {event.endsAt
                        ? ` – ${new Date(event.endsAt).toLocaleString()}`
                        : ""}
                    </p>
                    <span
                      className={`event-status ${event.published && new Date(event.startsAt).getTime() > Date.now() ? "event-status-live" : ""}`}
                    >
                      {!event.published
                        ? "Draft · hidden from customers"
                        : new Date(event.startsAt).getTime() <= Date.now()
                          ? "Past event · hidden from customers"
                          : "Published · visible to customers"}
                    </span>
                  </div>
                  {user.role === "ORGANIZER" ? (
                    <div className="event-actions">
                      <button
                        className={event.published ? "secondary" : ""}
                        onClick={() => void setPublished(event)}
                      >
                        {event.published ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => void duplicateEvent(event)}
                      >
                        Duplicate
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="inventory">
                  {event.ticketTypes.map((type) => (
                    <span className="inventory-item" key={type.id}>
                      {type.name} · {type.currency}{" "}
                      {(type.priceMinor / 100).toFixed(2)} · {type.sold} sold ·{" "}
                      {type.reserved} reserved / {type.quantity}
                      <button
                        className="inventory-edit"
                        onClick={() => void editTicketType(type)}
                      >
                        Edit
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  className="text-button"
                  onClick={() => void addTicketType(event)}
                >
                  Add ticket type
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {page === "owners" && user.role === "ADMIN" ? (
        <section className="panel">
          <h2>Register an event owner</h2>
          <p>
            Create an owner account, then share the initial password securely.
            Owners can sign in to create and publish their own events.
          </p>
          <form onSubmit={(event) => void createOwner(event)}>
            <label>
              Owner name
              <input
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                required
                maxLength={100}
              />
            </label>
            <label>
              Owner email
              <input
                type="email"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                required
                maxLength={254}
              />
            </label>
            <label>
              Initial password
              <input
                type="password"
                value={ownerPassword}
                onChange={(event) => setOwnerPassword(event.target.value)}
                minLength={10}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <button disabled={busy}>
              {busy ? "Creating account…" : "Register event owner"}
            </button>
          </form>
        </section>
      ) : null}
      {page === "sales" ? (
        <section className="panel">
          <div className="section-heading">
            <h2>Paid orders</h2>
            <button
              className="secondary"
              onClick={exportSalesCsv}
              disabled={!filteredSales.length}
            >
              Export CSV
            </button>
          </div>
          <div className="form-row sales-filters">
            <label>
              From date
              <input
                type="date"
                value={salesFrom}
                onChange={(event) => setSalesFrom(event.target.value)}
              />
            </label>
            <label>
              To date
              <input
                type="date"
                value={salesTo}
                onChange={(event) => setSalesTo(event.target.value)}
              />
            </label>
          </div>
          <div
            className="sales-chart"
            role="group"
            aria-label="Paid order count by date"
          >
            {ordersByDate.map(([date, count]) => (
              <div
                className="sales-bar"
                key={date}
                role="img"
                aria-label={`${new Date(`${date}T00:00:00`).toLocaleDateString()}: ${count} paid orders`}
              >
                <div className="sales-bar-track">
                  <span
                    style={{
                      height: `${Math.max(8, (count / Math.max(...ordersByDate.map(([, value]) => value))) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {new Date(`${date}T00:00:00`).toLocaleDateString()}
                </small>
                <strong>{count}</strong>
              </div>
            ))}
            {!ordersByDate.length ? (
              <p>No paid order activity for these dates.</p>
            ) : null}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Event</th>
                  <th>Tickets</th>
                  <th>Total</th>
                  <th>Paid</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <tr key={sale.reference}>
                    <td>
                      {sale.customer}
                      <small>{sale.email}</small>
                    </td>
                    <td>{sale.event}</td>
                    <td>
                      {sale.quantity} × {sale.ticketType}
                    </td>
                    <td>
                      {sale.currency} {(sale.amountMinor / 100).toFixed(2)}
                    </td>
                    <td>{new Date(sale.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredSales.length === 0 ? (
              <p>No paid orders for this date range.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

export function AdminScanner() {
  return window.location.pathname.startsWith("/account/") ? (
    <AccountAction />
  ) : (
    <Dashboard />
  );
}
