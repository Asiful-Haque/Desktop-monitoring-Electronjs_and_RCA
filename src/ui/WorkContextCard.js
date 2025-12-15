import React from "react";

export default function WorkContextCard({
  t,
  projects,
  filteredTasks,
  selectedProjectId,
  selectedTaskId,
  handleProjectFilterChange,
  handleTaskChange,
  isCapturing,
  isPaused,
  blockSelections,
  approvalLoading,
  isFreelancer,
  approvalStatus,
}) {
  return (
    <div className="card card-filters">
      <div className="card-header">
        <h2 className="card-title">
          {t("dashboard.workContext.title", { defaultValue: "Work Context" })}
        </h2>
        <span className="card-tag">
          {t("dashboard.workContext.tag", { defaultValue: "Live" })}
        </span>
      </div>

      <div className="card-body">
        <div className="filter-grid">
          <div className="filter-item">
            <label className="filter-label">
              {t("dashboard.workContext.filterProject.label", {
                defaultValue: "Filter by Project",
              })}
            </label>
            <select
              value={selectedProjectId}
              onChange={handleProjectFilterChange}
              className="scrollable-select"
              disabled={isCapturing || isPaused || blockSelections || approvalLoading}
            >
              <option value="">
                {t("dashboard.workContext.filterProject.all", {
                  defaultValue: "All Projects",
                })}
              </option>
              {projects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.project_name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label className="filter-label">
              {t("dashboard.workContext.task.label", {
                defaultValue: "Choose Your Task",
              })}
            </label>
            <select
              value={selectedTaskId}
              onChange={handleTaskChange}
              className="scrollable-select"
              disabled={isCapturing || isPaused || blockSelections || approvalLoading}
            >
              <option value="">
                {filteredTasks.length
                  ? t("dashboard.workContext.task.select", { defaultValue: "Select Task" })
                  : t("dashboard.workContext.task.none", { defaultValue: "No tasks available" })}
              </option>

              {filteredTasks.map((task) => (
                <option key={task?.id ?? task?.task_id ?? task?._id} value={task?.id ?? task?.task_id ?? task?._id}>
                  {task.task_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isFreelancer && approvalStatus === 1 && (
          <p className="selection-warning" role="alert">
            {t("dashboard.workContext.warning", {
              defaultValue: "Let Admin approve previous Payments before",
            })}
          </p>
        )}
      </div>
    </div>
  );
}
