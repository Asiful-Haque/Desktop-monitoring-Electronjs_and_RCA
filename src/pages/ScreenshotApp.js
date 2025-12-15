import React, { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import "../styles/screenshotapp.css";

/* Your components */
import Sidebar from "../components/Sidebar";
import AddTaskModal from "../components/AddTaskModal";
import LanguageSwitcher from "../components/LanguageSwitcher";

/* ---------- Minimal Confirm Dialog (kept inline) ---------- */
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
/* --------------------------------------------------------- */

const ScreenshotApp = () => {
  const { t } = useTranslation();

  // IMPORTANT: multiple video elements -> keep array ref
  const videoRef = useRef([]);
  const previewRef = useRef(null);

  // StrictMode-safe video setup guards + stream tracking
  const streamsRef = useRef([]);
  const setupOnceRef = useRef(false);

  const timerRef = useRef(null);
  const samplingRef = useRef(null);
  const captureIntervalRef = useRef(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // elapsed seconds in state + ref
  const [elapsedSeconds, _setElapsedSeconds] = useState(0);
  const elapsedSecondsRef = useRef(0);
  const setElapsedSeconds = (next) => {
    const val =
      typeof next === "function" ? next(elapsedSecondsRef.current) : next;
    const safe = Math.max(0, Math.floor(val || 0));
    elapsedSecondsRef.current = safe;
    _setElapsedSeconds(safe);
  };

  // DATA
  const [taskData, setTaskData] = useState([]);
  const [projects, setProjects] = useState([]);

  // SELECTIONS
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTaskName, setSelectedTaskName] = useState("");
  const [token, setToken] = useState(null);

  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Modal + data for modal
  const [currUser, setCurrUser] = useState(null);
  const [allUsers, setAllUsers] = useState({});
  const [activeSection, setActiveSection] = useState("dashboard");
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  // timing + segments
  const startAtRef = useRef(null);
  const segmentsRef = useRef([]);

  // idle + capture sampling
  const idleSecondsThisCycleRef = useRef(0);
  const secondsSampledRef = useRef(0);
  const streamRef = useRef(null);

  // full-session idle/active + continuous idle tracking
  const totalIdleSecondsRef = useRef(0);
  const totalActiveSecondsRef = useRef(0);
  const continuousIdleSecondsRef = useRef(0);
  const isCapturingRef = useRef(false);

  // idle warning popup
  const [idleWarningOpen, setIdleWarningOpen] = useState(false);
  const [idleWarningSeconds, setIdleWarningSeconds] = useState(0);

  // random screenshot scheduling
  const screenshotTimeoutsRef = useRef([]);
  const screenshotBlockIntervalRef = useRef(null);

  const user_id = localStorage.getItem("user_id");
  const user_name = localStorage.getItem("user_name");
  const tenant_id = localStorage.getItem("tenant_id");
  const API_BASE = process.env.REACT_APP_API_BASE;

  // =========================
  // LOCAL CRASH DRAFT
  // =========================
  const DRAFT_KEY = "taskData";
  const pendingAutoSubmitRef = useRef(false);

  // ✅ restored draft cached in-memory for login autosave
  const restoredDraftRef = useRef(null);
  const autoSavedDraftOnceRef = useRef(false);
  const shownAutoSavedToastRef = useRef(false);

  // network loss detection
  const lastOnlineRef = useRef(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const networkPollRef = useRef(null);
  const autoSaveRef = useRef(null);

  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  // ---- helpers ----
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
    (d instanceof Date ? d : new Date(d))
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

  const getUserTz = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const getUserOffsetMinutes = () => new Date().getTimezoneOffset();

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

  // ========= FREELANCER APPROVAL STATE =========
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState("");

  const approvalApiBase = `${API_BASE}/api/users`;

  const getRoleLower = () => {
    const fromUser = (
      currUser?.role ||
      currUser?.user_role ||
      currUser?.role_name ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();
    if (fromUser) return fromUser;

    return (localStorage.getItem("user_role") || "")
      .toString()
      .trim()
      .toLowerCase();
  };

  const isFreelancer = getRoleLower() === "freelancer";

  async function fetchApprovalStatus(uid) {
    try {
      setApprovalLoading(true);
      setApprovalError("");

      const res = await fetch(
        `${approvalApiBase}/Time-sheet-approval/getLatestValue`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ user_id: Number(uid) }),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || "Failed to fetch approval status");
      }

      const val = Number(json?.time_sheet_approval);
      const normalized = Number.isFinite(val) ? val : 0;
      setApprovalStatus(normalized === 1 ? 1 : normalized === 2 ? 2 : 0);
      return normalized === 0;
    } catch (e) {
      setApprovalError(e?.message || "Failed to fetch approval status");
      return false;
    } finally {
      setApprovalLoading(false);
    }
  }

  const blockSelections =
    isFreelancer && approvalStatus === 1 && !approvalLoading;

  // ---------- helper to update task flagger ----------
  // NOTE: this does NOT save time. It only marks a task as active in backend.
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

  // ✅ Save draft to localStorage (always ISO strings)
  const persistDraft = (forcePending = true, meta = {}) => {
    try {
      const stateToSave = {
        selectedTaskId,
        selectedTaskName,
        elapsedSeconds: elapsedSecondsRef.current,
        segments: (segmentsRef.current || []).map((s) => ({
          startAt: (
            s?.startAt instanceof Date ? s.startAt : new Date(s.startAt)
          ).toISOString(),
          endAt: (
            s?.endAt instanceof Date ? s.endAt : new Date(s.endAt)
          ).toISOString(),
        })),
        openStartAt: startAtRef.current
          ? (
              startAtRef.current instanceof Date
                ? startAtRef.current.toISOString()
                : new Date(startAtRef.current).toISOString()
            )
          : null,
        isCapturing,
        isPaused,
        pendingAutoSubmit: forcePending ? true : false,
        savedAt: new Date().toISOString(),
        ...meta,
      };

      localStorage.setItem(DRAFT_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error("persistDraft failed:", e);
    }
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    pendingAutoSubmitRef.current = false;
    restoredDraftRef.current = null;
  };

  const finalizeAndPersistOnClose = (reason = "close") => {
    try {
      if (isCapturingRef.current && startAtRef.current) {
        const end = new Date();
        segmentsRef.current.push({
          startAt: new Date(startAtRef.current),
          endAt: end,
        });
        startAtRef.current = null;
      }

      if (selectedTaskId && (segmentsRef.current || []).length > 0) {
        persistDraft(true, { reason });
      }
    } catch (e) {
      console.error("finalizeAndPersistOnClose failed:", e);
    }
  };

  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stopSampling = () => {
    clearInterval(samplingRef.current);
    samplingRef.current = null;
    idleSecondsThisCycleRef.current = 0;
    secondsSampledRef.current = 0;
    continuousIdleSecondsRef.current = 0;
  };

  const stopScreenshotCycle = () => {
    if (screenshotBlockIntervalRef.current) {
      clearInterval(screenshotBlockIntervalRef.current);
      screenshotBlockIntervalRef.current = null;
    }
    screenshotTimeoutsRef.current.forEach((id) => clearTimeout(id));
    screenshotTimeoutsRef.current = [];
  };

  const handleNetworkLoss = (reason = "offline") => {
    try {
      if (startAtRef.current) {
        segmentsRef.current.push({
          startAt: new Date(startAtRef.current),
          endAt: new Date(),
        });
        startAtRef.current = null;
      }

      if (isCapturingRef.current) {
        setIsCapturing(false);
        setIsPaused(false);
        stopTimer();
        stopSampling();
        stopScreenshotCycle();
      }

      if (selectedTaskId && (segmentsRef.current || []).length > 0) {
        persistDraft(true, { reason });
      }
    } catch (e) {
      console.error("handleNetworkLoss failed:", e);
    }
  };

  useEffect(() => {
    const onOffline = () => handleNetworkLoss("offline_event");
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, [selectedTaskId]);

  useEffect(() => {
    if (networkPollRef.current) clearInterval(networkPollRef.current);

    networkPollRef.current = setInterval(() => {
      const nowOnline =
        typeof navigator !== "undefined" ? navigator.onLine : true;
      if (lastOnlineRef.current && !nowOnline) {
        lastOnlineRef.current = nowOnline;
        handleNetworkLoss("poll_offline");
      } else {
        lastOnlineRef.current = nowOnline;
      }
    }, 3000);

    return () => {
      clearInterval(networkPollRef.current);
      networkPollRef.current = null;
    };
  }, [selectedTaskId]);

  useEffect(() => {
    if (autoSaveRef.current) {
      clearInterval(autoSaveRef.current);
      autoSaveRef.current = null;
    }

    if (isCapturing) {
      autoSaveRef.current = setInterval(() => {
        if (!selectedTaskId) return;
        persistDraft(true, { reason: "autosave" });
      }, 10000);
    }

    return () => {
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current);
        autoSaveRef.current = null;
      }
    };
  }, [isCapturing, selectedTaskId, selectedTaskName]);

  useEffect(() => {
    const onBeforeUnload = () => finalizeAndPersistOnClose("beforeunload");

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden")
        finalizeAndPersistOnClose("hidden");
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [selectedTaskId]);

  // ✅ Restore from localStorage on mount (NO API CALL here)
  useEffect(() => {
    const cachedData = localStorage.getItem(DRAFT_KEY);
    console.log("🎥🟢 We found some data in localStorage:", cachedData);

    if (!cachedData) return;

    try {
      const parsedData = JSON.parse(cachedData);

      if (parsedData && parsedData.selectedTaskId) {
        setSelectedTaskId(parsedData.selectedTaskId || "");
        setSelectedTaskName(parsedData.selectedTaskName || "");
        setElapsedSeconds(parsedData.elapsedSeconds || 0);

        const restoredSegments = (parsedData.segments || []).map((s) => ({
          startAt: new Date(s.startAt),
          endAt: new Date(s.endAt),
        }));

        if (
          parsedData.openStartAt &&
          parsedData.isCapturing &&
          !parsedData.isPaused &&
          parsedData.savedAt
        ) {
          restoredSegments.push({
            startAt: new Date(parsedData.openStartAt),
            endAt: new Date(parsedData.savedAt),
          });
        }

        segmentsRef.current = restoredSegments;
        pendingAutoSubmitRef.current = !!parsedData.pendingAutoSubmit;

        // store in ref so login autosave can use it once tasks load
        restoredDraftRef.current = {
          selectedTaskId: parsedData.selectedTaskId,
          selectedTaskName: parsedData.selectedTaskName || "",
          elapsedSeconds: Number(parsedData.elapsedSeconds || 0),
          savedAt: parsedData.savedAt || null,
        };

        setIsCapturing(false);
        setIsPaused(false);
      }
    } catch (e) {
      console.error("Failed to parse cachedData:", e);
    }
  }, []);

  // ✅ Initial data load
  useEffect(() => {
    window.electronAPI
      .getTokenCookie()
      .then((fetchedToken) => {
        if (fetchedToken) setToken(fetchedToken);
        fetchTasks();
        fetchProjects();
        fetchUsers();
      })
      .catch(() => {
        fetchTasks();
        fetchProjects();
        fetchUsers();
      });
  }, []);

  // ✅ fetch tasks
  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/tasks/${user_id}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) return [];
      if (!response.ok) throw new Error("Network response was not ok");

      const data = await response.json();
      const filteredTasks = Array.isArray(data?.tasks)
        ? data.tasks.filter(
            (task) => task.status !== "completed" && task.status !== "pending"
          )
        : [];

      setTaskData(filteredTasks);
      return filteredTasks;
    } catch (error) {
      console.error("Fetch tasks error:", error);
      return [];
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${user_id}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = await res.json();
      const raw = Array.isArray(data?.projects)
        ? data.projects
        : Array.isArray(data?.allprojects)
        ? data.allprojects
        : [];

      setProjects(
        raw.map((p) => ({
          project_id: p.project_id,
          project_name: p.project_name,
        }))
      );
    } catch (e) {
      console.error("Fetch projects error:", e);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = await res.json();
      setAllUsers(data?.users || []);

      const uid = localStorage.getItem("user_id");
      if (uid && Array.isArray(data?.users)) {
        const me =
          data.users.find((u) => String(u.user_id) === String(uid)) || null;
        setCurrUser(me);

        const resolvedRole = (
          me?.role ||
          me?.user_role ||
          me?.role_name ||
          ""
        )
          .toString()
          .trim();
        if (resolvedRole) localStorage.setItem("user_role", resolvedRole);
      }
    } catch (e) {
      console.error("Fetch users error:", e);
    }
  };

  // ✅ approval check
  useEffect(() => {
    if (!currUser?.user_id) return;
    const roleLower = getRoleLower();
    if (roleLower === "freelancer") {
      fetchApprovalStatus(currUser.user_id);
    } else {
      setApprovalStatus(null);
      setApprovalError("");
    }
  }, [
    currUser?.user_id,
    currUser?.role,
    currUser?.user_role,
    currUser?.role_name,
  ]);

  // ============================================================
  // ✅ ONLY ONE TIME SAVE: AUTO-SAVE DRAFT AT LOGIN, THEN RELOAD UI
  // - After this runs once, it clears the draft so it cannot run again.
  // - Selecting task will NEVER save time.
  // ============================================================
  useEffect(() => {
    const runLoginAutoSave = async () => {
      if (autoSavedDraftOnceRef.current) return;
      if (!taskData || taskData.length === 0) return;

      const draft = restoredDraftRef.current;
      if (!draft?.selectedTaskId) return;

      const serverTask = taskData.find(
        (tt) => String(getTaskId(tt)) === String(draft.selectedTaskId)
      );

      const draftSeconds = Number(draft.elapsedSeconds || 0);
      const serverSeconds = toSeconds(serverTask?.last_timing);

      const totalSeconds = Math.max(
        0,
        Math.floor(Math.max(draftSeconds, serverSeconds))
      );

      // keep UI accurate before reload
      if (draft.selectedTaskName && !selectedTaskName) {
        setSelectedTaskName(draft.selectedTaskName);
      } else if (serverTask?.task_name && !selectedTaskName) {
        setSelectedTaskName(serverTask.task_name);
      }
      if (totalSeconds !== elapsedSecondsRef.current)
        setElapsedSeconds(totalSeconds);

      try {
        // If task exists AND server < draft -> update server now
        if (serverTask && serverSeconds < totalSeconds) {
          const updateRes = await fetch(
            `${API_BASE}/api/tasks/task-update/${draft.selectedTaskId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                taskId: String(draft.selectedTaskId),
                last_timing: totalSeconds,
              }),
            }
          );

          if (!updateRes.ok) {
            const upd = await updateRes.json().catch(() => ({}));
            console.warn("Login auto-save task-update failed:", upd);
          }
        }

        autoSavedDraftOnceRef.current = true;

        if (!shownAutoSavedToastRef.current) {
          shownAutoSavedToastRef.current = true;
          showToast(
            t("toast.recoveredDraft", {
              defaultValue:
                "✅ Previous session time was saved automatically. Reloading…",
            })
          );
        }

        // ✅ IMPORTANT: clear draft so it won't auto-save again and won't re-restore
        clearDraft();

        // ✅ Reload so UI returns to first state
        setTimeout(() => window.location.reload(), 1200);
      } catch (e) {
        console.error("Login auto-save error:", e);
        autoSavedDraftOnceRef.current = true;
      }
    };

    runLoginAutoSave();
  }, [taskData, selectedTaskName, API_BASE, t]);

  // ----------------- FILTERED TASKS (Project -> Tasks) -----------------
  const filteredTasks = useMemo(() => {
    if (!selectedProjectId) return taskData;
    return taskData.filter(
      (tt) => String(tt.project_id) === String(selectedProjectId)
    );
  }, [taskData, selectedProjectId]);

  // ✅ If selected task disappears from filter
  useEffect(() => {
    if (
      selectedTaskId &&
      !filteredTasks.some(
        (tt) => String(getTaskId(tt)) === String(selectedTaskId)
      )
    ) {
      setSelectedTaskId("");
      setSelectedTaskName("");
      setElapsedSeconds(0);
    }
  }, [filteredTasks, selectedTaskId]);

  // ✅ IMPORTANT FIX:
  // Selecting a task MUST NOT save / update time.
  // It only updates UI (name + displayed elapsed from server taskData).
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

    // if re-select same task, do nothing
    if (String(newId) === String(selectedTaskId)) return;

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

  // ===========================
  // ✅ FIXED VIDEO STREAM (ALWAYS 2, NEVER 4)
  // ===========================
  useEffect(() => {
    let cancelled = false;

    const cleanupPreview = () => {
      // stop any tracks we started
      try {
        (streamsRef.current || []).forEach((s) => {
          try {
            s.getTracks().forEach((t) => t.stop());
          } catch {}
        });
      } catch {}
      streamsRef.current = [];

      // clear DOM
      const el = previewRef.current;
      if (el) el.innerHTML = "";

      // clear video refs
      videoRef.current = [];
    };

    const setupVideoStream = async () => {
      try {
        const container = previewRef.current;
        if (!container) return;

        // strict-mode safe: prevent double init on same mount
        if (setupOnceRef.current) return;
        setupOnceRef.current = true;

        // always start clean
        cleanupPreview();

        const sources = await window.electronAPI.getSources();
        if (!sources || sources.length < 2) return;

        const getStream = async (sourceId) => {
          return navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: sourceId,
              },
            },
          });
        };

        const stream1 = await getStream(sources[0].id);
        const stream2 = await getStream(sources[1].id);

        if (cancelled) {
          stream1.getTracks().forEach((t) => t.stop());
          stream2.getTracks().forEach((t) => t.stop());
          return;
        }

        streamsRef.current = [stream1, stream2];

        const mkVideo = (stream) => {
          const v = document.createElement("video");
          v.srcObject = stream;
          v.muted = true;
          v.playsInline = true;
          v.autoplay = true;
          v.style.width = "48%";
          v.style.height = "auto";
          v.style.objectFit = "contain";
          return v;
        };

        const video1 = mkVideo(stream1);
        const video2 = mkVideo(stream2);

        container.appendChild(video1);
        container.appendChild(video2);

        videoRef.current = [video1, video2];

        await Promise.allSettled([video1.play(), video2.play()]);
      } catch (err) {
        console.error("❌ Error setting up video stream:", err);
        // allow retry if something failed
        setupOnceRef.current = false;
        cleanupPreview();
      }
    };

    setupVideoStream();

    return () => {
      cancelled = true;
      cleanupPreview();
      setupOnceRef.current = false;
    };
  }, []);

  // timers/sampling/capture
  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(
      () => setElapsedSeconds((prev) => prev + 1),
      1000
    );
  };

  const startSampling = () => {
    if (samplingRef.current) return;
    samplingRef.current = setInterval(async () => {
      const idle = await window.electronAPI.getIdleTime();
      const isIdle = idle >= 1;

      secondsSampledRef.current++;

      if (isIdle) {
        idleSecondsThisCycleRef.current++;
        totalIdleSecondsRef.current++;
        continuousIdleSecondsRef.current++;
        setIdleWarningSeconds(continuousIdleSecondsRef.current);
        if (!idleWarningOpen && continuousIdleSecondsRef.current >= 10) {
          setIdleWarningOpen(true);
        }
      } else {
        totalActiveSecondsRef.current++;
        continuousIdleSecondsRef.current = 0;
      }
    }, 1000);
  };

  const evaluateAndCapture = async () => {
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
  };

  const scheduleRandomScreenshotsBlock = () => {
    const blockMs = 10 * 60 * 1000;
    const numShots = 5;
    const minGapMs = 30 * 1000;

    const offsets = [];

    for (let i = 0; i < numShots; i++) {
      let offset;
      let tries = 0;

      do {
        offset = Math.floor(Math.random() * blockMs);
        tries++;
      } while (
        offsets.some((o) => Math.abs(o - offset) < minGapMs) &&
        tries < 20
      );

      offsets.push(offset);
    }

    offsets.forEach((offset) => {
      const timeoutId = setTimeout(() => {
        if (!isCapturingRef.current) return;
        evaluateAndCapture();
      }, offset);
      screenshotTimeoutsRef.current.push(timeoutId);
    });
  };

  const startScreenshotCycle = () => {
    scheduleRandomScreenshotsBlock();
    screenshotBlockIntervalRef.current = setInterval(() => {
      if (!isCapturingRef.current) return;
      scheduleRandomScreenshotsBlock();
    }, 10 * 60 * 1000);
  };

  // === Start / Pause / Resume ===
  const handleStart = async () => {
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

    startAtRef.current = new Date();

    totalIdleSecondsRef.current = 0;
    totalActiveSecondsRef.current = 0;
    continuousIdleSecondsRef.current = 0;
    setIdleWarningSeconds(0);
    setIdleWarningOpen(false);

    if (!isCapturing) {
      setIsCapturing(true);
      setIsPaused(false);
      startTimer();
      startSampling();
      startScreenshotCycle();
    }
  };

  const handlePause = () => {
    if (isFreelancer && approvalStatus === 1) {
      showToast(
        t("toast.approvalBlock", {
          defaultValue: "Let Admin approve previous Payments before",
        })
      );
      return;
    }

    if (startAtRef.current) {
      segmentsRef.current.push({
        startAt: new Date(startAtRef.current),
        endAt: new Date(),
      });
      startAtRef.current = null;
    }

    setIsCapturing(false);
    setIsPaused(true);
    stopTimer();
    stopSampling();
    stopScreenshotCycle();

    if (selectedTaskId && segmentsRef.current.length > 0) {
      persistDraft(true);
    }
  };

  const handleResume = async () => {
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

    startAtRef.current = new Date();
    setIsCapturing(true);
    setIsPaused(false);
    startTimer();
    startSampling();
    startScreenshotCycle();
  };

  // SUBMIT
  const handleFinish = async (opts = {}) => {
    const silentAutoSubmit = !!opts.silentAutoSubmit;

    if (startAtRef.current) {
      segmentsRef.current.push({
        startAt: new Date(startAtRef.current),
        endAt: new Date(),
      });
      startAtRef.current = null;
    }

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
    stopSampling();
    stopScreenshotCycle();

    const theTask = taskData.find(
      (tt) => String(getTaskId(tt)) === String(selectedTaskId)
    );
    if (!theTask) {
      persistDraft(true, { reason: "task_not_found" });
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

    const rows = segmentsRef.current
      .filter((s) => s.startAt && s.endAt && s.endAt > s.startAt)
      .map((seg) => ({
        task_id: Number(getTaskId(theTask)),
        project_id: Number(theTask.project_id),
        developer_id: developerId || null,
        work_date: formatDateYMD(seg.startAt),
        task_start: toIsoNoMs(seg.startAt),
        task_end: toIsoNoMs(seg.endAt),
        tenant_id: tenant_id_local || null,
        user_tz,
        user_offset_minutes,
      }));

    if (rows.length === 0) return;
    const bodyToSend = rows.length === 1 ? rows[0] : rows;

    try {
      const ttRes = await fetch(`${API_BASE}/api/time-tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bodyToSend),
      });

      const ttData = await ttRes.json();
      if (!ttRes.ok) {
        persistDraft(true, { reason: "submit_failed" });
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

      // ✅ update task last_timing on finish
      const baseSeconds = toSeconds(theTask?.last_timing);
      const segSeconds = (segmentsRef.current || []).reduce((acc, s) => {
        const st = s?.startAt ? new Date(s.startAt).getTime() : 0;
        const en = s?.endAt ? new Date(s.endAt).getTime() : 0;
        if (st && en && en > st) return acc + Math.floor((en - st) / 1000);
        return acc;
      }, 0);

      const totalSeconds = Math.max(
        0,
        Math.floor(Math.max(elapsedSecondsRef.current, baseSeconds + segSeconds))
      );

      await fetch(`${API_BASE}/api/tasks/task-update/${selectedTaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ taskId: selectedTaskId, last_timing: totalSeconds }),
      }).catch(() => {});

      await updateTaskFlagger(selectedTaskId, 0);

      if (!silentAutoSubmit) {
        showToast(t("toast.timeSaved", { defaultValue: "Time tracking saved!" }));
      }

      segmentsRef.current = [];
      clearDraft();

      setIsCapturing(false);
      setIsPaused(false);

      if (!silentAutoSubmit) setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      persistDraft(true, { reason: "submit_network_error" });
      if (!silentAutoSubmit) {
        showToast(
          t("toast.submitNetworkError", {
            defaultValue: "Network error submitting time tracking.",
          })
        );
      }
    } finally {
      setSelectedTaskId("");
      setSelectedTaskName("");
      setElapsedSeconds(0);
      segmentsRef.current = [];
      setSelectedProjectId("");
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

  const handleIdleDialogConfirm = () => {
    continuousIdleSecondsRef.current = 0;
    setIdleWarningSeconds(0);
    setIdleWarningOpen(false);
  };

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
          subtitle={t("confirm.taskFinished.subtitle", { defaultValue: "Your task has been completed and saved." })}
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
          open={idleWarningOpen}
          title={t("idle.title", { defaultValue: "You are idle" })}
          subtitle={t("idle.subtitle", {
            defaultValue: `You have been idle for ${formatTime(idleWarningSeconds)}.`,
          })}
          cancelText={t("confirm.cancel", { defaultValue: "Cancel" })}
          okText={t("confirm.ok", { defaultValue: "OK" })}
          onCancel={handleIdleDialogConfirm}
          onConfirm={handleIdleDialogConfirm}
        />

        <header className="dashboard-header">
          <div className="dh-left">
            <h1 className="app-title">
              {t("dashboard.title", { defaultValue: "Time Capture Dashboard" })}
            </h1>
            <p className="app-subtitle">
              {t("dashboard.subtitle", {
                defaultValue:
                  "Track your work time with automatic screenshots and smart approvals.",
              })}
            </p>
          </div>

          <div className="dh-right">
            <LanguageSwitcher className="dh-lang" />
            <div className="user-pill">
              <div className="user-avatar">
                {(user_name || "U").charAt(0).toUpperCase()}
              </div>
              <div className="user-meta">
                <span className="user-name">
                  {user_name ||
                    t("dashboard.userFallback", { defaultValue: "User" })}
                </span>
                <span className="user-role">
                  {getRoleLower() ||
                    t("dashboard.roleFallback", {
                      defaultValue: "Team Member",
                    })}
                </span>
              </div>
            </div>
          </div>
        </header>

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
                <span className="summary-value">{formatTime(elapsedSeconds)}</span>
                <span className="summary-sub">
                  {t("dashboard.summary.today.sub", {
                    defaultValue: "Session duration",
                  })}
                </span>
              </div>
            </div>

            <div className="card card-filters">
              <div className="card-header">
                <h2 className="card-title">
                  {t("dashboard.workContext.title", {
                    defaultValue: "Work Context",
                  })}
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
                      disabled={
                        isCapturing ||
                        isPaused ||
                        blockSelections ||
                        approvalLoading
                      }
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
                      disabled={
                        isCapturing ||
                        isPaused ||
                        blockSelections ||
                        approvalLoading
                      }
                    >
                      <option value="">
                        {filteredTasks.length
                          ? t("dashboard.workContext.task.select", {
                              defaultValue: "Select Task",
                            })
                          : t("dashboard.workContext.task.none", {
                              defaultValue: "No tasks available",
                            })}
                      </option>
                      {filteredTasks.map((task) => {
                        const tid = getTaskId(task);
                        return (
                          <option key={tid} value={tid}>
                            {task.task_name}
                          </option>
                        );
                      })}
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

            <div className="card card-controls">
              <div className="card-header">
                <h2 className="card-title">
                  {t("dashboard.controls.title", {
                    defaultValue: "Session Controls",
                  })}
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
                      {t("dashboard.controls.start", {
                        defaultValue: "Start Recording",
                      })}
                    </button>
                  )}

                  <button
                    id="stopBtn"
                    className="btn-warning"
                    onClick={isPaused ? handleResume : handlePause}
                    disabled={
                      (!isPaused && isFreelancer && approvalStatus === 1) ||
                      false
                    }
                  >
                    {isPaused
                      ? t("dashboard.controls.resume", {
                          defaultValue: "Resume",
                        })
                      : t("dashboard.controls.pause", {
                          defaultValue: "Pause",
                        })}
                  </button>

                  <button
                    id="finishBtn"
                    className="btn-success"
                    onClick={() => handleFinish()}
                  >
                    {t("dashboard.controls.submit", {
                      defaultValue: "Submit Task",
                    })}
                  </button>
                </div>

                <div className="timer-chip">
                  <span className="timer-label">
                    {t("dashboard.controls.captureDuration", {
                      defaultValue: "Capture Duration",
                    })}
                  </span>
                  <span className="timer-value">{formatTime(elapsedSeconds)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="dg-right">
            <div className="card card-preview">
              <div className="card-header">
                <h2 className="card-title">
                  {t("dashboard.preview.title", {
                    defaultValue: "Live Screen Preview",
                  })}
                </h2>
                <span className="card-subtitle">
                  {t("dashboard.preview.subtitle", {
                    defaultValue:
                      "Screenshots are taken automatically when you're active.",
                  })}
                </span>
              </div>

              <div className="card-body preview-body" ref={previewRef} />
            </div>
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
