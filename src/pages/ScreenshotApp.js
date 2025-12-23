import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "../styles/screenshotapp.css";

import Sidebar from "../components/Sidebar";
import AddTaskModal from "../components/AddTaskModal";

import ConfirmDialog from "../ui/ConfirmDialog";
import DashboardHeader from "../ui/DashboardHeader";
import WorkContextCard from "../ui/WorkContextCard";
import SessionControlsCard from "../ui/SessionControlsCard";
import LivePreviewCard from "../ui/LivePreviewCard";

import useElapsedSeconds from "../hooks/useElapsedSeconds";
import useSessionTimer from "../hooks/useSessionTimer";
import useIdleSampling from "../hooks/useIdleSampling";
import useAppData from "../hooks/useAppData";
import useApprovalStatus from "../hooks/useApprovalStatus";
import useDraftManager from "../hooks/useDraftManager";
import useScreenPreview from "../hooks/useScreenPreview";
import useScreenshotCycle from "../hooks/useScreenshotCycle";

const ScreenshotApp = () => {
  const { t } = useTranslation();

  // refs used by preview + capture
  const videoRef = useRef([]);
  const previewRef = useRef(null);
  const streamsRef = useRef([]);

  const streamRef = useRef(null); // preserved quit/logout logic

  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const isCapturingRef = useRef(false);
  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  const { elapsedSeconds, setElapsedSeconds, elapsedSecondsRef } = useElapsedSeconds();
  const { startTimer, stopTimer } = useSessionTimer(setElapsedSeconds);

  const idle = useIdleSampling();

  // DATA
  const API_BASE = process.env.REACT_APP_API_BASE;
  const { taskData, projects, currUser, allUsers, fetchTasks } = useAppData(API_BASE);

  // SELECTIONS
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTaskName, setSelectedTaskName] = useState("");

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Modal
  const [activeSection, setActiveSection] = useState("dashboard");
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  // Confirm dialogs
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // -----------------------------
  // ACTIVE segments (deductions applied)
  // -----------------------------
  const startAtRef = useRef(null);
  const segmentsRef = useRef([]);

  // -----------------------------
  // RAW segments (no deductions) -> for "actual start/end"
  // -----------------------------
  const rawStartAtRef = useRef(null);
  const rawSegmentsRef = useRef([]);

  // UI display for "actual start/end"
  const [sessionWindowStart, setSessionWindowStart] = useState(null);
  const [sessionWindowEnd, setSessionWindowEnd] = useState(null);

  // tick so counters update while recording
  const [uiNowMs, setUiNowMs] = useState(Date.now());
  useEffect(() => {
    if (!isCapturing) return;
    const id = setInterval(() => setUiNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isCapturing]);

  // helpers
  const user_id = localStorage.getItem("user_id");
  const user_name = localStorage.getItem("user_name");

  const getTaskId = (tt) => tt?.id ?? tt?.task_id ?? tt?._id;
  const pad = (n) => String(n).padStart(2, "0");

  const formatTime = (total) => {
    const s = Math.max(0, Math.floor(total || 0));
    const hh = pad(Math.floor(s / 3600));
    const mm = pad(Math.floor((s % 3600) / 60));
    const ss = pad(s % 60);
    return `${hh}:${mm}:${ss}`;
  };

  const toSeconds = (val) => {
    if (val === null || val === undefined) return 0;
    const n = parseInt(String(val).trim(), 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  const formatDateYMD = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };

  const toIsoNoMs = (d) =>
    (d instanceof Date ? d : new Date(d)).toISOString().replace(/\.\d{3}Z$/, "Z");

  const getUserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const getUserOffsetMinutes = () => new Date().getTimezoneOffset();

  // ✅ REAL-TIME LOGGER (4.35.10)
  const formatClock = (d = new Date()) => {
    let h = d.getHours();
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  };

  const logClockAt = (label, atDate, extra = {}) => {
    const d = atDate instanceof Date ? atDate : new Date();
    console.log(
      `⏱️ ${label} @ ${formatClock(d)} | iso=${d.toISOString()} | tz=${getUserTz()} | offsetMin=${getUserOffsetMinutes()}`,
      extra
    );
  };

  const showToast = (message) => {
    const toast = document.createElement("div");
    toast.className = "custom-toast";
    toast.innerText = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.parentNode?.removeChild(toast), 300);
    }, 2500);
  };

  const calcSecondsFrom = (segments, runningStart, now) => {
    const base = (segments || []).reduce((acc, s) => {
      const st = s?.startAt ? new Date(s.startAt).getTime() : 0;
      const en = s?.endAt ? new Date(s.endAt).getTime() : 0;
      if (st && en && en > st) return acc + Math.floor((en - st) / 1000);
      return acc;
    }, 0);

    if (runningStart) {
      const st = new Date(runningStart).getTime();
      const en = new Date(now).getTime();
      if (st && en && en > st) return base + Math.floor((en - st) / 1000);
    }
    return base;
  };

  // For UI (this current session only)
  const activeSessionSeconds = useMemo(() => {
    const now = new Date(uiNowMs);
    return calcSecondsFrom(segmentsRef.current, startAtRef.current, now);
  }, [uiNowMs]);

  const rawSessionSeconds = useMemo(() => {
    const now = new Date(uiNowMs);
    return calcSecondsFrom(rawSegmentsRef.current, rawStartAtRef.current, now);
  }, [uiNowMs]);

  const idleSessionSeconds = Math.max(0, rawSessionSeconds - activeSessionSeconds);

  // ✅ idle dialog actions (no duplicate deduction logic here)
  const handleIdleWasWorking = () => {
    idle.confirmIdleAsWorking();
  };

  const handleIdleWasBreak = () => {
    idle.applyBreakDeduction({ startAtRef, elapsedSecondsRef });
  };

  // approval
  const approval = useApprovalStatus({ API_BASE, currUser });
  const {
    isFreelancer,
    approvalStatus,
    approvalLoading,
    blockSelections,
    fetchApprovalStatus,
    getRoleLower,
  } = approval;

  // backend: task-flagger
  const updateTaskFlagger = async (taskId, flagValue) => {
    if (!taskId && taskId !== 0 && taskId !== "0") return;

    try {
      const res = await fetch(`${API_BASE}/api/tasks/task-flagger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          user_id: Number(user_id),
          edit_task_id: Number(taskId),
          flagger: Number(flagValue),
        }),
      });

      const data = await res.json();
      if (!res.ok) console.error("Flagger API failed:", data);
    } catch (err) {
      console.error("Flagger API error:", err);
    }
  };

  // preview setup
  useScreenPreview({ previewRef, videoRef, streamsRef });

  // capture implementation
  const evaluateAndCapture = useCallback(async () => {
    const videoElements = videoRef.current;
    if (!videoElements || videoElements.length < 2) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const width = videoElements[0].videoWidth + videoElements[1].videoWidth;
    const height = Math.max(videoElements[0].videoHeight, videoElements[1].videoHeight);

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(videoElements[0], 0, 0, videoElements[0].videoWidth, videoElements[0].videoHeight);
    ctx.drawImage(videoElements[1], videoElements[0].videoWidth, 0, videoElements[1].videoWidth, videoElements[1].videoHeight);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    try {
      await window.electronAPI.saveImage(uint8Array);
    } catch (err) {
      console.error("❌ Error during screenshot process:", err);
    }
  }, []);

  const shots = useScreenshotCycle({ isCapturingRef, evaluateAndCapture });

  // draft manager (ACTIVE + RAW)
  const DRAFT_KEY = "taskData";
  const draft = useDraftManager({
    DRAFT_KEY,
    API_BASE,
    t,
    showToast,

    selectedTaskId,
    selectedTaskName,
    setSelectedTaskId,
    setSelectedTaskName,
    setSelectedProjectId,

    setIsCapturing,
    setIsPaused,
    isCapturing,
    isPaused,

    elapsedSecondsRef,
    setElapsedSeconds,

    segmentsRef,
    startAtRef,
    rawSegmentsRef,
    rawStartAtRef,

    isCapturingRef,

    taskData,
    getTaskId,
    toSeconds,

    stopTimer,
    stopSampling: idle.stopSampling,
    stopScreenshotCycle: shots.stopScreenshotCycle,

    updateTaskFlagger,
  });

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    if (!selectedProjectId) return taskData;
    return taskData.filter((tt) => String(tt.project_id) === String(selectedProjectId));
  }, [taskData, selectedProjectId]);

  // If selected task disappears from filter
  useEffect(() => {
    if (
      selectedTaskId &&
      !filteredTasks.some((tt) => String(getTaskId(tt)) === String(selectedTaskId))
    ) {
      setSelectedTaskId("");
      setSelectedTaskName("");
      setElapsedSeconds(0);

      setSessionWindowStart(null);
      setSessionWindowEnd(null);

      startAtRef.current = null;
      rawStartAtRef.current = null;

      segmentsRef.current = [];
      rawSegmentsRef.current = [];
    }
  }, [filteredTasks, selectedTaskId, setElapsedSeconds]);

  // Selecting a task MUST NOT save/update time. UI only.
  const handleTaskChange = (e) => {
    if (blockSelections) {
      showToast(
        t("toast.approvalBlock", { defaultValue: "Let Admin approve previous Payments before" })
      );
      return;
    }

    const newId = e.target.value;
    if (String(newId) === String(selectedTaskId)) return;

    // reset session data when changing task
    setSessionWindowStart(null);
    setSessionWindowEnd(null);

    startAtRef.current = null;
    rawStartAtRef.current = null;

    segmentsRef.current = [];
    rawSegmentsRef.current = [];

    const prevId = selectedTaskId;
    if (prevId) updateTaskFlagger(prevId, 0);

    if (!newId) {
      setSelectedTaskId("");
      setSelectedTaskName("");
      setElapsedSeconds(0);
      return;
    }

    setSelectedTaskId(newId);
    updateTaskFlagger(newId, 1);

    const serverTask =
      taskData.find((tt) => String(getTaskId(tt)) === String(newId)) || null;

    setSelectedTaskName(serverTask?.task_name ?? "");
    setElapsedSeconds(toSeconds(serverTask?.last_timing));
  };

  const handleProjectFilterChange = (e) => {
    if (blockSelections) {
      showToast(
        t("toast.approvalBlock", { defaultValue: "Let Admin approve previous Payments before" })
      );
      return;
    }
    setSelectedProjectId(e.target.value);
  };

  // Start
  const handleStart = async () => {
    const clickedAt = new Date();
    logClockAt("START RECORDING clicked", clickedAt, {
      selectedTaskId,
      selectedProjectId,
      isCapturing,
      isPaused,
    });

    if (isFreelancer && currUser?.user_id) {
      const allowed = await fetchApprovalStatus(currUser.user_id);
      if (!allowed) {
        showToast(
          t("toast.approvalBlock", { defaultValue: "Let Admin approve previous Payments before" })
        );
        return;
      }
    }

    if (!selectedTaskId) {
      showToast(t("toast.selectTaskFirst", { defaultValue: "⚠ Please select a task before starting!" }));
      return;
    }

    // set RAW + ACTIVE start at click-time
    startAtRef.current = clickedAt;      // active start (adjusted later for break)
    rawStartAtRef.current = clickedAt;   // raw start (never adjusted)

    if (!sessionWindowStart) setSessionWindowStart(clickedAt);
    setSessionWindowEnd(null);

    idle.resetIdleCounters();

    if (!isCapturing) {
      setIsCapturing(true);
      setIsPaused(false);
      startTimer();
      idle.startSampling();
      shots.startScreenshotCycle();
    }
  };

  // Pause
  const handlePause = () => {
    const pausedAt = new Date();

    if (isFreelancer && approvalStatus === 1) {
      showToast(
        t("toast.approvalBlock", { defaultValue: "Let Admin approve previous Payments before" })
      );
      return;
    }

    // ACTIVE segment
    if (startAtRef.current) {
      segmentsRef.current.push({
        startAt: new Date(startAtRef.current),
        endAt: pausedAt,
      });
      startAtRef.current = null;
    }

    // RAW segment
    if (rawStartAtRef.current) {
      rawSegmentsRef.current.push({
        startAt: new Date(rawStartAtRef.current),
        endAt: pausedAt,
      });
      rawStartAtRef.current = null;
    }

    setSessionWindowEnd(pausedAt);

    setIsCapturing(false);
    setIsPaused(true);
    stopTimer();
    idle.stopSampling();
    shots.stopScreenshotCycle();

    if (selectedTaskId && (rawSegmentsRef.current || []).length > 0) {
      draft.persistDraft(true);
    }
  };

  // Resume
  const handleResume = async () => {
    const resumedAt = new Date();

    if (isFreelancer && currUser?.user_id) {
      const allowed = await fetchApprovalStatus(currUser.user_id);
      if (!allowed) {
        showToast(
          t("toast.approvalBlock", { defaultValue: "Let Admin approve previous Payments before" })
        );
        return;
      }
    }

    startAtRef.current = resumedAt;
    rawStartAtRef.current = resumedAt;

    if (!sessionWindowStart) setSessionWindowStart(resumedAt);
    setSessionWindowEnd(null);

    setIsCapturing(true);
    setIsPaused(false);
    startTimer();
    idle.startSampling();
    shots.startScreenshotCycle();
  };

  // Finish (Submit)
  const handleFinish = async (opts = {}) => {
    const silentAutoSubmit = !!opts.silentAutoSubmit;
    const submitClickedAt = new Date();

    // close running segments at exact submit click time
    if (startAtRef.current) {
      segmentsRef.current.push({
        startAt: new Date(startAtRef.current),
        endAt: submitClickedAt,
      });
      startAtRef.current = null;
    }
    if (rawStartAtRef.current) {
      rawSegmentsRef.current.push({
        startAt: new Date(rawStartAtRef.current),
        endAt: submitClickedAt,
      });
      rawStartAtRef.current = null;
    }

    setSessionWindowEnd(submitClickedAt);

    // logger after finalize
    logClockAt("SUBMIT clicked", submitClickedAt, {
      silentAutoSubmit,
      selectedTaskId,
      selectedProjectId,
      activeSegmentsCount: segmentsRef.current?.length || 0,
      rawSegmentsCount: rawSegmentsRef.current?.length || 0,
    });

    // Gate on RAW window existence
    if ((rawSegmentsRef.current || []).length === 0) {
      if (!silentAutoSubmit) {
        showToast(t("toast.noTimeCaptured", { defaultValue: "No time captured. Please Start first." }));
      }
      return;
    }

    setIsCapturing(false);
    setIsPaused(silentAutoSubmit ? false : true);
    stopTimer();
    idle.stopSampling();
    shots.stopScreenshotCycle();

    const theTask = taskData.find((tt) => String(getTaskId(tt)) === String(selectedTaskId));
    if (!theTask) {
      draft.persistDraft(true, { reason: "task_not_found" });
      if (!silentAutoSubmit) {
        showToast(t("toast.taskNotFound", { defaultValue: "Selected task not found." }));
      }
      return;
    }

    const developerId = Number(localStorage.getItem("user_id") || 0);
    const tenant_id_local = Number(localStorage.getItem("tenant_id") || 0);

    const user_tz = getUserTz();
    const user_offset_minutes = getUserOffsetMinutes();

    // ✅ FINAL logger
    const finalActiveSeconds = calcSecondsFrom(segmentsRef.current, null, submitClickedAt);
    const finalRawSeconds = calcSecondsFrom(rawSegmentsRef.current, null, submitClickedAt);
    const finalIdleSeconds = Math.max(0, finalRawSeconds - finalActiveSeconds);

    const rawStarts = (rawSegmentsRef.current || [])
      .map((s) => (s?.startAt ? new Date(s.startAt).getTime() : null))
      .filter(Boolean);
    const rawEnds = (rawSegmentsRef.current || [])
      .map((s) => (s?.endAt ? new Date(s.endAt).getTime() : null))
      .filter(Boolean);

    const actualStartIso = rawStarts.length ? new Date(Math.min(...rawStarts)).toISOString() : null;
    const actualEndIso = rawEnds.length ? new Date(Math.max(...rawEnds)).toISOString() : null;

    console.log("✅ FINAL (Actual window vs Active time) -------------------");
    console.log("actual_start (RAW):", actualStartIso);
    console.log("actual_end   (RAW):", actualEndIso);
    console.log("raw_session_seconds:", finalRawSeconds);
    console.log("active_session_seconds:", finalActiveSeconds);
    console.log("idle_deducted_seconds:", finalIdleSeconds);
    console.log(
      "RAW segments:",
      (rawSegmentsRef.current || []).map((s, i) => ({
        i: i + 1,
        startAt: new Date(s.startAt).toISOString(),
        endAt: new Date(s.endAt).toISOString(),
        seconds: Math.floor((new Date(s.endAt) - new Date(s.startAt)) / 1000),
      }))
    );
    console.log(
      "ACTIVE segments (adjusted):",
      (segmentsRef.current || []).map((s, i) => ({
        i: i + 1,
        startAt: new Date(s.startAt).toISOString(),
        endAt: new Date(s.endAt).toISOString(),
        seconds: Math.floor((new Date(s.endAt) - new Date(s.startAt)) / 1000),
      }))
    );
    console.log("----------------------------------------------------------");

    // ✅ Build rows using RAW start/end, and include active_seconds/tracked_seconds
    const rawSegs = rawSegmentsRef.current || [];
    const actSegs = segmentsRef.current || [];

    const rows = [];
    for (let i = 0; i < rawSegs.length; i++) {
      const raw = rawSegs[i];
      const act = actSegs[i];

      const rawSt = raw?.startAt ? new Date(raw.startAt).getTime() : 0;
      const rawEn = raw?.endAt ? new Date(raw.endAt).getTime() : 0;
      if (!rawSt || !rawEn || rawEn <= rawSt) continue;

      const window_seconds = Math.floor((rawEn - rawSt) / 1000);

      let active_seconds = window_seconds;
      const actSt = act?.startAt ? new Date(act.startAt).getTime() : 0;
      const actEn = act?.endAt ? new Date(act.endAt).getTime() : 0;
      if (actSt && actEn && actEn > actSt) {
        active_seconds = Math.floor((actEn - actSt) / 1000);
      }
      active_seconds = Math.max(0, Math.min(active_seconds, window_seconds));
      const idle_seconds = Math.max(0, window_seconds - active_seconds);

      rows.push({
        task_id: Number(getTaskId(theTask)),
        project_id: Number(theTask.project_id),
        developer_id: developerId || null,
        work_date: formatDateYMD(new Date(rawSt)),
        task_start: toIsoNoMs(new Date(rawSt)), // RAW
        task_end: toIsoNoMs(new Date(rawEn)),   // RAW
        tenant_id: tenant_id_local || null,
        user_tz,
        user_offset_minutes,

        window_seconds,
        active_seconds,
        idle_seconds,
        tracked_seconds: active_seconds, // ✅ this is what you said you need
      });
    }

    if (rows.length === 0) {
      if (!silentAutoSubmit) {
        showToast(t("toast.noTimeCaptured", { defaultValue: "No time captured. Please Start first." }));
      }
      return;
    }

    const bodyToSend = rows.length === 1 ? rows[0] : rows;

    try {
      const ttRes = await fetch(`${API_BASE}/api/time-tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bodyToSend),
      });

      const ttData = await ttRes.json().catch(() => ({}));
      if (!ttRes.ok) {
        draft.persistDraft(true, { reason: "submit_failed" });
        if (!silentAutoSubmit) {
          showToast(
            ttData?.error ||
              t("toast.submitFailed", { defaultValue: "Failed to submit time tracking." })
          );
          setShowFinishConfirm(true);
        }
        return;
      }

      // ✅ Update task last_timing using ACTIVE seconds
      const baseSeconds = toSeconds(theTask?.last_timing);
      const segSecondsActive = (segmentsRef.current || []).reduce((acc, s) => {
        const st = s?.startAt ? new Date(s.startAt).getTime() : 0;
        const en = s?.endAt ? new Date(s.endAt).getTime() : 0;
        if (st && en && en > st) return acc + Math.floor((en - st) / 1000);
        return acc;
      }, 0);

      const totalSeconds = Math.max(
        0,
        Math.floor(Math.max(elapsedSecondsRef.current, baseSeconds + segSecondsActive))
      );

      await fetch(`${API_BASE}/api/tasks/task-update/${selectedTaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          taskId: selectedTaskId,
          last_timing: totalSeconds,
        }),
      }).catch(() => {});

      await updateTaskFlagger(selectedTaskId, 0);

      if (!silentAutoSubmit) {
        showToast(t("toast.timeSaved", { defaultValue: "Time tracking saved!" }));
      }

      // clear session buffers
      segmentsRef.current = [];
      rawSegmentsRef.current = [];
      draft.clearDraft();

      setIsCapturing(false);
      setIsPaused(false);

      if (!silentAutoSubmit) setTimeout(() => window.location.reload(), 300000);
    } catch (err) {
      draft.persistDraft(true, { reason: "submit_network_error" });
      if (!silentAutoSubmit) {
        showToast(
          t("toast.submitNetworkError", { defaultValue: "Network error submitting time tracking." })
        );
      }
    } finally {
      setSelectedTaskId("");
      setSelectedTaskName("");
      setElapsedSeconds(0);

      segmentsRef.current = [];
      rawSegmentsRef.current = [];

      setSelectedProjectId("");

      setSessionWindowStart(null);
      setSessionWindowEnd(null);
    }
  };

  // Quit / Logout
  const handleQuit = () => setShowQuitConfirm(true);
  const confirmQuit = () => {
    if (isCapturing) handlePause();
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((tt) => tt.stop());
      } catch {}
      streamRef.current = null;
    }
    setShowQuitConfirm(false);
    window.history.back();
  };
  const cancelQuit = () => setShowQuitConfirm(false);

  const handleRequestLogout = () => {
    if (isCapturing || isPaused) return;
    setShowLogoutConfirm(true);
  };
  const cancelLogout = () => setShowLogoutConfirm(false);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/logout`, { method: "POST", credentials: "include" }).catch(() => {});
      localStorage.removeItem("user_id");
      localStorage.removeItem("auth_name");
      localStorage.removeItem("user_name");
      localStorage.removeItem("user_role");
      localStorage.removeItem("tenant_id");
      try {
        await window.electronAPI?.clearTokenCookie?.();
      } catch {}
      window.location.assign("/login");
    } catch {
      window.location.assign("/login");
    }
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    if (isCapturing) handlePause();
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((tt) => tt.stop());
      } catch {}
      streamRef.current = null;
    }
    await handleLogout();
  };

  const sections = useMemo(
    () => [
      { key: "dashboard", labelKey: "sidebar.dashboard" },
      {
        key: "tasks",
        labelKey: "sidebar.tasks",
        children: [{ key: "create-task", labelKey: "sidebar.createTask", action: "create-task" }],
      },
      { key: "settings", labelKey: "sidebar.settings" },
    ],
    []
  );

  return (
    <div className="app-shell">
      <div className={`sb-wrap ${sidebarCollapsed ? "collapsed" : "expanded"}`}>
        <div className="sb-content">
          {!sidebarCollapsed && (
            <Sidebar
              sections={sections}
              activeKey={activeSection}
              onSelect={(k) => setActiveSection(k)}
              onCreateTask={() => setAddTaskOpen(true)}
              onLogout={handleRequestLogout}
              logoutDisabled={isCapturing || isPaused}
            />
          )}
        </div>

        <div className="sb-rail">
          <button
            type="button"
            className="sb-toggle"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label="Toggle Sidebar"
            title={sidebarCollapsed ? "Expand" : "Collapse"}
          >
            {sidebarCollapsed ? "☰" : "«"}
          </button>
        </div>
      </div>

      <main className="app-main">
        <ConfirmDialog
          open={showFinishConfirm}
          title={t("confirm.taskFinished.title", { defaultValue: "Task Finished" })}
          subtitle={t("confirm.taskFinished.subtitle", {
            defaultValue: "Your task has been completed and saved.",
          })}
          cancelText={t("confirm.cancel", { defaultValue: "Cancel" })}
          okText={t("confirm.ok", { defaultValue: "OK" })}
          onCancel={() => setShowFinishConfirm(false)}
          onConfirm={() => {
            setShowFinishConfirm(false);
            window.location.reload();
          }}
        />

        <ConfirmDialog
          open={showQuitConfirm}
          title={t("confirm.quit.title", { defaultValue: "Quit session?" })}
          subtitle={
            isCapturing
              ? t("confirm.quit.subtitleRunning", {
                  defaultValue:
                    "Capture is currently running. We’ll stop it and discard the current cycle.",
                })
              : ""
          }
          cancelText={t("confirm.cancel", { defaultValue: "Cancel" })}
          okText={t("confirm.ok", { defaultValue: "OK" })}
          onCancel={cancelQuit}
          onConfirm={confirmQuit}
        />

        <ConfirmDialog
          open={showLogoutConfirm}
          title={t("confirm.logout.title", { defaultValue: "Log out?" })}
          subtitle={
            isCapturing
              ? t("confirm.logout.subtitleRunning", {
                  defaultValue: "Capture is currently running. We’ll stop it before logging out.",
                })
              : ""
          }
          cancelText={t("confirm.cancel", { defaultValue: "Cancel" })}
          okText={t("confirm.ok", { defaultValue: "OK" })}
          onCancel={cancelLogout}
          onConfirm={confirmLogout}
        />

        <ConfirmDialog
          open={idle.idleWarningOpen}
          title={t("idle.title", { defaultValue: "You are idle" })}
          subtitle={t("idle.subtitle", {
            defaultValue: `You have been idle for ${formatTime(idle.idleWarningSeconds)}.`,
          })}
          cancelText={t("confirm.I was in a break", { defaultValue: "I was in a break" })}
          onCancel={handleIdleWasBreak}
          okText={t("confirm.I was working", { defaultValue: "I was working" })}
          onConfirm={handleIdleWasWorking}
        />

        <DashboardHeader t={t} user_name={user_name} getRoleLower={getRoleLower} />

        <section className="dashboard-grid">
          <div className="dg-left">
            <div className="summary-row">
              <div className="summary-card">
                <span className="summary-label">
                  {t("dashboard.summary.status.label", { defaultValue: "Current Status" })}
                </span>
                <span className="summary-value status-running">
                  {isCapturing
                    ? t("dashboard.summary.status.recording", { defaultValue: "Recording" })
                    : isPaused
                    ? t("dashboard.summary.status.paused", { defaultValue: "Paused" })
                    : t("dashboard.summary.status.idle", { defaultValue: "Idle" })}
                </span>
                <span className="summary-sub">
                  {t("dashboard.summary.status.sub", { defaultValue: "Live capture with idle detection" })}
                </span>
              </div>

              {/* Existing total counter */}
              <div className="summary-card">
                <span className="summary-label">
                  {t("dashboard.summary.today.label", { defaultValue: "Today's Time" })}
                </span>
                <span className="summary-value">{formatTime(elapsedSeconds)}</span>
                <span className="summary-sub">
                  {t("dashboard.summary.today.sub", { defaultValue: "Session duration" })}
                </span>
              </div>

              {/* NEW: Actual window (RAW) + Active/Idle */}
              <div className="summary-card">
                <span className="summary-label">Session (Actual Window)</span>
                <span className="summary-value">
                  {sessionWindowStart ? formatClock(sessionWindowStart) : "--"} →{" "}
                  {sessionWindowEnd ? formatClock(sessionWindowEnd) : isCapturing ? formatClock(new Date(uiNowMs)) : "--"}
                </span>
                <span className="summary-sub">
                  Active: {formatTime(activeSessionSeconds)} | Idle deducted: {formatTime(idleSessionSeconds)}
                </span>
              </div>
            </div>

            <WorkContextCard
              t={t}
              projects={projects}
              filteredTasks={filteredTasks}
              selectedProjectId={selectedProjectId}
              selectedTaskId={selectedTaskId}
              handleProjectFilterChange={handleProjectFilterChange}
              handleTaskChange={handleTaskChange}
              isCapturing={isCapturing}
              isPaused={isPaused}
              blockSelections={blockSelections}
              approvalLoading={approvalLoading}
              isFreelancer={isFreelancer}
              approvalStatus={approvalStatus}
            />

            <SessionControlsCard
              t={t}
              isCapturing={isCapturing}
              isPaused={isPaused}
              approvalLoading={approvalLoading}
              isFreelancer={isFreelancer}
              approvalStatus={approvalStatus}
              handleStart={handleStart}
              handlePause={handlePause}
              handleResume={handleResume}
              handleFinish={handleFinish}
              elapsedSeconds={elapsedSeconds}
              formatTime={formatTime}
            />
          </div>

          <div className="dg-right">
            <LivePreviewCard t={t} previewRef={previewRef} />
          </div>
        </section>

        <AddTaskModal
          open={addTaskOpen}
          onClose={(didSave) => {
            setAddTaskOpen(false);
            if (didSave) fetchTasks();
          }}
          projects={projects}
          curruser={currUser}
          allusers={allUsers}
        />
      </main>
    </div>
  );
};

export default ScreenshotApp;
