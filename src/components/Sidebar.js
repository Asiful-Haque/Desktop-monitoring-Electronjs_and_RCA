import React from "react";
import "./sidebar.css";

const Sidebar = ({
  onCreateTask,
  onLogout,
  sections = [],
  activeKey = "",
  onSelect = () => {},
}) => {
  return (
    <aside className="app-sidebar">
      <div className="sb-brand">Task Pro !!</div>

      <nav className="sb-nav">
        {sections.map((sec) => (
          <button
            key={sec.key}
            className={`sb-link ${activeKey === sec.key ? "active" : ""}`}
            onClick={() => onSelect(sec.key)}
          >
            {sec.icon ? <span className="sb-ic">{sec.icon}</span> : null}
            <span>{sec.label}</span>
          </button>
        ))}
      </nav>

      <div className="sb-actions">
        <button className="btn wfull primary" onClick={onCreateTask}>
          + Create Task
        </button>
        <button className="btn wfull ghost" onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
