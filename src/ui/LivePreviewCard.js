import React from "react";

export default function LivePreviewCard({ t, previewRef }) {
  return (
    <div className="card card-preview">
      <div className="card-header">
        <h2 className="card-title">
          {t("dashboard.preview.title", { defaultValue: "Live Screen Preview" })}
        </h2>
        <span className="card-subtitle">
          {t("dashboard.preview.subtitle", {
            defaultValue: "Screenshots are taken automatically when you're active.",
          })}
        </span>
      </div>

      <div className="card-body preview-body" ref={previewRef} />
    </div>
  );
}
