import React from "react";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function DashboardHeader({ t, user_name, getRoleLower }) {
  return (
    <header className="dashboard-header">
      <div className="dh-left">
        <h1 className="app-title">
          {t("dashboard.title", { defaultValue: "Time Capture Dashboard" })}
        </h1>
        <p className="app-subtitle">
          {t("dashboard.subtitle", {
            defaultValue:
              "Track your work time with automatic screenshots and smart approvals.",
          })}
        </p>
      </div>

      <div className="dh-right">
        <LanguageSwitcher className="dh-lang" />
        <div className="user-pill">
          <div className="user-avatar">
            {(user_name || "U").charAt(0).toUpperCase()}
          </div>
          <div className="user-meta">
            <span className="user-name">
              {user_name || t("dashboard.userFallback", { defaultValue: "User" })}
            </span>
            <span className="user-role">
              {getRoleLower() ||
                t("dashboard.roleFallback", {
                  defaultValue: "Team Member",
                })}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
