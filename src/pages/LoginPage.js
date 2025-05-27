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
    const result = await window.electronAPI.startOAuth();
    if (result.success) {
      alert("✅ OAuth Login Success!");
      window.location.href = "index.html";
      console.log("Token:", result.token);
    } else {
      alert("❌ OAuth Login Failed");
      console.error(result.error);
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