import React, { useEffect, useMemo, useState } from "react";
import "./addtaskmodal.css";

const statusOptions = ["in_progress", "completed"];
const priorityOptions = ["low", "medium", "high"];

const AddTaskModal = ({
  open,
  onClose,
  projects = [],
  curruser,
  allusers = {},
}) => {
  const userOptions = useMemo(() => {
    if (!curruser) return [];
    // If current user is a Developer: restrict options to self
    if (curruser?.role === "Developer") {
      return [{ id: curruser.id, name: curruser.name }];
    }
    // Else flatten allusers (assuming your provided shape)
    return Object.values(allusers)
      .flat()
      .map((u) => ({ id: u.user_id, name: u.username }));
  }, [curruser, allusers]);

  const [formData, setFormData] = useState({
    task_name: "",
    task_description: "",
    assigned_to: "",
    start_date: "",
    deadline: "",
    status: "",
    project_name: "",
    priority: "",
  });

  useEffect(() => {
    if (!open) {
      // reset when closing
      setFormData({
        task_name: "",
        task_description: "",
        assigned_to: "",
        start_date: "",
        deadline: "",
        status: "",
        project_name: "",
        priority: "",
      });
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // basic validation
    const required = [
      "task_name",
      "task_description",
      "assigned_to",
      "start_date",
      "deadline",
      "status",
      "project_name",
      "priority",
    ];
    for (const k of required) {
      if (!formData[k]) {
        alert("Please fill in all fields.");
        return;
      }
    }

    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err?.message || "Failed to create task");
        return;
      }
      const data = await res.json();
      alert(`Task "${data?.task?.task_name || formData.task_name}" created`);
      onClose?.(true); // signal success
    } catch (error) {
      alert(error?.message || "Network error");
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card" role="document">
        <div className="modal-head">
          <div>
            <div className="modal-title">Add New Task</div>
            <div className="modal-sub">Create a new task for your project</div>
          </div>
          <button className="modal-x" onClick={() => onClose?.(false)} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="frow">
            <label htmlFor="task_name">Task Name</label>
            <input
              id="task_name"
              value={formData.task_name}
              onChange={(e) => setFormData({ ...formData, task_name: e.target.value })}
              placeholder="Enter task name"
            />
          </div>

          <div className="frow">
            <label htmlFor="task_description">Description</label>
            <input
              id="task_description"
              value={formData.task_description}
              onChange={(e) =>
                setFormData({ ...formData, task_description: e.target.value })
              }
              placeholder="Enter task description"
            />
          </div>

          <div className="frow">
            <label htmlFor="assigned_to">Assigned To</label>
            <select
              id="assigned_to"
              value={formData.assigned_to}
              onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
            >
              <option value="">Select user</option>
              {userOptions.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="frow">
            <label>Timezone</label>
            <div className="readonly-field">
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </div>
          </div>

          <div className="frow">
            <label htmlFor="start_date">Start Date</label>
            <input
              id="start_date"
              type="datetime-local"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            />
          </div>

          <div className="frow">
            <label htmlFor="deadline">Deadline</label>
            <input
              id="deadline"
              type="datetime-local"
              value={formData.deadline}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            />
          </div>

          <div className="frow">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="">Select status</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div className="frow">
            <label htmlFor="project_name">Project</label>
            <select
              id="project_name"
              value={formData.project_name}
              onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.project_id} value={String(p.project_id)}>
                  {p.project_name}
                </option>
              ))}
            </select>
          </div>

          <div className="frow">
            <label htmlFor="priority">Priority</label>
            <select
              id="priority"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            >
              <option value="">Select priority</option>
              {priorityOptions.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={() => onClose?.(false)}>
              Cancel
            </button>
            <button type="submit" className="btn danger">
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTaskModal;
