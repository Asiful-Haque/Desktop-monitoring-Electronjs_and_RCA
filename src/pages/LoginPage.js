import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (username === "admin" && password === "1234") {
      navigate("/screenshot"); // Or navigate using React Router if SPA
    } else {
      alert("Invalid credentials");
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
          <label htmlFor="username">Username:</label>
          <input
            type="text"
            id="username"
            name="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
          />
          <br />

          <button type="submit" className="login-button">
            Login
          </button>
          <button
            type="button"
            className="login-button"
            onClick={handleOAuthLogin}
          >
            Login with Google
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;