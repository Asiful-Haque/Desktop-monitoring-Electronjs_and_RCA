import React, { useEffect, useMemo, useState } from "react";
import "./addtaskmodal.css";
import Select from "react-select";
import toast from "../toaster";
import { useTranslation } from "react-i18next";

const statusOptions = ["in_progress", "completed"];
const priorityOptions = ["low", "medium", "high"];

const titleCase = (s) =>
  String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const AddTaskModal = ({
  open,
  onClose,
  projects = [],
  curruser,
  allusers = {},
}) => {
  const { t } = useTranslation();

  const userOptions = useMemo(() => {
    if (!curruser) return [];
    if (curruser?.role_name === "Developer") {
      return [{ id: curruser.user_id, name: curruser.username }];
    }
    return Object.values(allusers)
      .flat()
      .map((u) => ({ id: u.user_id, name: u.username }));
  }, [curruser, allusers]);

  const projectOptions = useMemo(
    () =>
      projects.map((p) => ({
        value: String(p.project_id),
        label: p.project_name, // keep project names as-is (from DB)
      })),
    [projects]
  );

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
        toast.warning(t("addTask.toast.fillAll"));
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
        toast.error(err?.message || t("addTask.toast.createFailed"));
        return;
      }

      const data = await res.json();
      const createdName = data?.task?.task_name || formData.task_name;
      toast.success(t("addTask.toast.created", { name: createdName }));
      onClose?.(true);
    } catch (error) {
      toast.error(error?.message || t("addTask.toast.networkError"));
    }
  };

  if (!open) return null;

  const selectedProject =
    projectOptions.find((o) => o.value === String(formData.project_name)) ||
    null;

  const rsStyles = {
    menuPortal: (base) => ({ ...base, zIndex: 2147483646 }),
    control: (base, state) => ({
      ...base,
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
      fontSize: "0.7rem",
      fontWeight: 500,
      minHeight: 35,
      height: 32,
      background: "rgba(255,255,255,0.07)",
      borderColor: state.isFocused
        ? "rgba(255,255,255,0.35)"
        : "rgba(255,255,255,0.12)",
      boxShadow: "none",
      ":hover": { borderColor: "rgba(255,255,255,0.25)" },
    }),
    valueContainer: (base) => ({
      ...base,
      padding: "0 12px",
      height: 32,
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
    }),
    singleValue: (base) => ({
      ...base,
      color: "#e7ecff",
      fontSize: "0.9rem",
      textAlign: "left",
      fontWeight: 500,
    }),
    placeholder: (base) => ({
      ...base,
      color: "#e7ecff",
      fontSize: "0.9rem",
      textAlign: "left",
      fontWeight: 500,
    }),
    input: (base) => ({ ...base, color: "#e7ecff", margin: 0, padding: 0 }),
    indicatorsContainer: (base) => ({ ...base, height: 32 }),
    dropdownIndicator: (base) => ({
      ...base,
      padding: "0 4px",
      svg: { width: "12px", height: "14px", strokeWidth: 2.2 },
      color: "#e7ecff",
      ":hover": { color: "#ffffff" },
    }),
    clearIndicator: (base) => ({
      ...base,
      padding: "0 4px",
      svg: { width: "12px", height: "12px" },
      color: "#e7ecff",
    }),
    menu: (base) => ({
      ...base,
      background: "#000000FF",
      border: "1px solid rgba(255,255,255,0.12)",
    }),
    menuList: (base) => ({
      ...base,
      maxHeight: 160,
      overflowY: "auto",
      padding: 0,
      scrollbarWidth: "none",
      msOverflowStyle: "none",
    }),
    option: (base, state) => ({
      ...base,
      fontSize: "0.9rem",
      padding: "6px 10px",
      textAlign: "left",
      background: state.isSelected
        ? "#1b2234"
        : state.isFocused
        ? "rgba(255,255,255,0.06)"
        : "transparent",
      color: "#e7ecff",
      cursor: "pointer",
    }),
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card" role="document">
        <div className="modal-head">
          <div>
            <div className="modal-title">{t("addTask.title")}</div>
            <div className="modal-sub">{t("addTask.subtitle")}</div>
          </div>
          <button
            className="modal-x"
            onClick={() => onClose?.(false)}
            aria-label={t("addTask.close")}
            title={t("addTask.close")}
          >
            ✕
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="frow">
            <label htmlFor="task_name">{t("addTask.fields.taskName")}</label>
            <input
              id="task_name"
              value={formData.task_name}
              onChange={(e) =>
                setFormData({ ...formData, task_name: e.target.value })
              }
              placeholder={t("addTask.placeholders.taskName")}
            />
          </div>

          <div className="frow">
            <label htmlFor="task_description">{t("addTask.fields.description")}</label>
            <input
              id="task_description"
              value={formData.task_description}
              onChange={(e) =>
                setFormData({ ...formData, task_description: e.target.value })
              }
              placeholder={t("addTask.placeholders.description")}
            />
          </div>

          <div className="frow">
            <label htmlFor="assigned_to">{t("addTask.fields.assignedTo")}</label>
            <select
              id="assigned_to"
              value={formData.assigned_to}
              onChange={(e) =>
                setFormData({ ...formData, assigned_to: e.target.value })
              }
            >
              <option value="">{t("addTask.placeholders.selectUser")}</option>
              {userOptions.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="frow">
            <label>{t("addTask.fields.timezone")}</label>
            <div className="readonly-field">
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </div>
          </div>

          <div className="frow">
            <label htmlFor="start_date">{t("addTask.fields.startDate")}</label>
            <input
              id="start_date"
              type="datetime-local"
              value={formData.start_date}
              onChange={(e) =>
                setFormData({ ...formData, start_date: e.target.value })
              }
            />
          </div>

          <div className="frow">
            <label htmlFor="deadline">{t("addTask.fields.deadline")}</label>
            <input
              id="deadline"
              type="datetime-local"
              value={formData.deadline}
              onChange={(e) =>
                setFormData({ ...formData, deadline: e.target.value })
              }
            />
          </div>

          <div className="frow">
            <label htmlFor="status">{t("addTask.fields.status")}</label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value })
              }
            >
              <option value="">{t("addTask.placeholders.selectStatus")}</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {t(`addTask.status.${s}`, { defaultValue: titleCase(s) })}
                </option>
              ))}
            </select>
          </div>

          <div className="frow">
            <label htmlFor="project_name">{t("addTask.fields.project")}</label>
            <Select
              inputId="project_name"
              classNamePrefix="rs"
              value={selectedProject}
              onChange={(opt) =>
                setFormData({ ...formData, project_name: opt?.value || "" })
              }
              options={projectOptions}
              placeholder={t("addTask.placeholders.selectProject")}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              isSearchable
              styles={rsStyles}
            />
          </div>

          <div className="frow">
            <label htmlFor="priority">{t("addTask.fields.priority")}</label>
            <select
              id="priority"
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: e.target.value })
              }
            >
              <option value="">{t("addTask.placeholders.selectPriority")}</option>
              {priorityOptions.map((p) => (
                <option key={p} value={p}>
                  {t(`addTask.priority.${p}`, { defaultValue: titleCase(p) })}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-foot">
            <button
              type="button"
              className="btn ghost"
              onClick={() => onClose?.(false)}
            >
              {t("common.cancel")}
            </button>
            <button type="submit" className="btnaddtask">
              {t("addTask.actions.addTask")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTaskModal;
