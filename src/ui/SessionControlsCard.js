import React from "react";

export default function SessionControlsCard({
  t,
  isCapturing,
  isPaused,
  approvalLoading,
  isFreelancer,
  approvalStatus,
  handleStart,
  handlePause,
  handleResume,
  handleFinish,
  elapsedSeconds,
  formatTime,
}) {
  return (
    <div className="card card-controls">
      <div className="card-header">
        <h2 className="card-title">
          {t("dashboard.controls.title", { defaultValue: "Session Controls" })}
        </h2>
      </div>

      <div className="card-body">
        <div className="btn-row">
          {!isCapturing && !isPaused && (
            <button
              id="screenshotBtn"
              className="btn-primary"
              onClick={handleStart}
              disabled={approvalLoading}
            >
              {t("dashboard.controls.start", { defaultValue: "Start Recording" })}
            </button>
          )}

          <button
            id="stopBtn"
            className="btn-warning"
            onClick={isPaused ? handleResume : handlePause}
            disabled={(!isPaused && isFreelancer && approvalStatus === 1) || false}
          >
            {isPaused
              ? t("dashboard.controls.resume", { defaultValue: "Resume" })
              : t("dashboard.controls.pause", { defaultValue: "Pause" })}
          </button>

          <button id="finishBtn" className="btn-success" onClick={() => handleFinish()}>
            {t("dashboard.controls.submit", { defaultValue: "Submit Task" })}
          </button>
        </div>

        <div className="timer-chip">
          <span className="timer-label">
            {t("dashboard.controls.captureDuration", { defaultValue: "Capture Duration" })}
          </span>
          <span className="timer-value">{formatTime(elapsedSeconds)}</span>
        </div>
      </div>
    </div>
  );
}
