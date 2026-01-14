import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import "../styles/screenshotapp.css";

import Sidebar from "../components/Sidebar";
import AddTaskModal from "../components/AddTaskModal";

import ConfirmDialog from "../ui/ConfirmDialog"; // Modal component
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
const [activityLog, setActivityLog] = useState([]);
const [browserHistory, setBrowserHistory] = useState([]);
const [siteTimeLogs, setSiteTimeLogs] = useState([]);
  // ✅ NEW: profiles + selected profile
  const [chromeProfiles, setChromeProfiles] = useState([]);
  const [selectedChromeProfile, setSelectedChromeProfile] = useState("Default");

  const streamRef = useRef(null); // preserved (your original quit/logout logic used it)

  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const isCapturingRef = useRef(false);
  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  // Log and fetch browser activity + history (with profile selection)
  useEffect(() => {
    let alive = true;

    const init = async () => {
      try {
        // ✅ 1) load profiles
        const profiles = await window.electronAPI.listChromeProfiles();
        if (!alive) return;

        const list = Array.isArray(profiles) ? profiles : [];
        setChromeProfiles(list);

        const initialProfile = list.includes("Default")
          ? "Default"
          : list.length > 0
          ? list[0]
          : "Default";

        setSelectedChromeProfile(initialProfile);

        // ✅ 2) load history for initial profile
        const historyData = await window.electronAPI.fetchBrowserHistory({
          profileDir: initialProfile,
          dbLimit: 2000,
          resultLimit: 20,
          uniqueByTitle: true,
          excludeJunk: true,
        });

        if (!alive) return;
        setBrowserHistory(Array.isArray(historyData) ? historyData : []);
      } catch (e) {
        if (!alive) return;
        setChromeProfiles([]);
        setSelectedChromeProfile("Default");
        setBrowserHistory([]);
      }
    };

    init();

    // 3) Track activity (unchanged logic)
    window.electronAPI.trackBrowserActivity().then((log) => {
      if (!alive) return;
      if (log && Array.isArray(log)) {
        const flatLog = log.flat();
        const uniqueNames = [...new Set(flatLog.map((item) => item.browser))];
        const uniqueRecords = uniqueNames
          .map((name) => flatLog.find((item) => item.browser === name))
          .filter(Boolean);

        setActivityLog(uniqueRecords);
      }
    });
    // ✅ NEW: fetch real time spent per website
window.electronAPI.getActiveTimeLogs().then((logs) => {
  if (!alive) return;
  setSiteTimeLogs(Array.isArray(logs) ? logs : []);
});

    return () => {
      alive = false;
    };
  }, []);

  const handleChromeProfileChange = async (e) => {
    const profile = e.target.value;
    setSelectedChromeProfile(profile);

    const historyData = await window.electronAPI.fetchBrowserHistory({
      profileDir: profile,
      dbLimit: 2000,
      resultLimit: 20,
      uniqueByTitle: true,
      excludeJunk: true,
    });

    setBrowserHistory(Array.isArray(historyData) ? historyData : []);
  };

  const { elapsedSeconds, setElapsedSeconds, elapsedSecondsRef } =
    useElapsedSeconds();
  const { startTimer, stopTimer } = useSessionTimer(setElapsedSeconds);

  const idle = useIdleSampling();

  // DATA
  const API_BASE = process.env.REACT_APP_API_BASE;
  const { taskData, projects, currUser, allUsers, fetchTasks } =
    useAppData(API_BASE);

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

  useEffect(() => {
    const isUrgentOpen =
      showFinishConfirm ||
      showQuitConfirm ||
      showLogoutConfirm ||
      idle.idleWarningOpen;

    // only run inside Electron
    if (!window?.electronAPI?.urgentShow || !window?.electronAPI?.urgentClear)
      return;

    if (isUrgentOpen) {
      window.electronAPI.urgentShow();
    } else {
      window.electronAPI.urgentClear();
    }
  }, [
    showFinishConfirm,
    showQuitConfirm,
    showLogoutConfirm,
    idle.idleWarningOpen,
  ]);

  // -----------------------------
  // ACTIVE segments (deductions applied)
  // -----------------------------
  const startAtRef = useRef(null);
  const segmentsRef = useRef([]);

  // -----------------------------
  // RAW segments (no deductions) -> actual click window
  // -----------------------------
  const rawStartAtRef = useRef(null);
  const rawSegmentsRef = useRef([]);

  // UI display actual window
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
  const pad2 = (n) => String(n).padStart(2, "0");

  const formatTime = (total) => {
    const s = Math.max(0, Math.floor(total || 0));
    const hh = pad2(Math.floor(s / 3600));
    const mm = pad2(Math.floor((s % 3600) / 60));
    const ss = pad2(s % 60);
    return `${hh}:${mm}:${ss}`;
  };

  const toSeconds = (val) => {
    if (val === null || val === undefined) return 0;
    const n = parseInt(String(val).trim(), 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  const formatDateYMD = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(
      dt.getDate()
    )}`;
  };

  const toIsoNoMs = (d) =>
    (d instanceof Date ? d : new Date(d))
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

  const getUserTz = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const getUserOffsetMinutes = () => new Date().getTimezoneOffset();

  // REAL-TIME CLOCK like 4.41.21
  const formatClock = (d = new Date()) => {
    let h = d.getHours();
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}.${pad2(d.getMinutes())}.${pad2(d.getSeconds())}`;
  };

  const logClockAt = (label, atDate, extra = {}) => {
    const d = atDate instanceof Date ? atDate : new Date();
    console.log(
      `⏱️ ${label} @ ${formatClock(
        d
      )} | iso=${d.toISOString()} | tz=${getUserTz()} | offsetMin=${getUserOffsetMinutes()}`,
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

  const secondsBetween = (a, b) => {
    const st = a ? new Date(a).getTime() : 0;
    const en = b ? new Date(b).getTime() : 0;
    if (!st || !en || en <= st) return 0;
    return Math.floor((en - st) / 1000);
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

  // UI (current session only)
  const activeSessionSeconds = useMemo(() => {
    const now = new Date(uiNowMs);
    return calcSecondsFrom(segmentsRef.current, startAtRef.current, now);
  }, [uiNowMs]);

  const rawSessionSeconds = useMemo(() => {
    const now = new Date(uiNowMs);
    return calcSecondsFrom(rawSegmentsRef.current, rawStartAtRef.current, now);
  }, [uiNowMs]);

  const idleSessionSeconds = Math.max(
    0,
    rawSessionSeconds - activeSessionSeconds
  );

  const buildSegmentBreakdown = (rawSegs = [], activeSegs = []) => {
    const count = Math.max(rawSegs.length, activeSegs.length);

    const perSegment = [];
    let rawTotal = 0;
    let activeTotal = 0;

    for (let i = 0; i < count; i++) {
      const r = rawSegs[i] || null;
      const a = activeSegs[i] || null;

      const rawStart = r?.startAt ? new Date(r.startAt) : null;
      const rawEnd = r?.endAt ? new Date(r.endAt) : null;

      const activeStart = a?.startAt ? new Date(a.startAt) : null;
      const activeEnd = a?.endAt ? new Date(a.endAt) : null;

      const rawSec = rawStart && rawEnd ? secondsBetween(rawStart, rawEnd) : 0;
      const activeSec =
        activeStart && activeEnd ? secondsBetween(activeStart, activeEnd) : 0;

      const idleSec = Math.max(0, rawSec - activeSec);

      rawTotal += rawSec;
      activeTotal += activeSec;

      perSegment.push({
        segment_index: i + 1,
        raw_task_start: rawStart ? rawStart.toISOString() : null,
        raw_task_end: rawEnd ? rawEnd.toISOString() : null,
        task_start: activeStart ? activeStart.toISOString() : null,
        task_end: activeEnd ? activeEnd.toISOString() : null,
        raw_seconds: rawSec,
        active_seconds: activeSec,
        idle_deducted_seconds: idleSec,
      });
    }

    return {
      perSegment,
      raw_session_seconds: rawTotal,
      active_session_seconds: activeTotal,
      idle_deducted_seconds: Math.max(0, rawTotal - activeTotal),
    };
  };

  const logSegmentBreakdown = (label, breakdown) => {
    console.log(`✅ ${label} -------------------`);
    console.log("raw_session_seconds:", breakdown.raw_session_seconds);
    console.log("active_session_seconds:", breakdown.active_session_seconds);
    console.log("idle_deducted_seconds:", breakdown.idle_deducted_seconds);
    console.table(
      (breakdown.perSegment || []).map((x) => ({
        segment_index: x.segment_index,
        raw_task_start: x.raw_task_start,
        raw_task_end: x.raw_task_end,
        active_task_start: x.task_start,
        active_task_end: x.task_end,
        raw_seconds: x.raw_seconds,
        active_seconds: x.active_seconds,
        idle_deducted_seconds: x.idle_deducted_seconds,
      }))
    );
    console.log("---------------------------------------");
  };

  const handleIdleWasWorking = () => {
    idle.confirmIdleDialog();
  };

  const handleIdleWasBreak = () => {
    const deductionSeconds = idle.idleWarningSeconds || 0;
    const now = new Date();

    // ✅ adjust ACTIVE start only (RAW stays intact)
    if (startAtRef.current) {
      const candidate = new Date(
        startAtRef.current.getTime() + deductionSeconds * 1000
      );
      // never allow startAt > now
      startAtRef.current = candidate > now ? now : candidate;
    }

    // ✅ reduce active counter
    if (elapsedSecondsRef.current) {
      elapsedSecondsRef.current = Math.max(
        0,
        elapsedSecondsRef.current - deductionSeconds
      );
    }

    idle.confirmIdleDialog();
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

  // ✅ NEW: on refresh/close - clear flagger with keepalive
  const clearTaskFlaggerKeepAlive = useCallback(
    (taskIdToClear) => {
      if (!taskIdToClear && taskIdToClear !== 0 && taskIdToClear !== "0")
        return;

      try {
        fetch(`${API_BASE}/api/tasks/task-flagger`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "include",
          keepalive: true,
          body: JSON.stringify({
            user_id: Number(user_id),
            edit_task_id: Number(taskIdToClear),
            flagger: 0,
          }),
        }).catch(() => {});
      } catch {}
    },
    [API_BASE, user_id]
  );

  // ✅ NEW: refresh/close handler
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!selectedTaskId) return;
      clearTaskFlaggerKeepAlive(selectedTaskId);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [selectedTaskId, clearTaskFlaggerKeepAlive]);

  // preview setup
  useScreenPreview({ previewRef, videoRef, streamsRef });

  // capture implementation
  const evaluateAndCapture = useCallback(async () => {
    const videoElements = videoRef.current;
    if (!videoElements || videoElements.length < 2) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const width = videoElements[0].videoWidth + videoElements[1].videoWidth;
    const height = Math.max(
      videoElements[0].videoHeight,
      videoElements[1].videoHeight
    );

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(
      videoElements[0],
      0,
      0,
      videoElements[0].videoWidth,
      videoElements[0].videoHeight
    );
    ctx.drawImage(
      videoElements[1],
      videoElements[0].videoWidth,
      0,
      videoElements[1].videoWidth,
      videoElements[1].videoHeight
    );

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
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

  // draft manager
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
    isCapturingRef,

    rawSegmentsRef,
    rawStartAtRef,

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
    return taskData.filter(
      (tt) => String(tt.project_id) === String(selectedProjectId)
    );
  }, [taskData, selectedProjectId]);

  // ✅ IMPORTANT FIX: do NOT wipe restored draft before taskData loads
  // ✅ ALSO: if selected task is no longer present after filtering -> set flagger(0)
  useEffect(() => {
    if (!taskData || taskData.length === 0) return;

    if (
      selectedTaskId &&
      !filteredTasks.some(
        (tt) => String(getTaskId(tt)) === String(selectedTaskId)
      )
    ) {
      // ✅ NEW: clear flagger when selection becomes invalid
      updateTaskFlagger(selectedTaskId, 0);

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
  }, [taskData, filteredTasks, selectedTaskId, setElapsedSeconds]);

  // Selecting a task MUST NOT save/update time. UI only.
  // ✅ NEW: when user chooses blank "Select Task" again -> updateflagger(prev,0) already happens
  const handleTaskChange = (e) => {
    if (blockSelections) {
      showToast(
        t("toast.approvalBlock", {
          defaultValue: "Let Admin approve previous Payments before",
        })
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

    // ✅ Always clear previous selection flagger
    if (prevId) updateTaskFlagger(prevId, 0);
    draft.clearDraft();

    // ✅ If user clicked "Select Task" (blank) -> stop here (flagger already cleared)
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
        t("toast.approvalBlock", {
          defaultValue: "Let Admin approve previous Payments before",
        })
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
          t("toast.approvalBlock", {
            defaultValue: "Let Admin approve previous Payments before",
          })
        );
        return;
      }
    }

    if (!selectedTaskId) {
      showToast(
        t("toast.selectTaskFirst", {
          defaultValue: "⚠ Please select a task before starting!",
        })
      );
      return;
    }

    // set RAW + ACTIVE start at click-time
    startAtRef.current = clickedAt; // ACTIVE (adjustable)
    rawStartAtRef.current = clickedAt; // RAW (never adjusted)

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
        t("toast.approvalBlock", {
          defaultValue: "Let Admin approve previous Payments before",
        })
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

    if (selectedTaskId && segmentsRef.current.length > 0) {
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
          t("toast.approvalBlock", {
            defaultValue: "Let Admin approve previous Payments before",
          })
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
  // const handleFinish = async (opts = {}) => {
  //   const silentAutoSubmit = !!opts.silentAutoSubmit;
  //   const submitClickedAt = new Date();

  //   // close running segments using submit click time
  //   if (startAtRef.current) {
  //     segmentsRef.current.push({
  //       startAt: new Date(startAtRef.current),
  //       endAt: submitClickedAt,
  //     });
  //     startAtRef.current = null;
  //   }

  //   if (rawStartAtRef.current) {
  //     rawSegmentsRef.current.push({
  //       startAt: new Date(rawStartAtRef.current),
  //       endAt: submitClickedAt,
  //     });
  //     rawStartAtRef.current = null;
  //   }

  //   setSessionWindowEnd(submitClickedAt);

  //   logClockAt("SUBMIT clicked", submitClickedAt, {
  //     silentAutoSubmit,
  //     selectedTaskId,
  //     selectedProjectId,
  //     activeSegmentsCount: segmentsRef.current?.length || 0,
  //     rawSegmentsCount: rawSegmentsRef.current?.length || 0,
  //   });

  //   if (segmentsRef.current.length === 0) {
  //     if (!silentAutoSubmit) {
  //       showToast(
  //         t("toast.noTimeCaptured", {
  //           defaultValue: "No time captured. Please Start first.",
  //         })
  //       );
  //     }
  //     return;
  //   }

  //   setIsCapturing(false);
  //   setIsPaused(silentAutoSubmit ? false : true);
  //   stopTimer();
  //   idle.stopSampling();
  //   shots.stopScreenshotCycle();

  //   const theTask = taskData.find(
  //     (tt) => String(getTaskId(tt)) === String(selectedTaskId)
  //   );

  //   if (!theTask) {
  //     draft.persistDraft(true, { reason: "task_not_found" });
  //     if (!silentAutoSubmit) {
  //       showToast(
  //         t("toast.taskNotFound", { defaultValue: "Selected task not found." })
  //       );
  //     }
  //     return;
  //   }

  //   const developerId = Number(localStorage.getItem("user_id") || 0);
  //   const tenant_id_local = Number(localStorage.getItem("tenant_id") || 0);

  //   const user_tz = getUserTz();
  //   const user_offset_minutes = getUserOffsetMinutes();

  //   // ✅ breakdown + FINAL segment-wise console table
  //   const breakdown = buildSegmentBreakdown(
  //     rawSegmentsRef.current || [],
  //     segmentsRef.current || []
  //   );
  //   logSegmentBreakdown("FINAL (Segment-wise)", breakdown);

  //   // ✅ build micro-segment payload (same shape used by autosave)
  //   const segmentsToSend = (breakdown.perSegment || [])
  //     .filter((x) => x.task_start && x.task_end)
  //     .map((x) => ({
  //       task_id: Number(getTaskId(theTask)),
  //       project_id: Number(theTask.project_id),
  //       developer_id: developerId || null,
  //       work_date: formatDateYMD(x.raw_task_start || x.task_start),

  //       // ✅ ACTIVE start/end so backend duration = active
  //       task_start: toIsoNoMs(x.task_start),
  //       task_end: toIsoNoMs(x.task_end),

  //       // ✅ RAW click window for actual start/end
  //       raw_task_start: toIsoNoMs(x.raw_task_start || x.task_start),
  //       raw_task_end: toIsoNoMs(x.raw_task_end || x.task_end),

  //       raw_seconds: x.raw_seconds,
  //       active_seconds: x.active_seconds,
  //       idle_deducted_seconds: x.idle_deducted_seconds,
  //       segment_index: x.segment_index,

  //       tenant_id: tenant_id_local || null,
  //       user_tz,
  //       user_offset_minutes,
  //     }));

  //   if (segmentsToSend.length === 0) return;

  //   const bodyToSend =
  //     segmentsToSend.length === 1 ? segmentsToSend[0] : segmentsToSend;

  //   try {
  //     const ttRes = await fetch(`${API_BASE}/api/time-tracking`, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       credentials: "include",
  //       body: JSON.stringify(bodyToSend),
  //     });

  //     const ttData = await ttRes.json().catch(() => ({}));
  //     if (!ttRes.ok) {
  //       draft.persistDraft(true, { reason: "submit_failed" });
  //       if (!silentAutoSubmit) {
  //         showToast(
  //           ttData?.error ||
  //             t("toast.submitFailed", {
  //               defaultValue: "Failed to submit time tracking.",
  //             })
  //         );
  //         setShowFinishConfirm(true);
  //       }
  //       return;
  //     }

  //     // ✅ update last_timing using ACTIVE session seconds
  //     const baseSeconds = toSeconds(theTask?.last_timing);
  //     const totalSeconds = Math.max(
  //       0,
  //       Math.floor(
  //         Math.max(
  //           elapsedSecondsRef.current,
  //           baseSeconds + breakdown.active_session_seconds
  //         )
  //       )
  //     );

  //     await fetch(`${API_BASE}/api/tasks/task-update/${selectedTaskId}`, {
  //       method: "PUT",
  //       headers: { "Content-Type": "application/json" },
  //       credentials: "include",
  //       body: JSON.stringify({
  //         taskId: selectedTaskId,
  //         last_timing: totalSeconds,
  //       }),
  //     }).catch(() => {});

  //     await updateTaskFlagger(selectedTaskId, 0);

  //     if (!silentAutoSubmit) {
  //       showToast(
  //         t("toast.timeSaved", { defaultValue: "Time tracking saved!" })
  //       );
  //     }

  //     // clear session buffers
  //     segmentsRef.current = [];
  //     rawSegmentsRef.current = [];
  //     draft.clearDraft();

  //     setIsCapturing(false);
  //     setIsPaused(false);

  //     if (!silentAutoSubmit)
  //       setTimeout(() => window.location.reload(), 300000);
  //   } catch (err) {
  //     draft.persistDraft(true, { reason: "submit_network_error" });
  //     if (!silentAutoSubmit) {
  //       showToast(
  //         t("toast.submitNetworkError", {
  //           defaultValue: "Network error submitting time tracking.",
  //         })
  //       );
  //     }
  //   } finally {
  //     setSelectedTaskId("");
  //     setSelectedTaskName("");
  //     setElapsedSeconds(0);

  //     segmentsRef.current = [];
  //     rawSegmentsRef.current = [];

  //     setSelectedProjectId("");
  //     setSessionWindowStart(null);
  //     setSessionWindowEnd(null);
  //   }
  // };
  const handleFinish = async (opts = {}) => {
    const silentAutoSubmit = !!opts.silentAutoSubmit;
    const submitClickedAt = new Date();

    // close running segments using submit click time
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

    logClockAt("SUBMIT clicked", submitClickedAt, {
      silentAutoSubmit,
      selectedTaskId,
      selectedProjectId,
      activeSegmentsCount: segmentsRef.current?.length || 0,
      rawSegmentsCount: rawSegmentsRef.current?.length || 0,
    });

    if (segmentsRef.current.length === 0) {
      if (!silentAutoSubmit) {
        showToast(
          t("toast.noTimeCaptured", {
            defaultValue: "No time captured. Please Start first.",
          })
        );
      }
      return;
    }

    setIsCapturing(false);
    setIsPaused(silentAutoSubmit ? false : true);
    stopTimer();
    idle.stopSampling();
    shots.stopScreenshotCycle();

    const theTask = taskData.find(
      (tt) => String(getTaskId(tt)) === String(selectedTaskId)
    );

    if (!theTask) {
      draft.persistDraft(true, { reason: "task_not_found" });
      if (!silentAutoSubmit) {
        showToast(
          t("toast.taskNotFound", { defaultValue: "Selected task not found." })
        );
      }
      return;
    }

    const developerId = Number(localStorage.getItem("user_id") || 0);
    const tenant_id_local = Number(localStorage.getItem("tenant_id") || 0);

    const user_tz = getUserTz();
    const user_offset_minutes = getUserOffsetMinutes();

    // ✅ breakdown + FINAL segment-wise console table
    const breakdown = buildSegmentBreakdown(
      rawSegmentsRef.current || [],
      segmentsRef.current || []
    );
    logSegmentBreakdown("FINAL (Segment-wise)", breakdown);

    // ✅ build micro-segment payload (same shape used by autosave)
    const segmentsToSend = (breakdown.perSegment || [])
      .filter((x) => x.task_start && x.task_end)
      .map((x) => ({
        task_id: Number(getTaskId(theTask)),
        project_id: Number(theTask.project_id),
        developer_id: developerId || null,
        work_date: formatDateYMD(x.raw_task_start || x.task_start),

        // ✅ ACTIVE start/end so backend duration = active
        task_start: toIsoNoMs(x.task_start),
        task_end: toIsoNoMs(x.task_end),

        // ✅ RAW click window for actual start/end
        raw_task_start: toIsoNoMs(x.raw_task_start || x.task_start),
        raw_task_end: toIsoNoMs(x.raw_task_end || x.task_end),

        raw_seconds: x.raw_seconds,
        active_seconds: x.active_seconds,
        idle_deducted_seconds: x.idle_deducted_seconds,
        segment_index: x.segment_index,

        tenant_id: tenant_id_local || null,
        user_tz,
        user_offset_minutes,
      }));

    if (segmentsToSend.length === 0) return;

    const bodyToSend =
      segmentsToSend.length === 1 ? segmentsToSend[0] : segmentsToSend;

    try {
      // ✅ Submit the time tracking data to /api/time-tracking
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
              t("toast.submitFailed", {
                defaultValue: "Failed to submit time tracking.",
              })
          );
          setShowFinishConfirm(true);
        }
        return;
      }

      // ✅ Update the task's last_timing using ACTIVE session seconds
      const baseSeconds = toSeconds(theTask?.last_timing);
      const totalSeconds = Math.max(
        0,
        Math.floor(
          Math.max(
            elapsedSecondsRef.current,
            baseSeconds + breakdown.active_session_seconds
          )
        )
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
        showToast(
          t("toast.timeSaved", { defaultValue: "Time tracking saved!" })
        );
      }
      const currentDate = formatDateYMD(new Date());
      console.log("Current Date for Attendance Check:", currentDate);

      const existingAttendance = await fetch(
        `${API_BASE}/api/attendance?date=${currentDate}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        }
      );

      const existingData = await existingAttendance.json();
      console.log(
        "Existing Attendance Data:-------------------------------------",
        existingData
      );

      if (existingData?.rows?.length !== 0) {
        const attendanceRes = await fetch(`${API_BASE}/api/attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            tenant_id: tenant_id_local,
            user_id: developerId,
            attendance_day: `${formatDateYMD(currentDate)}T00:00:00Z`, // UTC midnight time
            status: "present", // Default status
            check_in_time: bodyToSend.task_start, // Using task_start as check_in_time
            check_out_time: bodyToSend.task_end, // Using task_end as check_out_time
            notes: "Submitted after Attendance", // Custom notes
            last_updated_by: developerId,
            user_role: localStorage.getItem("user_role") || "Developer",
          }),
        });
        const attendanceData = await attendanceRes.json().catch(() => ({}));
        if (!attendanceRes.ok) {
          draft.persistDraft(true, { reason: "attendance_submit_failed" });
          if (!silentAutoSubmit) {
            showToast(
              attendanceData?.error ||
                t("toast.submitAttendanceFailed", {
                  defaultValue: "Failed to submit attendance.",
                })
            );
            setShowFinishConfirm(true);
          }
          return;
        }

        // Clear session buffers
        segmentsRef.current = [];
        rawSegmentsRef.current = [];
        draft.clearDraft();

        setIsCapturing(false);
        setIsPaused(false);

        if (!silentAutoSubmit)
          setTimeout(() => window.location.reload(), 300000);
      } else {
        console.log("Attendance already recorded for this day.");
      }
    } catch (err) {
      draft.persistDraft(true, { reason: "submit_network_error" });
      if (!silentAutoSubmit) {
        showToast(
          t("toast.submitNetworkError", {
            defaultValue:
              "Network error submitting time tracking and attendance.",
          })
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
      await fetch(`${API_BASE}/api/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
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
        children: [
          {
            key: "create-task",
            labelKey: "sidebar.createTask",
            action: "create-task",
          },
        ],
      },
      { key: "settings", labelKey: "sidebar.settings" },
    ],
    []
  );

  console.log("Browser History State:", browserHistory);
  console.log("Activity Log State:", activityLog);

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
          title={t("confirm.taskFinished.title", {
            defaultValue: "Task Finished",
          })}
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
                  defaultValue:
                    "Capture is currently running. We’ll stop it before logging out.",
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
            defaultValue: `You have been idle for ${formatTime(
              idle.idleWarningSeconds
            )}.`,
          })}
          cancelText={t("confirm.I was in a break", {
            defaultValue: "I was in a break",
          })}
          onCancel={handleIdleWasBreak}
          okText={t("confirm.I was working", { defaultValue: "I was working" })}
          onConfirm={handleIdleWasWorking}
        />

        <DashboardHeader
          t={t}
          user_name={user_name}
          getRoleLower={getRoleLower}
        />

        <section className="dashboard-grid">
          <div className="dg-left">
            <div className="summary-row">
              <div className="summary-card">
                <span className="summary-label">
                  {t("dashboard.summary.status.label", {
                    defaultValue: "Current Status",
                  })}
                </span>
                <span className="summary-value status-running">
                  {isCapturing
                    ? t("dashboard.summary.status.recording", {
                        defaultValue: "Recording",
                      })
                    : isPaused
                    ? t("dashboard.summary.status.paused", {
                        defaultValue: "Paused",
                      })
                    : t("dashboard.summary.status.idle", {
                        defaultValue: "Idle",
                      })}
                </span>
                <span className="summary-sub">
                  {t("dashboard.summary.status.sub", {
                    defaultValue: "Live capture with idle detection",
                  })}
                </span>
              </div>

              <div className="summary-card">
                <span className="summary-label">
                  {t("dashboard.summary.today.label", {
                    defaultValue: "Today's Time",
                  })}
                </span>
                <span className="summary-value">
                  {formatTime(elapsedSeconds)}
                </span>
                <span className="summary-sub">
                  {t("dashboard.summary.today.sub", {
                    defaultValue: "Session duration",
                  })}
                </span>
              </div>

              <div className="summary-card">
                <span className="summary-label">Session (Actual Window)</span>
                <span className="summary-value">
                  {sessionWindowStart ? formatClock(sessionWindowStart) : "--"}{" "}
                  →{" "}
                  {sessionWindowEnd
                    ? formatClock(sessionWindowEnd)
                    : isCapturing
                    ? formatClock(new Date(uiNowMs))
                    : "--"}
                </span>
                <span className="summary-sub">
                  Active: {formatTime(activeSessionSeconds)} | Idle deducted:{" "}
                  {formatTime(idleSessionSeconds)}
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

        <div>
          <h1>Browser Activity</h1>
          <ul>
            {activityLog.map((log, index) => (
              <li key={index}>
                {log.browser} - {log.pid} - {log.time}
              </li>
            ))}
          </ul>

          <h2>Browser History</h2>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <label style={{ fontWeight: 600 }}>Chrome Profile:</label>
            <select
              value={selectedChromeProfile}
              onChange={handleChromeProfileChange}
            >
              {chromeProfiles.length === 0 ? (
                <option value="Default">Default</option>
              ) : (
                chromeProfiles.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))
              )}
            </select>
          </div>

<h2>Today’s Browser Usage</h2>

{browserHistory.length === 0 ? (
  <p style={{ opacity: 0.7 }}>No usage today</p>
) : (
  <ul>
    {browserHistory.map((item, i) => (
      <li key={i} style={{ marginBottom: 8 }}>
        <strong>{item.hostname}</strong>
        <span style={{ marginLeft: 8, opacity: 0.7 }}>
          — {item.visitTime}
        </span>
      </li>
    ))}
  </ul>
)}

<h2>Time Spent per Website</h2>

{siteTimeLogs.length === 0 ? (
  <p style={{ opacity: 0.7 }}>No activity yet</p>
) : (
  <ul>
    {siteTimeLogs.map((item, i) => (
      <li key={i} style={{ marginBottom: 8 }}>
        <strong>{item.hostname}</strong>
        <span style={{ marginLeft: 8, opacity: 0.7 }}>
          — {item.seconds}s
        </span>
      </li>
    ))}
  </ul>
)}
        </div>
      </main>
    </div>
  );
};

export default ScreenshotApp;
