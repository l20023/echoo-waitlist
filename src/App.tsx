import { useEffect, useState, type FormEvent } from "react";
import { HashRouter, Link, Route, Routes, useSearchParams } from "react-router-dom";
import "./App.css";
import { supabase } from "./supabase";
import { track, setAnalyticsConsentWeb } from "./analytics";
import { FeatureRequestsPage } from "./modules/feature-requests";

const featureSections = [
  {
    title: "Journal just by sending a memo to yourself.",
    description:
      "No setup, no pressure. Record a short voice memo and let Echoo turn it into a journal moment.",
    image: "/mockups/record-left.png",
    imageAlt: "Echoo record screen mockup",
  },
  {
    title: "Echoo takes your voice note and creates your journal entry.",
    description:
      "Your spoken note becomes a structured entry you can revisit, edit, and share with your friends if you feel like it.",
    image: "/mockups/entry-left.png",
    imageAlt: "Echoo generated entry mockup",
  },
  {
    title: "Keep track of your entries.",
    description:
      "Use the calendar to get a clear overview of your rhythm and revisit days that matter.",
    image: "/mockups/calendar-left.png",
    imageAlt: "Echoo calendar mockup",
  },
  {
    title: "Search your entries.",
    description:
      "Find thoughts, places, and moments in seconds, even after weeks or months.",
    image: "/mockups/search-left.png",
    imageAlt: "Echoo search mockup",
  },
] as const;

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/confirm" element={<ConfirmWaitlistPage />} />
        <Route
          path="/feature-requests"
          element={<FeatureRequestsPage supabase={supabase} source="waitlist" backTo="/" />}
        />
      </Routes>
    </HashRouter>
  );
}

function LandingPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(""); // Für Feedback-Texte
  const [consent, setConsent] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem("memi_analytics_consent_web");
      if (stored === "1") return true;
      if (stored === "0") return false;
      return null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    setAnalyticsConsentWeb(consent === true);
  }, [consent]);

  const handleConsent = (enabled: boolean) => {
    setConsent(enabled);
    try {
      window.localStorage.setItem(
        "memi_analytics_consent_web",
        enabled ? "1" : "0",
      );
    } catch {
      // ignore
    }
    setAnalyticsConsentWeb(enabled);
  };

  useEffect(() => {
    if (consent !== true) return;
    const params = new URLSearchParams(window.location.search);
    const utm_source = params.get("utm_source") || undefined;
    const utm_medium = params.get("utm_medium") || undefined;
    const utm_campaign = params.get("utm_campaign") || undefined;
    const utm_term = params.get("utm_term") || undefined;
    const utm_content = params.get("utm_content") || undefined;

    track("waitlist_page_viewed", {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      referrer: document.referrer || undefined,
    });
  }, [consent]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(""); // Reset message

    const params = new URLSearchParams(window.location.search);
    const utm_source = params.get("utm_source") || undefined;
    const utm_medium = params.get("utm_medium") || undefined;
    const utm_campaign = params.get("utm_campaign") || undefined;
    const utm_term = params.get("utm_term") || undefined;
    const utm_content = params.get("utm_content") || undefined;

    track("waitlist_signup_submitted", {
      email_domain: email.split("@")[1] || undefined,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      referrer: document.referrer || undefined,
    });

    const { data, error } = await supabase.rpc("join_waitlist", { p_email: email });

    const row = Array.isArray(data) ? data[0] : null;

    if (error || !row) {
      // Prüfen, ob die Email bereits existiert (PostgREST error code 23505)
      if (error?.code === "23505") {
        setMessage("You're already on the list! ✨");
        track("waitlist_signup_duplicate", {
          email_domain: email.split("@")[1] || undefined,
        });
      } else {
        setMessage("Something went wrong. Please try again.");
        track("waitlist_signup_error", {
          code: error?.code,
        });
      }
    } else {
      setSubmitted(true);
      setWaitlistPosition(row.waitlist_position ?? null);
      setNeedsConfirmation(!!row.needs_confirmation);
      track("waitlist_signup_confirmed", {
        email_domain: email.split("@")[1] || undefined,
        waitlist_position: row.waitlist_position ?? undefined,
      });

      // Trigger transactional confirmation mail (best-effort).
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseAnonKey) {
        fetch(`${supabaseUrl}/functions/v1/waitlist-send-confirmation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ email }),
        }).catch((mailErr) => {
          console.error("Waitlist confirmation mail trigger failed:", mailErr);
        });
      }
    }
    setLoading(false);
  };

  return (
    <div className="app-container">
      {consent === null && (
        <div className="consent-banner">
          <p>
            We use anonymized analytics (PostHog) to understand how our
            waitlist page is used. No journal content or sensitive data is
            tracked.
          </p>
          <div className="consent-actions">
            <button type="button" onClick={() => handleConsent(false)}>
              Decline
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => handleConsent(true)}
            >
              Accept
            </button>
          </div>
        </div>
      )}
      <main className="landing">
        <section className="content content-hero" id="join">
          <header className="brand">
            <h1 className="logo">
              ECH
              <span className="logo-flower" aria-hidden="true">
                <span className="logo-flower-back">✿</span>
                <span className="logo-flower-front">✿</span>
              </span>
              O
            </h1>
            <div className="divider"></div>
          </header>

          <section className="hero-text">
            <h2>Your day, your voice, your echoo.</h2>
            <p>Join the waitlist and get early access to a voice-first journal.</p>
          </section>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="minimal-form">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? "Joining..." : "Join the waitlist"}
              </button>
              {/* Hier wird die Fehlermeldung angezeigt */}
              {message && <p className="status-message">{message}</p>}
            </form>
          ) : (
            <div className="fade-in">
              <p className="success">
                {needsConfirmation
                  ? "Please confirm your email. We sent you a confirmation message."
                  : "You are confirmed on the waitlist."}
              </p>
              {waitlistPosition ? (
                <p className="waitlist-position">
                  Your current waitlist position: <strong>#{waitlistPosition}</strong>
                </p>
              ) : null}
            </div>
          )}

          <Link to="/feature-requests" className="feature-request-link">
            Open feature requests dashboard
          </Link>
        </section>

        <section className="feature-stack">
          {featureSections.map((item) => (
            <article className="feature-block" key={item.title}>
              <div className="feature-copy">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
              <div className="feature-mockup-wrap">
                <img src={item.image} alt={item.imageAlt} className="feature-mockup" />
              </div>
            </article>
          ))}
        </section>

      </main>

      <footer className="footer">
        <span>Built with love</span>
        <span className="dot">♥</span>
      </footer>
    </div>
  );
}

function ConfirmWaitlistPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(
    token ? "Confirming your waitlist email..." : "Missing confirmation token.",
  );
  const [position, setPosition] = useState<number | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const confirm = async () => {
      const { data, error } = await supabase.rpc("confirm_waitlist_email", {
        p_token: token,
      });
      try {
        if (error || !data || data.length === 0) {
          setMessage("Confirmation link is invalid or expired.");
          return;
        }

        const row = data[0];
        setPosition(row.waitlist_position ?? null);
        setMessage("Your email is confirmed. Welcome to the waitlist.");
      } catch {
        setMessage("Could not confirm right now. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    window.setTimeout(() => {
      confirm().catch(() => {
        setMessage("Could not confirm right now. Please try again.");
        setLoading(false);
      });
    }, 0);
  }, [token]);

  return (
    <div className="app-container">
      <main className="landing">
        <section className="content content-hero">
          <header className="brand">
            <h1 className="logo">
              ECH
              <span className="logo-flower" aria-hidden="true">
                <span className="logo-flower-back">✿</span>
                <span className="logo-flower-front">✿</span>
              </span>
              O
            </h1>
            <div className="divider"></div>
          </header>

          <section className="hero-text">
            <h2>Email confirmation</h2>
            <p>{message}</p>
            {!loading && position ? (
              <p className="waitlist-position">
                Your current waitlist position: <strong>#{position}</strong>
              </p>
            ) : null}
            <Link to="/" className="feature-request-link">
              Back to waitlist
            </Link>
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;