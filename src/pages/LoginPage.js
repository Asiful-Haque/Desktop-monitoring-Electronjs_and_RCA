import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
      <button className="toast-close" onClick={() => onClose(id)} aria-label="Close">×</button>
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // simple toast manager
  const [toasts, setToasts] = useState([]);
  const pushToast = (t) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const toast = { id, ...t };
    setToasts((prev) => [...prev, toast]);
    // auto-dismiss after 5s
    setTimeout(() => removeToast(id), 5000);
  };
  const removeToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const navigate = useNavigate();

const handleLogin = async (e) => {
  e.preventDefault();
  setLoading(true);
  const payload = { email, password };
  console.log("calling hte api with ",email, password);
  try {
    const res = await fetch(`${process.env.REACT_APP_API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

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
        title: "Login failed",
        message: msg,
      });
      setLoading(false);
      return;
    }

    const data = typeof raw === "string" && raw ? JSON.parse(raw) : raw;
    if (data?.name) {
      localStorage.setItem("user_id", data.id);
      localStorage.setItem("user_name", data.name);
    }
    console.log("data is ", data);
    pushToast({ type: "success", title: "Welcome back!", message: "Login successful." });

    // Corrected: Directly use the method
    console.log("Calling getTokenCookie");

    window.electronAPI.getTokenCookie() //if you want to check cookie is present or not.......
      .then((token) => {
        if (token) {
          console.log("Token retrieved:", token);  // This will log the token in the main process
        } else {
          console.log("Token not found");
        }
      })
      .catch((err) => {
        console.error("Error retrieving token:", err);
      });

    navigate("/screenshot");
  } catch (err) {
    pushToast({
      type: "error",
      title: "Network error",
      message: err?.message || "Something went wrong.",
    });
  } finally {
    setLoading(false);
  }
};



  

  return (
    <main className="auth-root">
      <div className="bg-ornament" aria-hidden="true" />
      <ToastHost toasts={toasts} removeToast={removeToast} />

      <section className="auth-card" role="region" aria-label="Login panel">
        <header className="auth-header">
          <div className="brand">
            <div className="brand-icon" aria-hidden="true">✓</div>
            <div className="brand-text">
              <h1 className="brand-title">TaskPro</h1>
              <p className="brand-subtitle">Welcome back. Let’s get productive.</p>
            </div>
          </div>
        </header>

        <form className="auth-form" onSubmit={handleLogin} noValidate>
          <div className="field">
            <label htmlFor="email" className="label">Email</label>
            <div className="input-wrap">
              <span className="input-icon" aria-hidden="true">✉️</span>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="you@company.com"
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
            <label htmlFor="password" className="label">Password</label>
            <div className="input-wrap">
              <span className="input-icon" aria-hidden="true">🔒</span>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="••••••••"
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
                Logging in…
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>

        <footer className="auth-footer">
          <p className="muted">
            If you don't have an account, please contact your administrator.
          </p>
        </footer>
      </section>
    </main>
  );
};

export default LoginPage;
