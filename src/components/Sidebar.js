


import React, { useState, useCallback } from "react";
import "./sidebar.css";

const Sidebar = ({
  onCreateTask,
  onLogout,
  sections = [],
  activeKey = "",
  onSelect = () => {},
}) => {
  // track open/closed menus by section key
  const [open, setOpen] = useState({});

  const toggle = useCallback((key) => {
    setOpen((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const handleSectionClick = (sec) => {
    if (sec.children?.length) {
      toggle(sec.key);
    } else {
      onSelect(sec.key);
    }
  };

  const handleChildClick = (parentKey, child) => {
    if (child.action === "create-task") {
      onCreateTask?.();
      // ensure parent looks selected
      onSelect?.(parentKey);
    } else {
      onSelect?.(child.key);
    }
  };

  return (
    <aside className="app-sidebar">
      <div className="sb-brand">Task Pro !!</div>

      <nav className="sb-nav">
        {sections.map((sec) => {
          const isActive = activeKey === sec.key;
          const hasKids = Array.isArray(sec.children) && sec.children.length > 0;
          const isOpen = !!open[sec.key];

          return (
            <div className="sb-item" key={sec.key}>
              <button
                className={`sb-link ${isActive ? "active" : ""} ${hasKids ? "has-kids" : ""}`}
                onClick={() => handleSectionClick(sec)}
                aria-expanded={hasKids ? isOpen : undefined}
                aria-controls={hasKids ? `subnav-${sec.key}` : undefined}
              >
                {sec.icon ? <span className="sb-ic">{sec.icon}</span> : null}
                <span className="sb-label">{sec.label}</span>
                {hasKids ? (
                  <span className={`sb-caret ${isOpen ? "open" : ""}`} aria-hidden>
                    ▸
                  </span>
                ) : null}
              </button>

              {hasKids ? (
                <div
                  id={`subnav-${sec.key}`}
                  className={`sb-subnav ${isOpen ? "open" : ""}`}
                  role="region"
                  aria-label={`${sec.label} submenu`}
                >
                  {sec.children.map((child) => (
                    <button
                      key={child.key}
                      className={`sb-sublink ${activeKey === child.key ? "active" : ""}`}
                      onClick={() => handleChildClick(sec.key, child)}
                    >
                      {child.icon ? <span className="sb-ic">{child.icon}</span> : null}
                      <span>{child.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="sb-actions">
        <button className="btn wfull ghost" onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
