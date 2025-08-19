import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    console.log(email, password);
    const payload = { email, password };
    try {
      const res = await fetch("https://taskpro.twinstack.net/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // ✅ allow httpOnly cookie from the API
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json().catch(() => null)
        : await res.text().catch(() => "");

      if (!res.ok) {
        console.error("Login failed:", res.status, res.statusText, body);
        alert(`❌ Login failed: ${body?.error || body || `${res.status} ${res.statusText}`}`);
        return;
      }

      // ✅ Treat 2xx as success since server sets an httpOnly cookie
      const data = typeof body === "string" ? JSON.parse(body) : body;
      if (data?.name) {
        localStorage.setItem("user_id", data.id);
        localStorage.setItem("user_name", data.name);
      }
      console.log("Data is from web app", data);

      navigate("/screenshot");
    } catch (err) {
      console.error("Exception during login:", err);
      alert(`❌ Login error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async () => {
    try {
      if (!window.electronAPI || typeof window.electronAPI.startOAuth !== "function") {
        console.error("❌ electronAPI or startOAuth is not available");
        alert("Electron API is not available. Make sure you're running in Electron.");
        return;
      }

      const result = await window.electronAPI.startOAuth();

      if (result && result.success) {
        alert("✅ OAuth Login Success!");
        console.log("Token:", result.token);
        window.location.href = "index.html";
      } else {
        console.error("OAuth login failed:", result?.error || "Unknown error");
        alert("❌ OAuth Login Failed");
      }
    } catch (err) {
      console.error("❌ Exception during OAuth:", err);
      alert("❌ OAuth Login Exception: " + err.message);
    }
  };

  return (
    <div className="main-container">
      <div className="login-container">
        <h1>Login to Start</h1>
        <form onSubmit={handleLogin}>
          <label htmlFor="email">Email:</label>
          <input
            type="text"
            id="email"
            name="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <br />
          <br />

          <label htmlFor="password">Password:</label>
          <input
            type="password"
            id="password"
            name="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <br />

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
          {/* <button
            type="button"
            className="login-button"
            onClick={handleOAuthLogin}
            disabled={loading}
          >
            Login with Google
          </button> */}
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
