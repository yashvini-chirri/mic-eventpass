"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import QRCode from "qrcode";
import {
  Camera,
  CheckCircle2,
  Clipboard,
  ImagePlus,
  Lightbulb,
  Moon,
  Plus,
  QrCode,
  ScanLine,
  Sun,
} from "lucide-react";
import { createClient, type Session } from "@supabase/supabase-js";
import { io } from "socket.io-client";

type Event = {
  id: string;
  name: string;
  capacity: number;
};

type Dashboard = {
  eventName: string;
  capacity: number;
  registeredCount: number;
  checkedInCount: number;
  attendees: {
    name: string;
    email: string;
    registeredAt: string;
    checkedInAt: string | null;
  }[];
};

type OfflineScan = {
  token: string;
  idempotencyKey: string;
  queuedAt: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
    : null;

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [eventId, setEventId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<"attendee" | "organizer" | null>(null);

  const [organizerPanel, setOrganizerPanel] = useState<
    "scan" | "create" | "insights"
  >("scan");

  const [darkMode, setDarkMode] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventCapacity, setEventCapacity] = useState("50");

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<OfflineScan[]>([]);

  const [question, setQuestion] = useState("");
  const [insightAnswer, setInsightAnswer] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);

  const [token, setToken] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [status, setStatus] = useState("");

  const [error, setError] = useState(
    !supabase
      ? "Supabase Auth is not configured in the frontend."
      : ""
  );

  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  /* =========================
     AUTH SESSION
     ========================= */

  useEffect(() => {
    if (!supabase) return;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      });

    const { data: listener } =
      supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          setSession(nextSession);
        }
      );

    return () => listener.subscription.unsubscribe();
  }, []);

  /* =========================
     THEME
     ========================= */

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedTheme = localStorage.getItem("eventpass-theme");

      setDarkMode(
        savedTheme
          ? savedTheme === "dark"
          : window.matchMedia(
              "(prefers-color-scheme: dark)"
            ).matches
      );

      setThemeReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode
      ? "dark"
      : "light";

    localStorage.setItem(
      "eventpass-theme",
      darkMode ? "dark" : "light"
    );
  }, [darkMode]);

  /* =========================
     SPLASH
     ========================= */

  useEffect(() => {
    const timer = window.setTimeout(
      () => setShowSplash(false),
      5000
    );

    return () => window.clearTimeout(timer);
  }, []);

  /* =========================
     ORGANIZER DASHBOARD
     ========================= */

  useEffect(() => {
    if (
      role !== "organizer" ||
      !eventId ||
      !session
    ) {
      return;
    }

    let active = true;

    const loadDashboard = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/registrations/dashboard/${eventId}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        const data = await response.json();

        if (active && response.ok) {
          setDashboard(data.dashboard);
        }
      } catch {
        // Keep existing dashboard if refresh fails.
      }
    };

    loadDashboard();

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });

    socket.on(
      "event:updated",
      (update: { eventId: string }) => {
        if (update.eventId === eventId) {
          loadDashboard();
        }
      }
    );

    return () => {
      active = false;
      socket.disconnect();
    };
  }, [eventId, role, session]);

  /* =========================
     LOAD USER ROLE
     ========================= */

  useEffect(() => {
    if (!supabase || !session) {
      return;
    }

    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single()
      .then(
        ({ data, error: profileError }) => {
          if (
            profileError ||
            !data ||
            !["attendee", "organizer"].includes(data.role)
          ) {
            setError(
              "Your account profile is missing a valid role."
            );
            setRole(null);
          } else {
            setError("");
            setRole(
              data.role as "attendee" | "organizer"
            );
          }
        },
        () => {
          setError("Could not load your account profile.");
          setRole(null);
        }
      );
  }, [session]);

  /* =========================
     LOAD EVENTS
     ========================= */

  useEffect(() => {
    fetch(`${API_URL}/api/events`)
      .then((response) => response.json())
      .then((data) => {
        setEvents(data.events || []);

        if (data.events?.[0]) {
          setEventId(data.events[0].id);
        }
      })
      .catch(() =>
        setError(
          "Could not load events. Is the backend running?"
        )
      );
  }, []);

  /* =========================
     AUTH
     ========================= */

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError(
        "Supabase Auth is not configured in the frontend."
      );
      return;
    }

    const { error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError) {
      setError(signInError.message);
    }
  }

  async function signOut() {
    await supabase?.auth.signOut();

    setQrImage("");
    setToken("");
    setDashboard(null);
  }

  function authHeaders(): Record<string, string> {
    return session
      ? {
          Authorization: `Bearer ${session.access_token}`,
        }
      : {};
  }

  /* =========================
     ATTENDEE REGISTRATION
     ========================= */

  async function register(event: FormEvent) {
    event.preventDefault();

    setError("");
    setStatus("Registering...");

    try {
      const response = await fetch(
        `${API_URL}/api/registrations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            eventId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Registration failed"
        );
      }

      setToken(data.registration.qrToken);

      setQrImage(
        await QRCode.toDataURL(
          data.registration.qrToken,
          {
            margin: 2,
            width: 280,
          }
        )
      );

      setStatus(
        "Registration confirmed. Keep this QR code ready at check-in."
      );
    } catch (registrationError) {
      setStatus("");

      setError(
        registrationError instanceof Error
          ? registrationError.message
          : "Registration failed"
      );
    }
  }

  /* =========================
     CREATE EVENT
     ========================= */

  async function createEvent(event: FormEvent) {
    event.preventDefault();

    setError("");
    setStatus("Creating event...");

    try {
      const response = await fetch(
        `${API_URL}/api/events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            name: eventName,
            eventDate,
            capacity: Number(eventCapacity),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Event creation failed"
        );
      }

      setEvents((currentEvents) => [
        ...currentEvents,
        data.event,
      ]);

      setEventId(data.event.id);
      setEventName("");
      setEventDate("");
      setEventCapacity("50");

      setStatus("Event created successfully.");
    } catch (creationError) {
      setStatus("");

      setError(
        creationError instanceof Error
          ? creationError.message
          : "Event creation failed"
      );
    }
  }

  /* =========================
     CHECK IN
     ========================= */

  async function checkIn(scannedToken = token) {
    if (!scannedToken) return;

    setError("");
    setStatus("Checking in...");

    try {
      if (!navigator.onLine) {
        queueOfflineScan(scannedToken);

        setStatus(
          "Offline: scan saved on this device and will sync when connection returns."
        );

        return;
      }

      const response = await fetch(
        `${API_URL}/api/registrations/check-in`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            token: scannedToken,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Check-in failed"
        );
      }

      setStatus(
        `Checked in at ${new Date(
          data.checkin.checked_in_at
        ).toLocaleTimeString()}.`
      );
    } catch (checkInError) {
      if (
        checkInError instanceof TypeError ||
        !navigator.onLine
      ) {
        queueOfflineScan(scannedToken);

        setStatus(
          "Connection lost: scan saved and will sync automatically."
        );
      } else {
        setStatus("");

        setError(
          checkInError instanceof Error
            ? checkInError.message
            : "Check-in failed"
        );
      }
    }
  }

  function queueOfflineScan(scannedToken: string) {
    const queue = JSON.parse(
      localStorage.getItem(
        "eventpass-offline-scans"
      ) || "[]"
    ) as OfflineScan[];

    if (
      !queue.some(
        (item) => item.token === scannedToken
      )
    ) {
      queue.push({
        token: scannedToken,
        idempotencyKey: crypto.randomUUID(),
        queuedAt: new Date().toISOString(),
      });

      localStorage.setItem(
        "eventpass-offline-scans",
        JSON.stringify(queue)
      );

      setOfflineQueue(queue);
    }
  }

  /* =========================
     OFFLINE SYNC
     ========================= */

  const syncOfflineScans = useCallback(
    async () => {
      const queue = JSON.parse(
        localStorage.getItem(
          "eventpass-offline-scans"
        ) || "[]"
      ) as OfflineScan[];

      if (!queue.length || !session) return;

      const remaining: OfflineScan[] = [];

      for (const scan of queue) {
        try {
          const response = await fetch(
            `${API_URL}/api/registrations/check-in`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                token: scan.token,
                idempotencyKey:
                  scan.idempotencyKey,
                source: "offline",
              }),
            }
          );

          if (
            !response.ok &&
            response.status !== 409
          ) {
            remaining.push(scan);
          }
        } catch {
          remaining.push(scan);
        }
      }

      localStorage.setItem(
        "eventpass-offline-scans",
        JSON.stringify(remaining)
      );

      setOfflineQueue(remaining);

      if (queue.length !== remaining.length) {
        setStatus(
          "Offline scans synced. Duplicate scans were safely rejected by the server."
        );
      }
    },
    [session]
  );

  useEffect(() => {
    const loadQueue = () =>
      setOfflineQueue(
        JSON.parse(
          localStorage.getItem(
            "eventpass-offline-scans"
          ) || "[]"
        )
      );

    const sync = () => {
      if (navigator.onLine) {
        syncOfflineScans();
      }
    };

    loadQueue();

    window.addEventListener("online", sync);

    const timer = window.setInterval(
      sync,
      10000
    );

    return () => {
      window.removeEventListener("online", sync);
      window.clearInterval(timer);
    };
  }, [session, syncOfflineScans]);

  /* =========================
     QR CAMERA
     ========================= */

  async function toggleScanner() {
    if (scannerRef.current) {
      await scannerRef.current.stop();

      scannerRef.current = null;

      setStatus("Camera stopped.");

      return;
    }

    setError("");

    const { Html5Qrcode } =
      await import("html5-qrcode");

    const scanner = new Html5Qrcode("qr-reader");

    scannerRef.current = scanner;

    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: {
          width: 220,
          height: 220,
        },
      },
      async (decodedToken) => {
        await scanner.stop();

        scannerRef.current = null;

        setToken(decodedToken);

        await checkIn(decodedToken);
      },
      () => undefined
    );

    setStatus(
      "Point the camera at an attendee QR code."
    );
  }

  /* =========================
     QR IMAGE
     ========================= */

  async function scanImage(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setError("");

    const { Html5Qrcode } =
      await import("html5-qrcode");

    const scanner = new Html5Qrcode("qr-reader");

    try {
      const decodedToken =
        await scanner.scanFile(file, true);

      setToken(decodedToken);

      await checkIn(decodedToken);
    } catch {
      setError(
        "No readable QR code was found in that image."
      );
    } finally {
      scanner.clear();
    }
  }

  /* =========================
     EXPORT
     ========================= */

  async function exportEvent() {
    if (!eventId || !session) return;

    const response = await fetch(
      `${API_URL}/api/registrations/export/${eventId}`,
      {
        headers: authHeaders(),
      }
    );

    if (!response.ok) {
      setError("Could not export event data.");
      return;
    }

    const blob = await response.blob();

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `event-${eventId}.csv`;

    link.click();

    URL.revokeObjectURL(url);

    setStatus("CSV export downloaded.");
  }

  /* =========================
     AI INSIGHTS
     ========================= */

  async function askInsight(event: FormEvent) {
    event.preventDefault();

    if (
      !eventId ||
      !session ||
      !question.trim()
    ) {
      return;
    }

    setInsightLoading(true);
    setInsightAnswer("");

    try {
      const response = await fetch(
        `${API_URL}/api/insights/${eventId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            question,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Could not answer insight"
        );
      }

      setInsightAnswer(
        `${data.answer}${
          data.fallback
            ? " (using live raw statistics)"
            : ""
        }`
      );
    } catch (insightError) {
      setError(
        insightError instanceof Error
          ? insightError.message
          : "Could not answer insight"
      );
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <main
      className="app-shell"
      data-role={role || "public"}
      data-organizer-panel={organizerPanel}
    >
      {/* =========================
          SPLASH SCREEN
      ========================= */}

      {showSplash && (
        <div
          className="splash-screen"
          role="status"
          aria-label="Loading Eventry"
        >
          <Image
            src="/image.png"
            alt="Eventry"
            fill
            priority
            sizes="100vw"
            style={{
              objectFit: "cover",
            }}
          />
        </div>
      )}

      {/* =========================
          ORGANIZER SIDEBAR
      ========================= */}

      {session && role === "organizer" && (
        <aside className="organizer-sidebar">
          <p className="sidebar-kicker">
            Organizer desk
          </p>

          <h2>Event control</h2>

          <button
            className={
              organizerPanel === "scan"
                ? "active"
                : ""
            }
            onClick={() =>
              setOrganizerPanel("scan")
            }
          >
            <ScanLine size={18} />
            Scan QR
          </button>

          <button
            className={
              organizerPanel === "create"
                ? "active"
                : ""
            }
            onClick={() =>
              setOrganizerPanel("create")
            }
          >
            <Plus size={18} />
            Create event
          </button>

          <button
            className={
              organizerPanel === "insights"
                ? "active"
                : ""
            }
            onClick={() =>
              setOrganizerPanel("insights")
            }
          >
            <Lightbulb size={18} />
            Event insights
          </button>
        </aside>
      )}

      {/* =========================
          TOPBAR
      ========================= */}

      <header className="topbar">
        <div className="brand">
          

          <Image
            src="/eventry-word.png"
            alt="Eventry"
            width={105}
            height={32}
            priority
            style={{
              objectFit: "contain",
            }}
          />
        </div>

        <div className="connection">
          <button
            className="theme-button"
            onClick={() =>
              setDarkMode(
                (current) => !current
              )
            }
            aria-label={
              themeReady && darkMode
                ? "Use light mode"
                : "Use dark mode"
            }
          >
            {themeReady && darkMode ? (
              <Sun size={17} />
            ) : (
              <Moon size={17} />
            )}
          </button>

          {session && (
            <button
              className="copy-button"
              onClick={signOut}
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* =========================
          ORGANIZER EVENT SELECTOR
          DIRECTLY UNDER TOPBAR
      ========================= */}

      {session && role === "organizer" && (
        <div className="event-selector">
          <label>
            Dashboard event

            <select
              value={eventId}
              onChange={(event) => {
                setEventId(event.target.value);
                setDashboard(null);
              }}
              required
            >
              <option value="">
                Choose an event
              </option>

              {events.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.name} · {item.capacity} spots
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* =========================
          PUBLIC HERO
      ========================= */}

      {!session && (
        <section className="hero">
          <h1
            style={{
              fontSize: "42px",
              lineHeight: "1.1",
            }}
          >
            Your Event. Your Moment. Your Eventry
          </h1>
        </section>
      )}

      {/* =========================
          MAIN WORKSPACE
      ========================= */}

      <section className="workspace">
        {/* LOGIN */}

        {!session && (
          <form
            className="panel auth-panel"
            onSubmit={signIn}
          >
            <div className="panel-heading">
              

              <div>
                <h2>
                  Good to see you!
                </h2>

                <p>
                  Drop your details and let’s get started.
                </p>
              </div>
            </div>

            <label>
              Email

              <input
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                required
              />
            </label>

            <label>
              Password

              <input
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value
                  )
                }
                required
              />
            </label>

            <button
              className="primary"
              type="submit"
            >
              Sign in
              <CheckCircle2 size={17} />
            </button>
          </form>
        )}

        {/* LOADING */}

        {session &&
          !role &&
          !error && (
            <div className="panel">
              <p>
                Loading your workspace...
              </p>
            </div>
          )}

        {/* =========================
            ATTENDEE
        ========================= */}

        {session &&
          role === "attendee" && (
            <div className="panel-grid">
              <form
                className="panel"
                onSubmit={register}
              >
                <div className="panel-heading">
                  
                  <div>
                    <h2>
                      Claim your pass
                    </h2>

                    <p>
                      Your signed-in attendee
                      profile will be used.
                    </p>
                  </div>
                </div>

                <label>
                  Event

                  <select
                    value={eventId}
                    onChange={(event) =>
                      setEventId(
                        event.target.value
                      )
                    }
                    required
                  >
                    <option value="">
                      Choose an event
                    </option>

                    {events.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.name} ·{" "}
                        {item.capacity} spots
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="primary"
                  type="submit"
                >
                  Generate my QR
                  <QrCode size={17} />
                </button>
              </form>

              <div className="panel pass-panel">
                {qrImage ? (
                  <>
                    <div className="qr-frame">
                      <Image
                        src={qrImage}
                        alt="Your event QR pass"
                        width={280}
                        height={280}
                        unoptimized
                      />
                    </div>

                    <p className="pass-label">
                      Your entry pass
                    </p>

                    <button
                      className="copy-button"
                      onClick={() =>
                        navigator.clipboard.writeText(
                          token
                        )
                      }
                    >
                      <Clipboard size={16} />
                      Copy token
                    </button>
                  </>
                ) : (
                  <div className="empty-pass">
                    <QrCode size={42} />

                    <p>
                      Your QR pass will appear
                      here
                    </p>

                    <span>
                      Register for an event to
                      create it.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* =========================
            ORGANIZER
        ========================= */}

        {session &&
          role === "organizer" && (
            <>
              <div className="organizer-grid">
                {/* CREATE EVENT */}

                <form
                  className="panel"
                  onSubmit={createEvent}
                >
                  <div className="panel-heading">
                    <span className="number">
                      01
                    </span>

                    <div>
                      <h2>
                        Create an event
                      </h2>

                      <p>
                        Set the event details
                        before attendees
                        register.
                      </p>
                    </div>
                  </div>

                  <label>
                    Event name

                    <input
                      value={eventName}
                      onChange={(event) =>
                        setEventName(
                          event.target.value
                        )
                      }
                      placeholder="MIC Annual Meetup"
                      required
                    />
                  </label>

                  <label>
                    Date and time

                    <input
                      type="datetime-local"
                      value={eventDate}
                      onChange={(event) =>
                        setEventDate(
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>

                  <label>
                    Capacity

                    <input
                      type="number"
                      min="1"
                      value={eventCapacity}
                      onChange={(event) =>
                        setEventCapacity(
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>

                  <button
                    className="primary"
                    type="submit"
                  >
                    Create event
                    <CheckCircle2 size={17} />
                  </button>
                </form>

                {/* SCANNER */}

                <div className="panel scanner-panel">
                  <div className="panel-heading">
                    

                    <div>
                      <h2>
                        Check in an attendee
                      </h2>

                      <p>
                        Upload a QR image, scan
                        with your camera, or paste
                        its token.
                      </p>
                    </div>
                  </div>

                  <div
                    className="scanner"
                    id="qr-reader"
                  >
                    <div className="scanner-placeholder">
                      <Camera size={32} />

                      <span>
                        Camera preview
                      </span>
                    </div>
                  </div>

                  <button
                    className="primary"
                    onClick={toggleScanner}
                  >
                    <Camera size={17} />
                    Start camera scanner
                  </button>

                  <label className="upload-button">
                    <ImagePlus size={17} />
                    Upload QR image

                    <input
                      type="file"
                      accept="image/*"
                      onChange={scanImage}
                    />
                  </label>

                  <div className="divider">
                    <span>
                      or use token
                    </span>
                  </div>

                  <div className="inline-form">
                    <input
                      value={token}
                      onChange={(event) =>
                        setToken(
                          event.target.value
                        )
                      }
                      placeholder="Paste QR token"
                    />

                    <button
                      className="secondary"
                      onClick={() =>
                        checkIn()
                      }
                      disabled={!token}
                    >
                      <CheckCircle2 size={17} />
                      Check in
                    </button>
                  </div>

                  <p className="queue-status">
                    Offline queue:{" "}
                    {offlineQueue.length}
                  </p>
                </div>
              </div>

              {/* DASHBOARD */}

              <div className="panel dashboard-panel">
                <div className="panel-heading">
                 

                  <div>
                    <h2>
                      {dashboard?.eventName ||
                        "Event dashboard"}
                    </h2>

                    <p>
                      Updates automatically
                      every five seconds.
                    </p>
                  </div>
                </div>

                <button
                  className="secondary export-button"
                  onClick={exportEvent}
                >
                  Export CSV
                </button>

                {dashboard && (
                  <>
                    <div className="stats">
                      <div>
                        <strong>
                          {
                            dashboard.registeredCount
                          }
                        </strong>

                        <span>
                          registered
                        </span>
                      </div>

                      <div>
                        <strong>
                          {
                            dashboard.checkedInCount
                          }
                        </strong>

                        <span>
                          checked in
                        </span>
                      </div>

                      <div>
                        <strong>
                          {dashboard.capacity -
                            dashboard.registeredCount}
                        </strong>

                        <span>
                          spots left
                        </span>
                      </div>
                    </div>

                    <div className="attendee-list">
                      {dashboard.attendees.map(
                        (attendee) => (
                          <div
                            className="attendee-row"
                            key={attendee.email}
                          >
                            <span>
                              <b>
                                {attendee.name}
                              </b>

                              <small>
                                {attendee.email}
                              </small>
                            </span>

                            <em
                              className={
                                attendee.checkedInAt
                                  ? "checked"
                                  : "pending"
                              }
                            >
                              {attendee.checkedInAt
                                ? `Checked in ${new Date(
                                    attendee.checkedInAt
                                  ).toLocaleTimeString()}`
                                : "Not checked in"}
                            </em>
                          </div>
                        )
                      )}
                    </div>
                  </>
                )}

                {/* INSIGHTS */}

                <form
                  className="insight-form"
                  onSubmit={askInsight}
                >
                  <label>
                    Ask about this event

                    <input
                      value={question}
                      onChange={(event) =>
                        setQuestion(
                          event.target.value
                        )
                      }
                      placeholder="How many people have checked in so far?"
                    />
                  </label>

                  <button
                    className="secondary"
                    type="submit"
                    disabled={
                      insightLoading ||
                      !question.trim()
                    }
                  >
                    {insightLoading
                      ? "Thinking..."
                      : "Ask insight"}
                  </button>

                  {insightAnswer && (
                    <p className="insight-answer">
                      {insightAnswer}
                    </p>
                  )}
                </form>
              </div>
            </>
          )}

        {/* STATUS */}

        {status && (
          <p className="notice success">
            {status}
          </p>
        )}

        {/* ERROR */}

        {error && (
          <p className="notice error">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}