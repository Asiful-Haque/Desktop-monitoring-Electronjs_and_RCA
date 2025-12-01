import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import "./Lang-switch.css";

export default function LanguageSwitcher({ className = "" }) {
  const { i18n, t } = useTranslation();
  const currentLang = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const safeLang = ["en", "bn", "ur"].includes(currentLang) ? currentLang : "en";

  useEffect(() => {
    document.documentElement.dir = safeLang === "ur" ? "rtl" : "ltr";
  }, [safeLang]);

  const changeLang = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("app_lang", lng);
  };

  return (
    <div className={`lang-wrap ${className}`}>
      <span className="lang-label">{t("lang.label")}</span>

      <div className="lang-field">
        <select
          className="lang-select"
          value={safeLang}
          onChange={(e) => changeLang(e.target.value)}
          aria-label={t("lang.aria")}
        >
          <option value="en">English</option>
          <option value="bn">বাংলা</option>
          <option value="ur">اردو</option>
        </select>

        {/* Default-like chevron */}
        <span className="lang-caret" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false">
            <path d="M5.5 7.5L10 12l4.5-4.5" />
          </svg>
        </span>
      </div>
    </div>
  );
}
