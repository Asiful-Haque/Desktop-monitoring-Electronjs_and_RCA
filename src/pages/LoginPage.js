import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../styles/login.css";

/* ---------------- Toast primitives (no library) ---------------- */
const Toast = ({ id, title, message, type = "error", onClose }) => {
  return (
    <div className={`toast ${type}`}>
      <div className="toast-bar" />
      <div className="toast-content">
        <div className="toast-title">{title}</div>
        {message && <div className="toast-message">{message}</div>}
      </div>
      <button
        className="toast-close"
        onClick={() => onClose(id)}
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
};

const ToastHost = ({ toasts, removeToast }) => {
  return (
    <div className="toast-host" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onClose={removeToast} />
      ))}
    </div>
  );
};
/* ---------------------------------------------------------------- */

const LoginPage = () => {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.resolvedLanguage || i18n.language || "en").split(
    "-"
  )[0];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // simple toast manager
  const [toasts, setToasts] = useState([]);
  const pushToast = (toastInput) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const toast = { id, ...toastInput };
    setToasts((prev) => [...prev, toast]);
    // auto-dismiss after 5s
    setTimeout(() => removeToast(id), 5000);
  };
  const removeToast = (id) =>
    setToasts((prev) => prev.filter((tt) => tt.id !== id));

  const navigate = useNavigate();

  const changeLang = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("app_lang", lng); // matches i18n detector config
    // Optional: force RTL/LTR globally
    document.documentElement.dir = lng === "ur" ? "rtl" : "ltr";
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = { email, password };

    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_BASE}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );

      const contentType = res.headers.get("content-type") || "";
      const raw = contentType.includes("application/json")
        ? await res.json().catch(() => null)
        : await res.text().catch(() => "");

      if (!res.ok) {
        const msg =
          (raw && (raw.error || raw.message)) ||
          (typeof raw === "string" && raw.trim()) ||
          `${res.status} ${res.statusText}`;

        pushToast({
          type: "error",
          title: t("toast.loginFailed"),
          message: msg, // backend message stays as-is
        });
        return;
      }

      const data = typeof raw === "string" && raw ? JSON.parse(raw) : raw;

      if (data?.name) {
        localStorage.setItem("user_id", data.id);
        localStorage.setItem("user_name", data.name);
        localStorage.setItem("tenant_id", data.tenant_id);
        localStorage.setItem("user_role", data.role);
      }

      pushToast({
        type: "success",
        title: t("toast.welcomeTitle"),
        message: t("toast.loginSuccess"),
      });

      window.electronAPI
        ?.getTokenCookie?.()
        .then((token) => {
          if (token) console.log("Token retrieved:", token);
          else console.log("Token not found");
        })
        .catch((err) => console.error("Error retrieving token:", err));

      navigate("/screenshot");
    } catch (err) {
      pushToast({
        type: "error",
        title: t("toast.networkError"),
        message: err?.message || "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-root">
      <div className="page-bg" aria-hidden="true" />
      <ToastHost toasts={toasts} removeToast={removeToast} />

      <section className="auth-shell" role="region" aria-label="Login panel">
        {/* Left: Hero */}
        <aside className="auth-hero" aria-hidden="true">
          <div className="hero-brand">
            <div className="hero-mark">TP</div>
            <div className="hero-brand-text">
              <div className="hero-brand-title">{t("appName")}</div>
              <div className="hero-brand-sub">{t("tagline")}</div>
            </div>
          </div>

          <div className="titl">
            <h2 className="hero-title">{t("welcomeBack")}</h2>
            <p className="hero-desc">{t("welcomeDesc")}</p>
          </div>

          {/* Mock dashboard preview (CSS-only, no images) */}
          <div className="hero-mock">
            <div className="mock-top">
              <div className="mock-pill" />
              <div className="mock-pill small" />
              <div className="mock-pill tiny" />
            </div>

            <div className="mock-cards">
              <div className="mock-card" />
              <div className="mock-card" />
              <div className="mock-card" />
            </div>

            <div className="mock-chart">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="mock-list">
              <div className="mock-row" />
              <div className="mock-row" />
              <div className="mock-row" />
            </div>
          </div>

          <div className="hero-badges">
            <div className="badge">{t("secureSession")}</div>
            <div className="badge">{t("fastLogin")}</div>
            <div className="badge">{t("teamReady")}</div>
          </div>
        </aside>

        {/* Right: Form */}
        <div className="auth-panel">
          <header className="panel-header">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <h1 className="panel-title">{t("signIn")}</h1>
                <p className="panel-subtitle">{t("subtitle")}</p>
              </div>

              {/* Language switcher */}
              <select
                value={
                  ["en", "bn", "ur"].includes(currentLang) ? currentLang : "en"
                }
                onChange={(e) => changeLang(e.target.value)}
                aria-label="Language"
                style={{
                  padding: "8px 10px",
                  borderRadius: 5,
                  backgroundColor: "#fff",
                  color: "#111",
                  border: "1px solid #ddd",
                  outline: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                }}
              >
                <option
                  value="en"
                  style={{ backgroundColor: "#fff", color: "#111" }}
                >
                  English
                </option>
                <option
                  value="bn"
                  style={{ backgroundColor: "#fff", color: "#111" }}
                >
                  বাংলা
                </option>
                <option
                  value="ur"
                  style={{ backgroundColor: "#fff", color: "#111" }}
                >
                  اردو
                </option>
              </select>
            </div>
          </header>

          <form className="auth-form" onSubmit={handleLogin} noValidate>
            <div className="field">
              <label htmlFor="email" className="label">
                {t("emailLabel")}
              </label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden="true">
                  ✉️
                </span>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder={t("emailPlaceholder")}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                  className="input"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password" className="label">
                {t("passwordLabel")}
              </label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden="true">
                  🔒
                </span>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder={t("passwordPlaceholder")}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  className="input"
                />
              </div>
            </div>

            <button
              type="submit"
              className={`btn-primary ${loading ? "is-loading" : ""}`}
              disabled={loading}
              aria-busy={loading ? "true" : "false"}
            >
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {t("loggingIn")}
                </>
              ) : (
                t("login")
              )}
            </button>
          </form>

          <footer className="auth-footer">
            <p className="muted">{t("noAccount")}</p>
          </footer>
        </div>
      </section>
    </main>
  );
};

export default LoginPage;
