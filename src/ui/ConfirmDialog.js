import React from "react";

const ConfirmDialog = ({
  open,
  title,
  subtitle,
  onCancel,
  onConfirm,
  cancelText,
  okText,
}) => {
  if (!open) return null;
  return (
    <div className="confirm-backdrop" role="dialog" aria-modal="true">
      <div className="confirm-card">
        <h3 className="confirm-title">{title}</h3>
        {subtitle ? <p className="confirm-subtitle">{subtitle}</p> : null}
        <div className="confirm-actions">
          <button className="btn ghost" onClick={onCancel} autoFocus>
            {cancelText}
          </button>
          <button className="btn success" onClick={onConfirm}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
